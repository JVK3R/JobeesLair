// Copyright (C) 2026 JVK3R and Jobee'sLair contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The phone companion while Jobee'sLair is closed (0.5.0, experimental). The app's own companion server
// lives and dies with the app; this small payload, which the app sends to the payload loader
// (127.0.0.1:9021) when Settings has "Keep the phone page on when Jobee'sLair is closed" switched on, stays
// behind and answers on the same port whenever the app is not running:
//   - the same 6-digit PIN signs a phone in (wrong PINs are slowed down and lock it after 20 tries);
//   - the phone sees that the app is closed, the download queue as the app last saved it, and the
//     homebrew payloads Jobee'sLair installed;
//   - "Open Jobee'sLair" launches the app on the console (the phone then switches to the app's own page);
//   - "Run" sends an installed payload to the payload loader.
// Whenever the app runs, it lets the port go (checked twice a second), so the app's own server gets it.
//
// Request lines from the app: "CMP2", the title ID, the port, the PIN ("-" to switch it off), the payload
// folder (Jobee'sLair keeps index.json there), the queue file, and the app's session cookie ("-" for none).
// Answers "ready" when it starts, "updated" when one was already running and took the new settings (a new
// PIN, say), or "stopped". (0.5.0 Pre Release 1 sent "CMP1", without the session line; one of those still
// running is told to stop, and this one takes its place.)
// The session cookie is the one the app's own server gives every phone for the right PIN (jbh): a phone
// signed in on either side stays signed in when the other takes over the port.
//
// Built by the app's build (app.json "payloads") with the PS5 Payload SDK, like the engine's updater.elf;
// -DCOMPANION_HOST_TEST builds it for the desktop, where tests/companion-daemon.test.mjs runs it.
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>

#define CONTROL_PORT 34198
#define MAX_SESSIONS 8
#define MAX_TRIES 20
#define MAX_FILE (4 * 1024 * 1024)

#ifdef COMPANION_HOST_TEST
// The desktop test: the title "runs" while $COMPANION_TEST_RUNNING exists, a launch creates it, and the
// control port comes from $COMPANION_TEST_CONTROL.
static int title_running(const char* title) {
  (void)title;
  const char* path = getenv("COMPANION_TEST_RUNNING");
  struct stat st;
  return path && stat(path, &st) == 0;
}
static int launch_title(const char* title) {
  (void)title;
  const char* path = getenv("COMPANION_TEST_RUNNING");
  if (!path) return -1;
  FILE* file = fopen(path, "w");
  if (!file) return -1;
  fclose(file);
  return 0;
}
static int control_port(void) {
  const char* value = getenv("COMPANION_TEST_CONTROL");
  return value && *value ? atoi(value) : CONTROL_PORT;
}
static int loader_port(void) {
  const char* value = getenv("COMPANION_TEST_LOADER");
  return value && *value ? atoi(value) : 9021;
}
#else
typedef struct {
  uint32_t size, user_id, app_opt;
  uint64_t crash_report;
  uint32_t check_flag;
} LncAppParam;

int sceUserServiceInitialize(void*);
int sceUserServiceGetForegroundUser(int*);
int sceLncUtilGetAppId(const char* title_id);
int sceLncUtilLaunchApp(const char* title_id, const char** argv, LncAppParam* param);

static int title_running(const char* title) { return sceLncUtilGetAppId(title) >= 0; }
static int launch_title(const char* title) {
  sceUserServiceInitialize(NULL);
  LncAppParam param = {sizeof param, 0, 0, 0, 0};
  sceUserServiceGetForegroundUser((int*)&param.user_id);
  return sceLncUtilLaunchApp(title, NULL, &param) < 0 ? -1 : 0;
}
static int control_port(void) { return CONTROL_PORT; }
static int loader_port(void) { return 9021; }
#endif

typedef struct {
  char title[16];
  int port;
  char pin[8];
  char payloads[512];
  char queue[512];
  char session[72]; // empty: none
} Config;

static Config g_config;
// Sign-ins when the app gave no session cookie, each with its own.
static char g_sessions[MAX_SESSIONS][65];
static int g_next_session, g_wrong;
static time_t g_retry_at;

static const char PAGE[] =
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
  "<meta name=\"theme-color\" content=\"#050811\"><title>Jobee'sLair</title><style>"
  ":root{--canvas:#05070d;--panel:#0f1520;--panel2:#1d2738;--line:#243047;--fg:#f3f6fb;--muted:#a6b1c4;--subtle:#75839a;--accent:#3a86ff;--ice:#4cc9f0}"
  "*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(120% 60% at 50% -10%,rgba(58,134,255,.18),transparent 60%) fixed,var(--canvas);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}"
  "main{max-width:560px;margin:0 auto;padding:calc(18px + env(safe-area-inset-top)) 16px 40px}h1{font-size:20px;letter-spacing:.06em;margin:0 0 14px}"
  ".panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:12px}"
  ".btn{border:1px solid var(--line);border-radius:12px;background:var(--panel2);color:var(--fg);font:inherit;font-weight:600;padding:12px 16px;cursor:pointer}"
  ".primary{background:linear-gradient(180deg,#3a86ff,#2f6fe0);border-color:#5a9bff;color:#fff;box-shadow:0 6px 18px rgba(58,134,255,.28)}.wide{width:100%;padding:16px;font-size:17px}"
  ".muted{color:var(--muted)}.subtle{color:var(--subtle);font-size:13px}.row{display:flex;align-items:center;gap:10px}.grow{flex:1;min-width:0}"
  ".ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.label{margin:20px 0 10px;font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase}"
  ".dot{width:10px;height:10px;border-radius:99px;background:#fbbf24;box-shadow:0 0 10px rgba(251,191,36,.7)}"
  ".pin{width:100%;padding:14px 0;border:1px solid var(--line);border-radius:12px;background:#090d16;color:#fff;font:600 32px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;text-indent:.3em;text-align:center;margin:12px 0}"
  ".bar{height:6px;border-radius:99px;background:var(--panel2);overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--ice))}"
  ".err{color:#fecaca;font-size:14px;min-height:20px}[hidden]{display:none!important}"
  "</style></head><body><main><h1>Jobee'sLair</h1>"
  "<form class=\"panel\" id=\"login\" hidden><b>Enter your PIN</b><p class=\"muted\" style=\"margin:4px 0 0\">The same 6-digit PIN as the phone companion in Jobee'sLair.</p>"
  "<input class=\"pin\" id=\"pin\" type=\"tel\" inputmode=\"numeric\" maxlength=\"6\" autocomplete=\"one-time-code\"><button class=\"btn primary wide\">Sign in</button><div class=\"err\" id=\"loginErr\"></div></form>"
  "<div id=\"home\" hidden><div class=\"panel\"><div class=\"row\"><i class=\"dot\"></i><b class=\"grow\">Jobee'sLair is closed</b></div>"
  "<p class=\"muted\" style=\"margin:8px 0 14px\">Open it on the console from here. This page then switches to the full companion.</p>"
  "<button class=\"btn primary wide\" id=\"open\">Open Jobee'sLair</button><div class=\"err\" id=\"openErr\"></div></div>"
  "<div class=\"label\">Download queue</div><div id=\"queue\"></div><div class=\"label\">Payloads</div><div id=\"payloads\"></div>"
  "<p class=\"subtle\">Running while Jobee'sLair is closed. Turn this off in Settings &rarr; Phone companion.</p></div>"
  "</main><script>(function(){\"use strict\";var $=function(i){return document.getElementById(i)};"
  "function el(t,c,x){var n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n}"
  "function bytes(n){if(!n)return\"0 B\";var u=[\"B\",\"KB\",\"MB\",\"GB\",\"TB\"],i=Math.min(4,Math.floor(Math.log(n)/Math.log(1000)));return(n/Math.pow(1000,i)).toFixed(i>1?1:0)+\" \"+u[i]}"
  "function api(m,p,b){return fetch(p,{method:m,headers:{\"X-JBH\":\"1\",\"Content-Type\":\"application/json\"},body:b?JSON.stringify(b):undefined,cache:\"no-store\",credentials:\"same-origin\"}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(r.status===401){login(\"\");throw new Error(\"Not signed in.\")}if(!r.ok)throw new Error(d.error||(\"HTTP \"+r.status));return d})})}"
  "function login(msg){$(\"home\").hidden=true;$(\"login\").hidden=false;$(\"loginErr\").textContent=msg||\"\"}"
  "$(\"login\").onsubmit=function(e){e.preventDefault();var pin=$(\"pin\").value.replace(/[^0-9]/g,\"\");if(pin.length!==6)return;"
  "fetch(\"/auth\",{method:\"POST\",headers:{\"X-JBH\":\"1\",\"Content-Type\":\"application/json\"},body:JSON.stringify({pin:pin}),credentials:\"same-origin\"}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(r.ok){$(\"pin\").value=\"\";start()}else{$(\"pin\").value=\"\";$(\"loginErr\").textContent=d.error||\"Wrong PIN.\"}})}).catch(function(){$(\"loginErr\").textContent=\"Couldn't reach the console.\"})};"
  "function render(q,p){var box=$(\"queue\");box.textContent=\"\";var jobs=(q&&q.jobs)||[];if(!jobs.length)box.appendChild(el(\"p\",\"muted\",\"Nothing in the queue.\"));"
  "jobs.forEach(function(j){var d=el(\"div\",\"panel\"),r=el(\"div\",\"row\");r.appendChild(el(\"div\",\"grow ell\",j.title||j.id));r.appendChild(el(\"span\",\"subtle\",String(j.state||\"\").replace(/-/g,\" \")));d.appendChild(r);"
  "if(j.total){var b=el(\"div\",\"bar\"),i=el(\"i\");i.style.width=Math.min(100,Math.round((j.written||0)/j.total*100))+\"%\";b.appendChild(i);d.appendChild(b);d.appendChild(el(\"div\",\"subtle\",bytes(j.written||0)+\" of \"+bytes(j.total)))}box.appendChild(d)});"
  "var list=$(\"payloads\");list.textContent=\"\";var apps=(p&&p.apps)||[];if(!apps.length)list.appendChild(el(\"p\",\"muted\",\"No payloads installed from Jobee'sLair yet.\"));"
  "apps.forEach(function(a){var d=el(\"div\",\"panel row\"),t=el(\"div\",\"grow\");t.appendChild(el(\"div\",\"ell\",a.name));t.appendChild(el(\"div\",\"subtle ell\",(a.version||\"\")+\" \\u00B7 \"+(a.author||\"\")));d.appendChild(t);"
  "var b=el(\"button\",\"btn primary\",\"Run\");b.onclick=function(){b.disabled=true;api(\"POST\",\"/api/run\",{path:a.run}).then(function(){b.textContent=\"Sent\"}).catch(function(e){b.textContent=e.message}).then(function(){setTimeout(function(){b.disabled=false;b.textContent=\"Run\"},2500)})};d.appendChild(b);list.appendChild(d)})}"
  "function status(){return fetch(\"/api/status\",{headers:{\"X-JBH\":\"1\"},cache:\"no-store\",credentials:\"same-origin\"}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(d.app!==\"closed\"){location.reload();throw new Error(\"The app is back.\")}return r.status})})}"
  "function refresh(){return status().then(function(s){if(s===401)return login(\"\");return Promise.all([api(\"GET\",\"/api/queue\"),api(\"GET\",\"/api/payloads\")]).then(function(r){render(r[0],r[1])})})}"
  "$(\"open\").onclick=function(){var b=$(\"open\");b.disabled=true;b.textContent=\"Opening on the console\\u2026\";api(\"POST\",\"/api/launch\").then(function(){var n=0,t=setInterval(function(){n++;"
  "fetch(\"/api/status\",{headers:{\"X-JBH\":\"1\"},cache:\"no-store\",credentials:\"same-origin\"}).then(function(r){return r.json().catch(function(){return{}})}).then(function(d){if(d.app!==\"closed\"){clearInterval(t);location.reload()}}).catch(function(){});"
  "if(n>40){clearInterval(t);location.reload()}},1500)}).catch(function(e){$(\"openErr\").textContent=e.message;b.disabled=false;b.textContent=\"Open Jobee'sLair\"})};"
  "function start(){status().then(function(s){if(s===401)return login(\"\");$(\"login\").hidden=true;$(\"home\").hidden=false;return refresh()}).catch(function(){})}"
  "setInterval(function(){if(document.hidden)return;if(!$(\"home\").hidden)refresh().catch(function(){});else status().catch(function(){})},4000);start()})();</script></body></html>";

// ---- Small helpers -------------------------------------------------------------------------------------

static int read_line(int fd, char* line, size_t capacity) {
  size_t length = 0;
  for (;;) {
    char byte;
    if (read(fd, &byte, 1) != 1) return 0;
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

static int valid_pin(const char* pin) {
  if (!strcmp(pin, "-")) return 1;
  if (strlen(pin) != 6) return 0;
  for (int i = 0; i < 6; ++i) if (pin[i] < '0' || pin[i] > '9') return 0;
  return 1;
}

// An absolute path without "..", quotes or backslashes.
static int valid_path(const char* path) {
  size_t length = strlen(path);
  return path[0] == '/' && length > 1 && length < 500 && !strstr(path, "..") && !strchr(path, '"') && !strchr(path, '\\');
}

// 16 to 64 lowercase letters and digits, as the app's server makes them.
static int valid_session(const char* value) {
  size_t length = strlen(value);
  if (length < 16 || length > 64) return 0;
  for (size_t i = 0; i < length; ++i)
    if (!((value[i] >= 'a' && value[i] <= 'z') || (value[i] >= '0' && value[i] <= '9'))) return 0;
  return 1;
}

static int read_config(int fd, Config* config) {
  char magic[8], port[8];
  if (!read_line(fd, magic, sizeof magic) || (strcmp(magic, "CMP1") && strcmp(magic, "CMP2"))) return 0;
  if (!read_line(fd, config->title, sizeof config->title) || !valid_title(config->title)) return 0;
  if (!read_line(fd, port, sizeof port) || (config->port = atoi(port)) < 1 || config->port > 65535) return 0;
  if (!read_line(fd, config->pin, sizeof config->pin) || !valid_pin(config->pin)) return 0;
  if (!read_line(fd, config->payloads, sizeof config->payloads) || !valid_path(config->payloads)) return 0;
  if (!read_line(fd, config->queue, sizeof config->queue) || !valid_path(config->queue)) return 0;
  config->session[0] = 0;
  if (!strcmp(magic, "CMP2")) {
    if (!read_line(fd, config->session, sizeof config->session)) return 0;
    if (!strcmp(config->session, "-")) config->session[0] = 0;
    else if (!valid_session(config->session)) return 0;
  }
  return 1;
}

static void say(int fd, const char* line) {
  size_t size = strlen(line);
  while (size) {
    ssize_t count = write(fd, line, size);
    if (count <= 0) return;
    line += count;
    size -= (size_t)count;
  }
}

static int send_all(int fd, const char* data, size_t size) {
  while (size) {
    ssize_t count = send(fd, data, size, 0);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return 0;
    data += count;
    size -= (size_t)count;
  }
  return 1;
}

static void timeouts(int fd, int seconds) {
  struct timeval timeout = {seconds, 0};
  setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof timeout);
  setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof timeout);
}

static int listen_on(uint32_t address, int port) {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return -1;
  int yes = 1;
  setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);
  struct sockaddr_in where;
  memset(&where, 0, sizeof where);
  where.sin_family = AF_INET;
  where.sin_port = htons((uint16_t)port);
  where.sin_addr.s_addr = htonl(address);
  if (bind(fd, (struct sockaddr*)&where, sizeof where) != 0 || listen(fd, 4) != 0) { close(fd); return -1; }
  return fd;
}

static int connect_local(int port) {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return -1;
  timeouts(fd, 3);
  struct sockaddr_in where;
  memset(&where, 0, sizeof where);
  where.sin_family = AF_INET;
  where.sin_port = htons((uint16_t)port);
  where.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (connect(fd, (struct sockaddr*)&where, sizeof where) != 0) { close(fd); return -1; }
  return fd;
}

// A whole small file, NUL-terminated, malloc'd; NULL when it cannot be read or is over MAX_FILE.
static char* read_file(const char* path, size_t* size) {
  int fd = open(path, O_RDONLY);
  if (fd < 0) return NULL;
  struct stat st;
  if (fstat(fd, &st) != 0 || st.st_size < 0 || st.st_size > MAX_FILE) { close(fd); return NULL; }
  char* data = malloc((size_t)st.st_size + 1);
  size_t used = 0;
  while (data && used < (size_t)st.st_size) {
    ssize_t count = read(fd, data + used, (size_t)st.st_size - used);
    if (count <= 0) break;
    used += (size_t)count;
  }
  close(fd);
  if (!data) return NULL;
  data[used] = 0;
  *size = used;
  return data;
}

// 16 random bytes as 32 hex characters, from the kernel's generator.
static int random_token(char out[33]) {
  unsigned char bytes[16];
  int fd = open("/dev/urandom", O_RDONLY);
  if (fd < 0) return 0;
  ssize_t count = read(fd, bytes, sizeof bytes);
  close(fd);
  if (count != (ssize_t)sizeof bytes) return 0;
  for (int i = 0; i < 16; ++i) snprintf(out + i * 2, 3, "%02x", bytes[i]);
  return 1;
}

// Compares in time that does not depend on where they differ.
static int same(const char* a, const char* b, size_t length) {
  unsigned char diff = 0;
  for (size_t i = 0; i < length; ++i) diff |= (unsigned char)(a[i] ^ b[i]);
  return diff == 0;
}

// ---- HTTP ------------------------------------------------------------------------------------------------

typedef struct {
  char method[8];
  char path[256];
  int header_ok;
  char cookie[72];
  char body[4097];
} Request;

static const char* reason_of(int status) {
  switch (status) {
    case 200: return "OK";
    case 400: return "Bad Request";
    case 401: return "Unauthorized";
    case 403: return "Forbidden";
    case 404: return "Not Found";
    case 429: return "Too Many Requests";
    default: return "Internal Server Error";
  }
}

static void respond(int fd, int status, const char* type, const char* body, size_t size, const char* extra) {
  char head[640];
  int length = snprintf(head, sizeof head,
                        "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\nCache-Control: no-store\r\n"
                        "X-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n%s\r\n",
                        status, reason_of(status), type, size, extra ? extra : "");
  if (length > 0 && length < (int)sizeof head && send_all(fd, head, (size_t)length)) send_all(fd, body, size);
}

static void json(int fd, int status, const char* body) { respond(fd, status, "application/json", body, strlen(body), NULL); }

// The header block's value of `name` (case-insensitive), copied into `out`; 0 when absent.
static int header(const char* headers, const char* name, char* out, size_t capacity) {
  size_t length = strlen(name);
  for (const char* line = headers; line && *line; ) {
    const char* end = strstr(line, "\r\n");
    if (!end) break;
    if ((size_t)(end - line) > length && !strncasecmp(line, name, length) && line[length] == ':') {
      const char* value = line + length + 1;
      while (*value == ' ') ++value;
      size_t size = (size_t)(end - value);
      if (size >= capacity) size = capacity - 1;
      memcpy(out, value, size);
      out[size] = 0;
      return 1;
    }
    line = end + 2;
  }
  return 0;
}

static int read_request(int fd, Request* request) {
  char buffer[16384 + 4097];
  size_t used = 0;
  char* end = NULL;
  while (!end) {
    if (used >= 16384) return 0;
    ssize_t count = recv(fd, buffer + used, 16384 - used, 0);
    if (count <= 0) return 0;
    used += (size_t)count;
    buffer[used] = 0;
    end = strstr(buffer, "\r\n\r\n");
  }
  char version[16];
  if (sscanf(buffer, "%7s %255s %15s", request->method, request->path, version) != 3) return 0;
  char* query = strchr(request->path, '?');
  if (query) *query = 0;
  end[2] = 0;
  const char* headers = strstr(buffer, "\r\n") + 2;
  char value[256];
  request->header_ok = header(headers, "X-JBH", value, sizeof value) && !strcmp(value, "1");
  request->cookie[0] = 0;
  if (header(headers, "Cookie", value, sizeof value)) {
    // The app's own cookie name: "jbh=" at the start or after "; ".
    const char* at = value;
    while ((at = strstr(at, "jbh=")) && at != value && at[-1] != ' ' && at[-1] != ';') at += 4;
    if (at) {
      size_t i = 0;
      for (at += 4; i < 64 && ((at[i] >= '0' && at[i] <= '9') || (at[i] >= 'a' && at[i] <= 'z')); ++i) request->cookie[i] = at[i];
      request->cookie[i] = 0;
    }
  }
  size_t content = header(headers, "Content-Length", value, sizeof value) ? (size_t)strtoul(value, NULL, 10) : 0;
  if (content > 4096) return 0;
  size_t have = used - (size_t)(end + 4 - buffer);
  if (have > content) have = content;
  memcpy(request->body, end + 4, have);
  while (have < content) {
    ssize_t count = recv(fd, request->body + have, content - have, 0);
    if (count <= 0) return 0;
    have += (size_t)count;
  }
  request->body[have] = 0;
  return 1;
}

static int signed_in(const Request* request) {
  size_t length = strlen(request->cookie);
  if (length < 16) return 0;
  int match = g_config.session[0] && strlen(g_config.session) == length && same(g_config.session, request->cookie, length);
  for (int i = 0; i < MAX_SESSIONS; ++i)
    if (g_sessions[i][0] && strlen(g_sessions[i]) == length && same(g_sessions[i], request->cookie, length)) match = 1;
  return match;
}

// The value of a JSON string field in a small flat body ("pin", "path"), unescaped only for plain text.
static int json_string(const char* body, const char* name, char* out, size_t capacity) {
  char key[32];
  snprintf(key, sizeof key, "\"%s\"", name);
  const char* at = strstr(body, key);
  if (!at) return 0;
  at = strchr(at + strlen(key), ':');
  if (!at) return 0;
  while (*++at == ' ') {}
  if (*at != '"') return 0;
  size_t i = 0;
  for (++at; *at && *at != '"'; ++at) {
    if (*at == '\\' || i + 1 >= capacity) return 0;
    out[i++] = *at;
  }
  out[i] = 0;
  return *at == '"';
}

// Sends the file at `path` to the payload loader and closes the connection: the loader runs it.
static int run_payload(const char* path) {
  size_t size = 0;
  char* data = read_file(path, &size);
  if (!data) return -1;
  int fd = connect_local(loader_port());
  int ok = fd >= 0 && send_all(fd, data, size);
  free(data);
  if (fd >= 0) close(fd);
  return ok ? 0 : -2;
}

static void serve(int fd) {
  Request request;
  memset(&request, 0, sizeof request);
  timeouts(fd, 5);
  if (!read_request(fd, &request)) { json(fd, 400, "{\"error\":\"Bad request.\"}"); return; }
  if (!strcmp(request.method, "GET") && !strcmp(request.path, "/")) {
    respond(fd, 200, "text/html; charset=utf-8", PAGE, sizeof PAGE - 1, NULL);
    return;
  }
  if (!request.header_ok) { json(fd, 403, "{\"error\":\"Missing X-JBH header.\",\"app\":\"closed\"}"); return; }
  if (!strcmp(request.method, "POST") && !strcmp(request.path, "/auth")) {
    if (g_wrong >= MAX_TRIES) { json(fd, 429, "{\"error\":\"Too many wrong PINs. Open Jobee'sLair on the console to unlock.\",\"retryAfter\":3600,\"app\":\"closed\"}"); return; }
    // Three wrong PINs are free (as on the app's own server); each after makes the next wait a second
    // longer, up to ten. Refused, not slept: a sleep here would stall every phone and the check that hands
    // the port back to the app.
    time_t now = time(NULL);
    if (now < g_retry_at) {
      char body[128];
      snprintf(body, sizeof body, "{\"error\":\"Too many tries. Wait a moment.\",\"retryAfter\":%d,\"app\":\"closed\"}", (int)(g_retry_at - now));
      json(fd, 429, body);
      return;
    }
    char pin[16];
    if (!json_string(request.body, "pin", pin, sizeof pin) || strlen(pin) != 6 || !same(pin, g_config.pin, 6)) {
      ++g_wrong;
      if (g_wrong > 3) g_retry_at = now + (g_wrong - 3 < 10 ? g_wrong - 3 : 10);
      json(fd, 401, "{\"error\":\"Wrong PIN.\",\"app\":\"closed\"}");
      return;
    }
    g_wrong = 0;
    g_retry_at = 0;
    // The app's cookie when it gave one, so the app's own page takes this sign-in too; else one of its own.
    char token[sizeof g_config.session];
    if (g_config.session[0]) {
      snprintf(token, sizeof token, "%s", g_config.session);
    } else {
      if (!random_token(token)) { json(fd, 500, "{\"error\":\"The console could not start a session.\"}"); return; }
      memcpy(g_sessions[g_next_session], token, 33);
      g_next_session = (g_next_session + 1) % MAX_SESSIONS;
    }
    char cookie[160];
    snprintf(cookie, sizeof cookie, "Set-Cookie: jbh=%s; Path=/; HttpOnly; SameSite=Strict\r\n", token);
    respond(fd, 200, "application/json", "{\"ok\":true,\"app\":\"closed\"}", 26, cookie);
    return;
  }
  // The app is closed whenever this answers, and every refusal says so, so a phone on the app's page knows
  // to load this one.
  if (!signed_in(&request)) { json(fd, 401, "{\"error\":\"Not signed in.\",\"app\":\"closed\"}"); return; }
  if (!strcmp(request.method, "GET") && !strcmp(request.path, "/api/status")) {
    char body[96];
    snprintf(body, sizeof body, "{\"app\":\"closed\",\"title\":\"%s\"}", g_config.title);
    json(fd, 200, body);
  } else if (!strcmp(request.method, "GET") && (!strcmp(request.path, "/api/queue") || !strcmp(request.path, "/api/payloads"))) {
    char path[600];
    if (!strcmp(request.path, "/api/queue")) snprintf(path, sizeof path, "%s", g_config.queue);
    else snprintf(path, sizeof path, "%s/index.json", g_config.payloads);
    size_t size = 0;
    char* data = read_file(path, &size);
    if (data) respond(fd, 200, "application/json", data, size, NULL);
    else json(fd, 200, !strcmp(request.path, "/api/queue") ? "{\"jobs\":[]}" : "{\"apps\":[]}");
    free(data);
  } else if (!strcmp(request.method, "POST") && !strcmp(request.path, "/api/launch")) {
    const int launched = launch_title(g_config.title) == 0;
    json(fd, launched ? 200 : 500, launched ? "{\"ok\":true}" : "{\"error\":\"The console did not open Jobee'sLair.\"}");
  } else if (!strcmp(request.method, "POST") && !strcmp(request.path, "/api/run")) {
    char path[512];
    size_t root = strlen(g_config.payloads);
    size_t length = 0;
    // Only an installed payload: a file under the payload folder, named .elf or .bin.
    if (!json_string(request.body, "path", path, sizeof path) || !valid_path(path) || strncmp(path, g_config.payloads, root) || path[root] != '/' ||
        (length = strlen(path)) < 5 || (strcmp(path + length - 4, ".elf") && strcmp(path + length - 4, ".bin"))) {
      json(fd, 400, "{\"error\":\"Not an installed payload.\"}");
      return;
    }
    int result = run_payload(path);
    if (result == 0) json(fd, 200, "{\"ok\":true}");
    else json(fd, 500, result == -1 ? "{\"error\":\"The payload's file is gone.\"}" : "{\"error\":\"The payload loader on port 9021 did not answer.\"}");
  } else {
    // Anything else is a request of the app's own page, which this is not.
    json(fd, 404, "{\"error\":\"Jobee'sLair is closed.\",\"app\":\"closed\"}");
  }
}

// ---- Main ------------------------------------------------------------------------------------------------

// The answer to the app: on stdout (the loader's connection) and in helper.txt in the payload folder, which
// the app reads a few seconds later instead of waiting on the connection (0.5.0 Pre Release 3).
static void reply_to_app(const Config* config, const char* word) {
  say(STDOUT_FILENO, word);
  char path[600];
  snprintf(path, sizeof path, "%s/helper.txt", config->payloads);
  int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (fd < 0) return;
  say(fd, word);
  close(fd);
}

// Sends `config` to the helper on the control port, as CMP2 (or as CMP1, which Pre Release 1 reads), and
// reads its answer into `answer` ("" when it gave none).
static void hand_over(const Config* config, int version, const char* pin, char* answer, size_t capacity) {
  answer[0] = 0;
  int fd = connect_local(control_port());
  if (fd < 0) return;
  char request[1500];
  int length = version == 2
    ? snprintf(request, sizeof request, "CMP2\n%s\n%d\n%s\n%s\n%s\n%s\n", config->title, config->port, pin, config->payloads, config->queue, config->session[0] ? config->session : "-")
    : snprintf(request, sizeof request, "CMP1\n%s\n%d\n%s\n%s\n%s\n", config->title, config->port, pin, config->payloads, config->queue);
  if (length > 0 && length < (int)sizeof request && send_all(fd, request, (size_t)length)) read_line(fd, answer, capacity);
  close(fd);
}

int main(void) {
  // A phone's end can go away mid-answer.
  signal(SIGPIPE, SIG_IGN);
  Config config;
  memset(&config, 0, sizeof config);
  if (!read_config(STDIN_FILENO, &config)) return 1;
  const int stopping = !strcmp(config.pin, "-");
  // One runs at a time: a second hands its settings to the first, which takes them (or stops on "-"). One
  // from Pre Release 1 does not read CMP2 and answers nothing: it is told to stop, and this one starts.
  int control = -1;
  for (int attempt = 0; attempt < 6 && control < 0; ++attempt) {
    char answer[16];
    hand_over(&config, 2, config.pin, answer, sizeof answer);
    if (!strcmp(answer, "updated") || !strcmp(answer, "stopped")) {
      reply_to_app(&config, stopping ? "stopped\n" : "updated\n");
      return 0;
    }
    int existing = connect_local(control_port());
    if (existing >= 0) {
      close(existing);
      hand_over(&config, 1, "-", answer, sizeof answer);
      usleep(400000);
      continue;
    }
    if (stopping) { reply_to_app(&config, "stopped\n"); return 0; }
    control = listen_on(INADDR_LOOPBACK, control_port());
    if (control < 0) usleep(400000);
  }
  if (control < 0) { reply_to_app(&config, "busy\n"); return 1; }
  g_config = config;
  reply_to_app(&config, "ready\n");
  // The loader made the app's connection this process's stdout and stderr; the app hangs up after the
  // answer, and system libraries go on logging there, so both go to /dev/null from here.
  int null_fd = open("/dev/null", O_WRONLY);
  if (null_fd >= 0) {
    dup2(null_fd, STDOUT_FILENO);
    dup2(null_fd, STDERR_FILENO);
    close(null_fd);
  }
  int web = -1;
  time_t last_try = 0;
  for (;;) {
    // The app's own server takes the port while it runs.
    int running = title_running(g_config.title);
    if (running && web >= 0) { close(web); web = -1; }
    if (!running && web < 0 && time(NULL) - last_try >= 2) {
      last_try = time(NULL);
      web = listen_on(INADDR_ANY, g_config.port);
    }
    fd_set ready;
    FD_ZERO(&ready);
    FD_SET(control, &ready);
    if (web >= 0) FD_SET(web, &ready);
    struct timeval wait = {0, 500000};
    int highest = web > control ? web : control;
    if (select(highest + 1, &ready, NULL, NULL, &wait) <= 0) continue;
    if (FD_ISSET(control, &ready)) {
      int fd = accept(control, NULL, NULL);
      if (fd >= 0) {
        timeouts(fd, 3);
        Config next;
        memset(&next, 0, sizeof next);
        if (read_config(fd, &next)) {
          if (!strcmp(next.pin, "-")) { say(fd, "stopped\n"); close(fd); return 0; }
          // A new PIN signs every phone out (a new session cookie comes with it). Any word from the app (it
          // opened, so the player is at the console) clears a lock.
          if (strcmp(next.pin, g_config.pin)) memset(g_sessions, 0, sizeof g_sessions);
          g_wrong = 0;
          g_retry_at = 0;
          if (next.port != g_config.port && web >= 0) { close(web); web = -1; last_try = 0; }
          g_config = next;
          say(fd, "updated\n");
        }
        close(fd);
      }
    }
    if (web >= 0 && FD_ISSET(web, &ready)) {
      int fd = accept(web, NULL, NULL);
      if (fd >= 0) {
        serve(fd);
        close(fd);
      }
    }
  }
}
