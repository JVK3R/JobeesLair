// sandbox-sweeper.elf: clears what a closed Jobee'sLair leaves behind in /mnt/sandbox, so ShadowMount+ can
// let go of the title. Added in 0.5.0 Pre Release 4; since 0.5.3 it clears within a second of the close, keeps
// going if the app opens again, and clears what earlier launches left as it starts.
//
// Why: each launch gets a sandbox folder, /mnt/sandbox/<TITLE>_NNN, which the system removes when the app
// closes. Jobee'sLair's are left behind with the console's alias of /data (nullfs from /user/data) still mounted
// in them. ShadowMount+ (sm_game_lifecycle.c) waits up to 10 s after a title closes for its sandbox folders to go
// before it releases the title's image, and if the title opens again in that time, the new launch and the old
// release wait on each other: ShadowMount+ stops following the app and keeps the image mounted, answering every
// unmount with EBUSY ("Device busy"), until it is restarted. Seen on the console 2026-10-25 with a close and a
// reopen 3 s apart. A game's folder goes the moment it closes, so ours has to go within a second too. Folders
// were also left until the next close by a crash (the app died before it sent this) and by a reopen (the
// previous version stopped as soon as the app opened again).
//
// The app sends this to the payload loader as it starts (state/sandbox-sweeper.js). It first clears the title's
// folders that no app runs from, then waits for the app to close and clears the folders there at that moment.
// Clearing a folder: unmount the aliases left in it (nullfs and unionfs only, newest first; a mount of any other
// kind is left alone), then rmdir its folders, deepest first, which only takes empty ones and never goes into a
// mount. It never deletes a file. It never touches a folder with app0 mounted in it (an app runs from it) or one
// made after it looked (the folder must still have the inode it noted).
//
// Request lines: "SWP1", the title ID. Answers "ready". Writes what it did to
// /data/ps5-react/<TITLE>/logs/sandbox.log.
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/param.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#ifndef SWEEPER_HOST_TEST
#include <sys/mount.h>
#endif

// Sandboxes looked at; more than this many is not expected.
#define MAX_SANDBOXES 32
// After the app's process ends, the system and ShadowMount+ take down their own mounts first.
#define SETTLE_MS 500
#define POLL_MS 250
// What is still left after 40 rounds, 20 s, waits for the next launch.
#define ROUNDS 40
#define ROUND_MS 500
#define MAX_DEPTH 8
#define MAX_ENTRIES 64
#define NAME_BYTES 256
// Aliases taken off one path in one go.
#define MAX_STACKED 256
// A sweeper from the previous launch lets go of the lock once it has cleared what it was clearing.
#define LOCK_TRIES 60
#define LOG_LIMIT (256 * 1024)

typedef struct {
  char type[32];
  char from[256];
  char on[256];
} mount_entry;

typedef struct {
  char name[64];
  dev_t device;
  ino_t inode;
  int done;
} sandbox_dir;

static char title[16];
static char log_path[512];

#ifdef SWEEPER_HOST_TEST
// tests/sandbox-sweeper.test.mjs runs this on the desktop. The sandbox folders are under $SWEEPER_TEST_ROOT
// and the log goes to $SWEEPER_TEST_STATE/sandbox.log. The title runs while $SWEEPER_TEST_STATE/running exists.
// The mount table is $SWEEPER_TEST_STATE/mounts, one "type<TAB>from<TAB>on[<TAB>stuck]" line per mount, oldest
// first; an unmount takes the newest line naming its path, unless that line is stuck. Waits are divided by
// $SWEEPER_TIME_SCALE.
static const char* state_dir(void) {
  const char* dir = getenv("SWEEPER_TEST_STATE");
  return dir ? dir : ".";
}
static const char* sandbox_root(void) {
  const char* dir = getenv("SWEEPER_TEST_ROOT");
  return dir ? dir : ".";
}
static int running(void) {
  char path[512];
  snprintf(path, sizeof path, "%s/running", state_dir());
  return access(path, F_OK) == 0;
}
static void pause_ms(int ms) {
  const char* scale = getenv("SWEEPER_TIME_SCALE");
  const int by = scale && atoi(scale) > 0 ? atoi(scale) : 1;
  usleep((useconds_t)(ms / by + 1) * 1000);
}
static void open_log(void) { snprintf(log_path, sizeof log_path, "%s/sandbox.log", state_dir()); }

// The table's lines, and whether each is stuck. Returns the count, or -1.
static int read_table(mount_entry** out, int** stuck_out) {
  char path[512];
  snprintf(path, sizeof path, "%s/mounts", state_dir());
  FILE* file = fopen(path, "r");
  *out = calloc(256, sizeof **out);
  *stuck_out = calloc(256, sizeof **stuck_out);
  if (!*out || !*stuck_out) {
    if (file) fclose(file);
    return -1;
  }
  int count = 0;
  char line[1024];
  while (file && count < 256 && fgets(line, sizeof line, file)) {
    line[strcspn(line, "\r\n")] = 0;
    char* fields[4] = {0};
    char* rest = line;
    for (int i = 0; i < 4 && rest; ++i) fields[i] = strsep(&rest, "\t");
    if (!fields[0] || !fields[1] || !fields[2]) continue;
    snprintf((*out)[count].type, sizeof (*out)[count].type, "%s", fields[0]);
    snprintf((*out)[count].from, sizeof (*out)[count].from, "%s", fields[1]);
    snprintf((*out)[count].on, sizeof (*out)[count].on, "%s", fields[2]);
    (*stuck_out)[count] = fields[3] && !strcmp(fields[3], "stuck");
    ++count;
  }
  if (file) fclose(file);
  return count;
}

static int list_mounts(mount_entry** out) {
  int* stuck = NULL;
  const int count = read_table(out, &stuck);
  free(stuck);
  return count;
}

static int unmount_path(const char* on, int force) {
  (void)force;
  mount_entry* table = NULL;
  int* stuck = NULL;
  const int count = read_table(&table, &stuck);
  int found = -1;
  for (int i = count - 1; i >= 0 && found < 0; --i) if (!strcmp(table[i].on, on)) found = i;
  int result = 0;
  if (found < 0) {
    errno = EINVAL;
    result = -1;
  } else if (stuck[found]) {
    errno = EBUSY;
    result = -1;
  } else {
    char path[512];
    snprintf(path, sizeof path, "%s/mounts", state_dir());
    FILE* file = fopen(path, "w");
    for (int i = 0; file && i < count; ++i)
      if (i != found) fprintf(file, "%s\t%s\t%s%s\n", table[i].type, table[i].from, table[i].on, stuck[i] ? "\tstuck" : "");
    if (file) fclose(file);
  }
  free(table);
  free(stuck);
  return result;
}

static int mounted_on(const char* path, const mount_entry* table, int count) {
  for (int i = 0; i < count; ++i) if (!strcmp(table[i].on, path)) return 1;
  return 0;
}

static int alias_at(const char* path) {
  mount_entry* table = NULL;
  const int count = list_mounts(&table);
  int found = 0;
  for (int i = 0; i < count; ++i)
    if (!strcmp(table[i].on, path) && (!strcmp(table[i].type, "nullfs") || !strcmp(table[i].type, "unionfs"))) found = 1;
  free(table);
  return found;
}
#else
int sceLncUtilGetAppId(const char* title_id);

static const char* sandbox_root(void) { return "/mnt/sandbox"; }
static int running(void) { return sceLncUtilGetAppId(title) >= 0; }
static void pause_ms(int ms) { usleep((useconds_t)ms * 1000); }
static void open_log(void) { snprintf(log_path, sizeof log_path, "/data/ps5-react/%s/logs/sandbox.log", title); }

// The mount table, oldest first. Returns the count, or -1.
static int list_mounts(mount_entry** out) {
  *out = NULL;
  int count = getfsstat(NULL, 0, MNT_NOWAIT);
  if (count < 0) return -1;
  const long capacity = count + 16;
  struct statfs* table = calloc((size_t)capacity, sizeof *table);
  *out = calloc((size_t)capacity, sizeof **out);
  if (!table || !*out) {
    free(table);
    return -1;
  }
  count = getfsstat(table, capacity * (long)sizeof *table, MNT_NOWAIT);
  if (count > capacity) count = (int)capacity;
  for (int i = 0; i < count; ++i) {
    snprintf((*out)[i].type, sizeof (*out)[i].type, "%.*s", (int)sizeof table[i].f_fstypename, table[i].f_fstypename);
    snprintf((*out)[i].from, sizeof (*out)[i].from, "%.*s", (int)sizeof table[i].f_mntfromname, table[i].f_mntfromname);
    snprintf((*out)[i].on, sizeof (*out)[i].on, "%.*s", (int)sizeof table[i].f_mntonname, table[i].f_mntonname);
  }
  free(table);
  return count;
}

static int unmount_path(const char* on, int force) { return unmount(on, force ? MNT_FORCE : 0); }

// In the table, or the path's own filesystem says it is mounted there. A path it cannot look at counts as mounted.
static int mounted_on(const char* path, const mount_entry* table, int count) {
  for (int i = 0; i < count; ++i) if (!strcmp(table[i].on, path)) return 1;
  struct statfs info;
  if (statfs(path, &info)) return errno != ENOENT;
  return !strncmp(info.f_mntonname, path, sizeof info.f_mntonname);
}

// An alias is still mounted on the path (the top one of a stack is what the path shows).
static int alias_at(const char* path) {
  struct statfs info;
  return statfs(path, &info) == 0 && !strncmp(info.f_mntonname, path, sizeof info.f_mntonname) &&
         (!strcmp(info.f_fstypename, "nullfs") || !strcmp(info.f_fstypename, "unionfs"));
}
#endif

// Lines in the run's log; past this many only the outcome is written.
static int note_budget = 400;

static void write_note(const char* format, va_list args) {
  struct stat info;
  FILE* file = fopen(log_path, stat(log_path, &info) == 0 && info.st_size > LOG_LIMIT ? "w" : "a");
  if (!file) return;
  time_t now = time(NULL);
  struct tm local;
  localtime_r(&now, &local);
  fprintf(file, "[%04d-%02d-%02d %02d:%02d:%02d] ", local.tm_year + 1900, local.tm_mon + 1, local.tm_mday,
          local.tm_hour, local.tm_min, local.tm_sec);
  vfprintf(file, format, args);
  fputc('\n', file);
  fclose(file);
}

static void note(const char* format, ...) {
  if (note_budget <= 0) return;
  --note_budget;
  va_list args;
  va_start(args, format);
  write_note(format, args);
  va_end(args);
}

// Always written: the outcome of a pass.
static void outcome(const char* format, ...) {
  va_list args;
  va_start(args, format);
  write_note(format, args);
  va_end(args);
}

static int read_line(char* line, size_t capacity) {
  size_t length = 0;
  for (;;) {
    char byte;
    if (read(STDIN_FILENO, &byte, 1) != 1) return 0;
    if (byte == '\n') { line[length] = 0; return 1; }
    if (length + 1 >= capacity) return 0;
    line[length++] = byte;
  }
}

static int valid_title(const char* id) {
  if (strlen(id) != 9) return 0;
  for (int i = 0; i < 4; ++i) if (id[i] < 'A' || id[i] > 'Z') return 0;
  for (int i = 4; i < 9; ++i) if (id[i] < '0' || id[i] > '9') return 0;
  return 1;
}

// "<TITLE>_<digits>"
static int title_sandbox(const char* name) {
  size_t length = strlen(title);
  if (strncmp(name, title, length) || name[length] != '_' || !name[length + 1]) return 0;
  for (const char* c = name + length + 1; *c; ++c) if (*c < '0' || *c > '9') return 0;
  return 1;
}

// "<a>/<b>" into `out`; 0 if it does not fit.
static int join(char* out, size_t size, const char* a, const char* b) {
  const int length = snprintf(out, size, "%s/%s", a, b);
  return length >= 0 && (size_t)length < size;
}

// The title's sandbox folders now, with their inodes.
static int list_sandboxes(sandbox_dir* out) {
  int count = 0;
  DIR* root = opendir(sandbox_root());
  if (!root) return 0;
  struct dirent* entry;
  while ((entry = readdir(root)) && count < MAX_SANDBOXES) {
    const size_t length = strlen(entry->d_name);
    if (!title_sandbox(entry->d_name) || length >= sizeof out[count].name) continue;
    char dir[512];
    struct stat info;
    if (!join(dir, sizeof dir, sandbox_root(), entry->d_name) || lstat(dir, &info) || !S_ISDIR(info.st_mode)) continue;
    memcpy(out[count].name, entry->d_name, length + 1);
    out[count].device = info.st_dev;
    out[count].inode = info.st_ino;
    out[count].done = 0;
    ++count;
  }
  closedir(root);
  return count;
}

// Still the folder that was listed: a folder made since, even under the same name, is not this sweep's.
static int same_folder(const sandbox_dir* box, const char* dir) {
  struct stat info;
  return lstat(dir, &info) == 0 && S_ISDIR(info.st_mode) && info.st_dev == box->device && info.st_ino == box->inode;
}

// An app runs from the folder (or the system is still taking it down): its app0 is mounted.
static int in_use(const char* dir, const mount_entry* table, int count) {
  char app0[600];
  snprintf(app0, sizeof app0, "%s/app0", dir);
  for (int i = 0; i < count; ++i) if (!strcmp(table[i].on, app0)) return 1;
  return 0;
}

// Unmounts the aliases mounted inside `dir`, newest first. Aliases can be stacked on one path, dozens of them
// (the console's /data alias in a folder ShadowMount+ had lost track of took one unmount every round for over
// a minute): each path is unmounted until no alias is left on it.
static void release_mounts(const char* dir, const mount_entry* table, int count, int quiet) {
  char prefix[600];
  snprintf(prefix, sizeof prefix, "%s/", dir);
  const size_t prefix_length = strlen(prefix);
  for (int i = count - 1; i >= 0; --i) {
    const char* on = table[i].on;
    if (strncmp(on, prefix, prefix_length)) continue;
    const char* type = table[i].type;
    if (strcmp(type, "nullfs") && strcmp(type, "unionfs")) {
      if (!quiet) note("left alone: %s (%s from %s)", on, type, table[i].from);
      continue;
    }
    // Already taken off with the ones stacked above it.
    if (!alias_at(on)) continue;
    int result = 0, error = 0, removed = 0;
    do {
      result = unmount_path(on, 0);
      error = result ? errno : 0;
      // Nothing runs in this folder any more: an alias still busy there is only a leftover reference.
      if (result && error == EBUSY) {
        result = unmount_path(on, 1);
        error = result ? errno : 0;
      }
    } while (!result && ++removed < MAX_STACKED && alias_at(on));
    if (result) note("unmount %s (%s from %s): %s", on, type, table[i].from, strerror(error));
    else if (removed > 1) note("unmount %s (%s from %s): done, %d stacked", on, type, table[i].from, removed);
    else if (!quiet) note("unmount %s (%s from %s): done", on, type, table[i].from);
  }
}

// Why the last folder could not go, for the outcome line.
static char kept_reason[700];

static void keep_reason(const char* path, const char* why) {
  const int length = snprintf(kept_reason, sizeof kept_reason, "%s: %s", path, why);
  (void)length;
}

// rmdir of the folders in `path`, deepest first, then of `path`: only empty ones go. Never goes into a mount
// or follows a link. 1 once `path` is gone.
static int remove_tree(const char* path, int depth, const mount_entry* table, int count) {
  if (mounted_on(path, table, count)) {
    keep_reason(path, "still mounted");
    return 0;
  }
  DIR* listing = opendir(path);
  if (!listing) {
    if (errno == ENOENT) return 1;
    keep_reason(path, strerror(errno));
    return 0;
  }
  char (*names)[NAME_BYTES] = calloc(MAX_ENTRIES, sizeof *names);
  int found = 0;
  struct dirent* entry;
  while (names && (entry = readdir(listing)) && found < MAX_ENTRIES) {
    const size_t length = strlen(entry->d_name);
    if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..") || length >= sizeof names[0]) continue;
    memcpy(names[found++], entry->d_name, length + 1);
  }
  closedir(listing);
  for (int i = 0; i < found && depth < MAX_DEPTH; ++i) {
    char child[1024];
    struct stat info;
    if (join(child, sizeof child, path, names[i]) && lstat(child, &info) == 0 && S_ISDIR(info.st_mode))
      remove_tree(child, depth + 1, table, count);
  }
  free(names);
  if (rmdir(path) == 0 || errno == ENOENT) return 1;
  if (errno != ENOTEMPTY || !kept_reason[0]) keep_reason(path, strerror(errno));
  return 0;
}

// Clears the listed folders, a round every ROUND_MS. A folder in use is left out at launch, and waited for after
// the close (the system may still be taking it down). 1 once none of them is left.
static int clear(sandbox_dir* boxes, int count, int wait_in_use) {
  for (int round = 0; round < ROUNDS; ++round) {
    const int quiet = round > 1 && round < ROUNDS - 1;
    int left = 0;
    for (int i = 0; i < count; ++i) {
      if (boxes[i].done) continue;
      char dir[512];
      if (!join(dir, sizeof dir, sandbox_root(), boxes[i].name) || !same_folder(&boxes[i], dir)) {
        boxes[i].done = 1;
        continue;
      }
      mount_entry* table = NULL;
      int mounts = list_mounts(&table);
      if (mounts < 0) {
        note("mount table unavailable: %s", strerror(errno));
        free(table);
        return 0;
      }
      if (in_use(dir, table, mounts)) {
        free(table);
        if (wait_in_use) {
          ++left;
        } else {
          boxes[i].done = 1;
        }
        continue;
      }
      release_mounts(dir, table, mounts, quiet);
      free(table);
      mounts = list_mounts(&table);
      kept_reason[0] = 0;
      if (mounts >= 0 && remove_tree(dir, 0, table, mounts)) {
        outcome("removed %s", dir);
        boxes[i].done = 1;
      } else {
        ++left;
        if (round == ROUNDS - 1) outcome("kept %s: %s", dir, kept_reason[0] ? kept_reason : "unknown");
      }
      free(table);
    }
    if (!left) return 1;
    pause_ms(ROUND_MS);
  }
  return 0;
}

// What earlier launches left. The app that sent this runs from one of the folders; unless exactly one is in use,
// which one is the app's is unclear, and none is touched.
static void clear_leftovers(void) {
  sandbox_dir boxes[MAX_SANDBOXES];
  const int count = list_sandboxes(boxes);
  if (count < 2) return;
  mount_entry* table = NULL;
  const int mounts = list_mounts(&table);
  int using_count = 0;
  for (int i = 0; i < count && mounts >= 0; ++i) {
    char dir[512];
    if (join(dir, sizeof dir, sandbox_root(), boxes[i].name) && in_use(dir, table, mounts)) ++using_count;
  }
  free(table);
  if (using_count != 1) {
    outcome("%s started; %d sandbox folder(s), %d in use: left alone", title, count, using_count);
    return;
  }
  note("%s started; %d sandbox folder(s) left from before", title, count - 1);
  if (clear(boxes, count, 0)) outcome("cleared what earlier launches left");
  else outcome("could not clear all that earlier launches left");
}

int main(void) {
  // The app's end of the connection goes away with it.
  signal(SIGPIPE, SIG_IGN);
  char magic[8];
  if (!read_line(magic, sizeof magic) || strcmp(magic, "SWP1") || !read_line(title, sizeof title) || !valid_title(title))
    return 1;
  // The app does not wait for the answer.
  const ssize_t answered = write(STDOUT_FILENO, "ready\n", 6);
  (void)answered;
  open_log();
  clear_leftovers();

  // One sweeper waits for the close.
  char lock_path[512];
#ifdef SWEEPER_HOST_TEST
  snprintf(lock_path, sizeof lock_path, "%s/sweeper.lock", state_dir());
#else
  snprintf(lock_path, sizeof lock_path, "/data/ps5-react/%s/sweeper.lock", title);
#endif
  const int lock = open(lock_path, O_RDWR | O_CREAT, 0666);
  int locked = 0;
  for (int tries = 0; lock >= 0 && tries < LOCK_TRIES && !(locked = flock(lock, LOCK_EX | LOCK_NB) == 0); ++tries) sleep(1);
  if (!locked) return 0;

  note("waiting for %s to close", title);
  // Only folders seen while the app ran: one made for a launch after the close is never touched.
  sandbox_dir boxes[MAX_SANDBOXES];
  int count = list_sandboxes(boxes);
  while (running()) {
    count = list_sandboxes(boxes);
    pause_ms(POLL_MS);
  }
  note("%s closed; %d sandbox folder(s) left", title, count);
  pause_ms(SETTLE_MS);
  if (clear(boxes, count, 1)) outcome("all clear");
  else outcome("stopped with sandbox folders left");
  return 0;
}
