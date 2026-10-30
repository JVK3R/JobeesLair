// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// Drives native/ps4/sce_http.cpp against a scripted stand-in for Sony's libSceSysmodule, libSceNet, libSceSsl and
// libSceHttp: the calls it makes, in order, and what it makes of the answers.
#include "sce_http.hpp"
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <deque>
#include <map>
#include <string>
#include <vector>

namespace {
int failures = 0, passes = 0;

void check(bool ok, const std::string& what) {
  std::printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str());
  ok ? ++passes : ++failures;
}

std::string hex(std::uint32_t value) {
  char text[16];
  std::snprintf(text, sizeof text, "0x%08x", value);
  return text;
}

int code(std::uint32_t value) { return static_cast<int>(value); }

// What the stand-in heard, and what it answers each sceHttpSendRequest with, in turn.
std::vector<std::string> calls;
std::size_t ssl_pool_limit = SIZE_MAX;
int reads = 0;
struct Answer {
  int send = 0;
  int status = 200;
  std::string headers;
  int length_kind = 1; // 0: Content-Length known
  std::uint64_t length = 0;
  std::string body;
};
std::deque<Answer> answers;
struct Live {
  Answer answer;
  std::size_t read = 0;
};
std::map<int, Live> live;
int next_id = 100;

bool heard(const std::string& call) { return std::find(calls.begin(), calls.end(), call) != calls.end(); }
} // namespace

extern "C" {
int sceKernelDebugOutText(int, const char*, ...) { return 0; }
int sceSysmoduleLoadModuleInternal(std::uint32_t id) {
  calls.push_back("load " + hex(id));
  return 0;
}
int sceNetInit(void) { return 0; }
int sceNetPoolCreate(const char*, int size, int) {
  calls.push_back("net pool " + std::to_string(size >> 10));
  return 1;
}
int sceNetPoolDestroy(int) { return 0; }
int sceSslInit(std::size_t pool) {
  calls.push_back("ssl " + std::to_string(pool >> 10));
  return pool > ssl_pool_limit ? code(0x80435022u) : 2;
}
int sceSslTerm(int) { return 0; }
int sceHttpInit(int, int, std::size_t pool) {
  calls.push_back("http " + std::to_string(pool >> 10));
  return 3;
}
int sceHttpTerm(int) { return 0; }
int sceHttpCreateTemplate(int, const char* agent, int, int) {
  calls.push_back(std::string("template ") + agent);
  return ++next_id;
}
int sceHttpDeleteTemplate(int) { return 0; }
int sceHttpCreateConnectionWithURL(int, const char* url, int) {
  calls.push_back("connect " + std::to_string(next_id + 1) + " " + url);
  return ++next_id;
}
int sceHttpDeleteConnection(int id) {
  calls.push_back("close " + std::to_string(id));
  return 0;
}
int sceHttpCreateRequestWithURL(int connection, int method, const char* url, std::uint64_t length) {
  calls.push_back("request " + std::to_string(method) + " on " + std::to_string(connection) + " " + url + " " + std::to_string(length));
  return ++next_id;
}
int sceHttpCreateRequestWithURL2(int connection, const char* method, const char* url, std::uint64_t) {
  calls.push_back(std::string("request ") + method + " on " + std::to_string(connection) + " " + url);
  return ++next_id;
}
int sceHttpDeleteRequest(int id) {
  live.erase(id);
  return 0;
}
int sceHttpAddRequestHeader(int, const char* name, const char* value, int mode) {
  calls.push_back(std::string("header ") + name + "=" + value + " mode " + std::to_string(mode));
  return 0;
}
int sceHttpSendRequest(int id, const void*, std::size_t size) {
  calls.push_back("send " + std::to_string(size));
  live[id] = {answers.front()};
  answers.pop_front();
  return live[id].answer.send;
}
int sceHttpGetStatusCode(int id, int* status) {
  *status = live[id].answer.status;
  return 0;
}
int sceHttpGetAllResponseHeaders(int id, char** header, std::size_t* size) {
  *header = live[id].answer.headers.data();
  *size = live[id].answer.headers.size();
  return 0;
}
int sceHttpGetResponseContentLength(int id, int* result, std::uint64_t* length) {
  *result = live[id].answer.length_kind;
  *length = live[id].answer.length;
  return 0;
}
// A few bytes at a time, so the read loop goes round.
int sceHttpReadData(int id, void* data, std::size_t size) {
  ++reads;
  Live& request = live[id];
  const std::size_t count = std::min({size, std::size_t(4), request.answer.body.size() - request.read});
  std::memcpy(data, request.answer.body.data() + request.read, count);
  request.read += count;
  return static_cast<int>(count);
}
int sceHttpAbortRequest(int) { return 0; }
int sceHttpSetConnectTimeOut(int, std::uint32_t) { return 0; }
int sceHttpSetSendTimeOut(int, std::uint32_t) { return 0; }
int sceHttpSetRecvTimeOut(int, std::uint32_t) { return 0; }
int sceHttpSetResolveTimeOut(int, std::uint32_t) { return 0; }
int sceHttpSetResolveRetry(int, int) { return 0; }
int sceHttpSetAutoRedirect(int, int enable) {
  calls.push_back("redirects " + std::to_string(enable));
  return 0;
}
int sceHttpSetAcceptEncodingGZIPEnabled(int, int) { return 0; }
int sceHttpSetInflateGZIPEnabled(int, int) { return 0; }
int sceHttpSetResponseHeaderMaxSize(int, std::size_t) { return 0; }
int sceHttpsEnableOption(int, std::uint32_t flags) {
  calls.push_back("https option " + hex(flags));
  return 0;
}
}

namespace {
std::string body;
const sce_http::Sink keep = [](const char* data, std::size_t size) {
  body.append(data, size);
  return true;
};

sce_http::Exchange get(const std::string& url) {
  sce_http::Exchange x;
  x.url = url;
  return x;
}

// Each case starts with fresh ids: a client's template is 101 and its first connection 102.
void reset() {
  calls.clear();
  body.clear();
  reads = 0;
  next_id = 100;
}
} // namespace

int main() {
  {
    ssl_pool_limit = 2u << 20;
    std::string error;
    const bool ok = sce_http::start(error);
    const std::vector<std::string> expected = {"load 0x8000001c", "load 0x8000000b", "load 0x8000000a", "net pool 1024",
                                               "ssl 6144", "ssl 2048", "http 4096"};
    check(ok && error.empty() && calls == expected,
          "start: the modules in the order they need each other, then the largest pools the system gives (" + error + ")");
  }
  {
    reset();
    sce_http::Client client;
    answers.push_back({0, 200, "Content-Type: application/json\r\nETag: \"j1\"\r\nContent-Length: 11\r\n", 0, 11, "hello world"});
    auto x = get("https://api.example.org/v1/status?a=1");
    x.headers = {"Accept: application/json", "Range:  bytes=5-"};
    const bool ok = client.perform(x, keep);
    check(ok && x.status == 200 && body == "hello world" && reads > 2 && x.header("content-type") == "application/json" &&
              x.header("etag") == "\"j1\"" && x.length_known && x.content_length == 11,
          "GET: the body read in pieces, and a header block without a status line keeps its first header");
    check(heard("template JobeesLair/test (PS4)") && heard("https option 0x00000080") &&
              heard("request 0 on 102 https://api.example.org/v1/status?a=1 0") && heard("header Accept=application/json mode 0") &&
              heard("header Range=bytes=5- mode 0") && heard("redirects 1"),
          "GET: the agent says PS4, SNI is on, and the app's headers go as given");
  }
  {
    reset();
    sce_http::Client client;
    answers.push_back({0, 206, "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 5-10/11\r\nX-Note: a: b\r\n", 1, 0, "world!"});
    auto x = get("https://cdn.example.org/file.bin");
    const bool ok = client.perform(x, keep);
    check(ok && x.status == 206 && x.response_headers.size() == 2 && x.header("content-range") == "bytes 5-10/11" &&
              x.header("x-note") == "a: b" && !x.length_known && body == "world!",
          "a header block that starts with the status line: the line skipped, the headers kept, no length announced");
  }
  {
    reset();
    sce_http::Client client;
    answers.push_back({0, 200, "", 0, 5, "first"});
    answers.push_back({code(0x80431085u), 0, "", 1, 0, ""});
    answers.push_back({0, 200, "", 0, 5, "again"});
    auto first = get("https://api.example.org/a");
    client.perform(first, keep);
    body.clear();
    auto second = get("https://api.example.org/b");
    const bool ok = client.perform(second, keep);
    check(ok && body == "again" && heard("close 102") && heard("connect 105 https://api.example.org/b"),
          "a kept connection the server closed: the request goes again on a new one");
  }
  {
    reset();
    sce_http::Client client;
    answers.push_back({code(0x80431068u), 0, "", 1, 0, ""});
    auto x = get("https://slow.example.org/");
    const bool ok = client.perform(x, keep);
    check(!ok && x.transient && x.error == "connection timed out (0x80431068)" && heard("close 102"),
          "a timeout on a new connection: a transient failure in words, the connection let go (" + x.error + ")");
    reset();
    answers.push_back({code(0x80436007u), 0, "", 1, 0, ""});
    auto y = get("https://nowhere.example.org/");
    check(!client.perform(y, keep) && !y.transient && y.error == "could not resolve host (no such name) (0x80436007)",
          "no such host: not worth another attempt (" + y.error + ")");
  }
  {
    reset();
    sce_http::Client client;
    for (int i = 0; i < 4; ++i) answers.push_back({0, 200, "", 0, 0, ""});
    for (const char* url : {"https://a.example.org/1", "https://b.example.org/1", "https://a.example.org/2", "https://c.example.org/1"}) {
      auto x = get(url);
      client.perform(x, keep);
    }
    check(heard("close 104") && !heard("close 102") && std::count_if(calls.begin(), calls.end(), [](const std::string& c) {
            return c.rfind("connect ", 0) == 0;
          }) == 3,
          "two connections a client: the least recently used goes for a third host");
  }
  {
    reset();
    sce_http::Client client;
    answers.push_back({0, 200, "Content-Length: 99\r\n", 0, 99, "never read"});
    auto x = get("https://cdn.example.org/head");
    x.method = "HEAD";
    const bool ok = client.perform(x, keep);
    check(ok && reads == 0 && x.content_length == 99 && heard("request 2 on 102 https://cdn.example.org/head 0"),
          "HEAD: method 2, the length heard, no body read");
  }
  {
    reset();
    sce_http::Client client;
    answers.push_back({0, 200, "", 0, 2, "ok"});
    const std::string payload = "{\"a\":1}";
    auto x = get("https://api.example.org/v1/thing");
    x.method = "PATCH";
    x.body = &payload;
    const bool ok = client.perform(x, keep);
    check(ok && heard("request PATCH on 102 https://api.example.org/v1/thing") && heard("send 7") && body == "ok",
          "a method without a number goes by name, with its body");
  }
  {
    reset();
    sce_http::Client client;
    std::atomic<bool> abort{true};
    auto x = get("https://api.example.org/stop");
    const bool ok = client.perform(x, keep, &abort);
    check(ok && x.stopped && !heard("send 0"), "aborted before sending: stopped, nothing sent");
  }
  {
    reset();
    sce_http::Client client;
    answers.push_back({0, 403, "Content-Type: text/html\r\n", 0, 20, "<html>denied</html>.."});
    auto x = get("https://files.example.org/game.pkg");
    const bool ok = client.perform(x, keep, nullptr, [&] { return x.status == 200; });
    check(ok && x.stopped && reads == 0 && x.header("content-type") == "text/html" && heard("close 102"),
          "the head check refusing the answer: stopped before the body, the connection let go");
  }
  {
    reset();
    sce_http::Client client;
    answers.push_back({0, 200, "", 0, 12, "abcdefghijkl"});
    auto x = get("https://files.example.org/big");
    const bool ok = client.perform(x, [](const char*, std::size_t) { return false; });
    check(ok && x.stopped && reads == 1 && heard("close 102"), "a sink that stops: one piece read, the connection let go");
  }
  sce_http::stop();
  std::printf("%d passed, %d failed\n", passes, failures);
  return failures ? 1 : 0;
}
