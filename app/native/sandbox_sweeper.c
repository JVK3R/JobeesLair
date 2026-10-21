// sandbox-sweeper.elf: clears what a closed Jobee'sLair leaves behind in /mnt/sandbox, so ShadowMount+ can
// let go of the title. Added in 0.5.0 Pre Release 4.
//
// Why: each launch gets a sandbox folder, /mnt/sandbox/<TITLE>_NNN, which the system removes when the app
// closes. Jobee'sLair's are left behind with a nullfs alias of /data still mounted in them (seen on the console:
// PPSA99471_000 and _001 holding only data/, still showing /data's contents). ShadowMount+ (sm_game_lifecycle.c)
// treats a title as still closing until no <TITLE>_* sandbox folder exists, and until then it refuses unmounts,
// uninstalls and refreshes with EBUSY ("Device busy").
//
// The app sends this to the payload loader as it starts (state/sandbox-sweeper.js). It waits for the app to
// close (the app is killed on close, so it cannot clean up itself), then for each of the title's sandbox
// folders that existed at that moment: unmounts the aliases left in it (nullfs and unionfs only, newest
// first; a mount of any other kind is left alone), then removes its folders with rmdir, which only takes
// empty ones. It never deletes a file. If the app opens again it stops at once and touches nothing more.
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
#include <sys/mount.h>
#include <sys/param.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

int sceLncUtilGetAppId(const char* title_id);

// Sandboxes looked at once the app has closed; more than this many is not expected.
#define MAX_SANDBOXES 32
// ShadowMount+ releases its own layers when the app's process exits; give it this long first.
#define SETTLE_S 3
#define ROUNDS 20
#define ROUND_S 3
// A sweeper left from the previous run lets go of the lock within a second of the app opening again.
#define LOCK_TRIES 60
#define LOG_LIMIT (256 * 1024)

static char title[16];
static char log_path[256];

static void note(const char* format, ...) {
  struct stat info;
  FILE* file = fopen(log_path, stat(log_path, &info) == 0 && info.st_size > LOG_LIMIT ? "w" : "a");
  if (!file) return;
  time_t now = time(NULL);
  struct tm local;
  localtime_r(&now, &local);
  fprintf(file, "[%04d-%02d-%02d %02d:%02d:%02d] ", local.tm_year + 1900, local.tm_mon + 1, local.tm_mday,
          local.tm_hour, local.tm_min, local.tm_sec);
  va_list args;
  va_start(args, format);
  vfprintf(file, format, args);
  va_end(args);
  fputc('\n', file);
  fclose(file);
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

static int running(void) { return sceLncUtilGetAppId(title) >= 0; }

// "<TITLE>_<digits>"
static int title_sandbox(const char* name) {
  size_t length = strlen(title);
  if (strncmp(name, title, length) || name[length] != '_' || !name[length + 1]) return 0;
  for (const char* c = name + length + 1; *c; ++c) if (*c < '0' || *c > '9') return 0;
  return 1;
}

// The aliases still mounted inside `dir`, newest first. Returns 0 if the app opened again.
static int release_mounts(const char* dir) {
  char prefix[300];
  snprintf(prefix, sizeof prefix, "%s/", dir);
  const size_t prefix_length = strlen(prefix);
  int count = getfsstat(NULL, 0, MNT_NOWAIT);
  if (count < 0) {
    note("mount table unavailable: %s", strerror(errno));
    return 1;
  }
  const long capacity = count + 16;
  struct statfs* table = calloc((size_t)capacity, sizeof *table);
  if (!table) return 1;
  count = getfsstat(table, capacity * (long)sizeof *table, MNT_NOWAIT);
  if (count > capacity) count = (int)capacity;
  for (int i = count - 1; i >= 0; --i) {
    const char* on = table[i].f_mntonname;
    if (strncmp(on, prefix, prefix_length)) continue;
    const char* type = table[i].f_fstypename;
    if (strcmp(type, "nullfs") && strcmp(type, "unionfs")) {
      note("left alone: %s (%s from %s)", on, type, table[i].f_mntfromname);
      continue;
    }
    if (running()) {
      free(table);
      return 0;
    }
    int result = unmount(on, 0);
    int error = result ? errno : 0;
    // Nothing runs in a closed app's sandbox: an alias still busy there is only a leftover reference.
    if (result && error == EBUSY) {
      result = unmount(on, MNT_FORCE);
      error = result ? errno : 0;
    }
    note("unmount %s (%s from %s): %s", on, type, table[i].f_mntfromname, result ? strerror(error) : "done");
  }
  free(table);
  return 1;
}

// rmdir of the folder's own folders, then of the folder: only empty ones go. 1 once the folder is gone.
static int remove_empty(const char* dir) {
  char names[64][256];
  int found = 0;
  DIR* listing = opendir(dir);
  if (listing) {
    struct dirent* entry;
    while ((entry = readdir(listing)) && found < 64) {
      if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..")) continue;
      snprintf(names[found++], sizeof names[0], "%s", entry->d_name);
    }
    closedir(listing);
  } else if (errno == ENOENT) {
    return 1;
  }
  for (int i = 0; i < found; ++i) {
    char path[600];
    snprintf(path, sizeof path, "%s/%s", dir, names[i]);
    if (rmdir(path) && errno != ENOENT) note("kept %s: %s", path, strerror(errno));
  }
  if (rmdir(dir) == 0 || errno == ENOENT) {
    note("removed %s", dir);
    return 1;
  }
  note("kept %s: %s", dir, strerror(errno));
  return 0;
}

int main(void) {
  // The app's end of the connection goes away with it.
  signal(SIGPIPE, SIG_IGN);
  char magic[8];
  if (!read_line(magic, sizeof magic) || strcmp(magic, "SWP1") || !read_line(title, sizeof title) || !valid_title(title))
    return 1;
  write(STDOUT_FILENO, "ready\n", 6);
  snprintf(log_path, sizeof log_path, "/data/ps5-react/%s/logs/sandbox.log", title);

  // One sweeper per title.
  char lock_path[256];
  snprintf(lock_path, sizeof lock_path, "/data/ps5-react/%s/sweeper.lock", title);
  const int lock = open(lock_path, O_RDWR | O_CREAT, 0666);
  int locked = 0;
  for (int tries = 0; lock >= 0 && tries < LOCK_TRIES && !(locked = flock(lock, LOCK_EX | LOCK_NB) == 0); ++tries) sleep(1);
  if (!locked) return 0;

  note("waiting for %s to close", title);
  while (running()) sleep(1);

  // Only the sandboxes there the moment the app closed: one made for a new launch after that is never touched.
  char sandboxes[MAX_SANDBOXES][64];
  int count = 0;
  DIR* sandbox_root = opendir("/mnt/sandbox");
  if (sandbox_root) {
    struct dirent* entry;
    while ((entry = readdir(sandbox_root)) && count < MAX_SANDBOXES)
      if (title_sandbox(entry->d_name)) snprintf(sandboxes[count++], sizeof sandboxes[0], "%s", entry->d_name);
    closedir(sandbox_root);
  }
  note("%s closed; %d sandbox folder(s) left", title, count);
  sleep(SETTLE_S);

  for (int round = 0; round < ROUNDS && count > 0; ++round) {
    int left = 0;
    for (int i = 0; i < count; ++i) {
      if (!sandboxes[i][0]) continue;
      if (running()) {
        note("%s opened again; stopping", title);
        return 0;
      }
      char dir[128];
      snprintf(dir, sizeof dir, "/mnt/sandbox/%s", sandboxes[i]);
      if (!release_mounts(dir)) {
        note("%s opened again; stopping", title);
        return 0;
      }
      if (remove_empty(dir)) sandboxes[i][0] = 0;
      else ++left;
    }
    if (!left) {
      note("all clear");
      return 0;
    }
    sleep(ROUND_S);
  }
  note("stopped with sandbox folders left");
  return 0;
}
