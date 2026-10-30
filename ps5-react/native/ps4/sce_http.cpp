// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "sce_http.hpp"
#include "app_config.hpp"
#include "ps4_log.hpp"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <iterator>
#include <mutex>
#include <string_view>


// Sony's own signatures: the toolchain's Http.h declares several of these without parameters.
extern "C" {
int sceSysmoduleLoadModuleInternal(std::uint32_t id);
int sceNetInit(void);
int sceNetPoolCreate(const char* name, int size, int flags);
int sceNetPoolDestroy(int id);
int sceSslInit(std::size_t pool);
int sceSslTerm(int id);
int sceHttpInit(int net, int ssl, std::size_t pool);
int sceHttpTerm(int id);
int sceHttpCreateTemplate(int context, const char* agent, int version, int auto_proxy);
int sceHttpDeleteTemplate(int id);
int sceHttpCreateConnectionWithURL(int template_id, const char* url, int keep_alive);
int sceHttpDeleteConnection(int id);
int sceHttpCreateRequestWithURL(int connection, int method, const char* url, std::uint64_t length);
int sceHttpCreateRequestWithURL2(int connection, const char* method, const char* url, std::uint64_t length);
int sceHttpDeleteRequest(int id);
int sceHttpAddRequestHeader(int id, const char* name, const char* value, int mode);
int sceHttpSendRequest(int id, const void* data, std::size_t size);
int sceHttpGetStatusCode(int id, int* status);
int sceHttpGetAllResponseHeaders(int id, char** header, std::size_t* size);
int sceHttpGetResponseContentLength(int id, int* result, std::uint64_t* length);
int sceHttpReadData(int id, void* data, std::size_t size);
int sceHttpAbortRequest(int id);
int sceHttpSetConnectTimeOut(int id, std::uint32_t usec);
int sceHttpSetSendTimeOut(int id, std::uint32_t usec);
int sceHttpSetRecvTimeOut(int id, std::uint32_t usec);
int sceHttpSetResolveTimeOut(int id, std::uint32_t usec);
int sceHttpSetResolveRetry(int id, int retry);
int sceHttpSetAutoRedirect(int id, int enable);
int sceHttpSetAcceptEncodingGZIPEnabled(int id, int enable);
int sceHttpSetInflateGZIPEnabled(int id, int enable);
int sceHttpSetResponseHeaderMaxSize(int id, std::size_t size);
int sceHttpsEnableOption(int id, std::uint32_t flags);
}

namespace sce_http {
namespace {
// ORBIS_SYSMODULE_INTERNAL_*: libSceNet, libSceSsl and libSceHttp, loaded in that order (each uses the one before).
constexpr std::uint32_t kNetModule = 0x8000001C, kSslModule = 0x8000000B, kHttpModule = 0x8000000A;
// SCE_HTTPS_FLAG_SNI: the host name in the handshake, without which Cloudflare and GitHub refuse it.
constexpr std::uint32_t kHttpsSni = 0x80;
constexpr int kHttpVersion11 = 2;
constexpr int kHeaderOverwrite = 0;
constexpr int kContentLengthExists = 0;
constexpr std::size_t kReadSize = 64 * 1024;
// At most two kept open a thread: ten threads hold twenty sockets at most.
constexpr std::size_t kConnectionsPerClient = 2;
constexpr std::uint32_t kAborted = 0x80431080u;

std::mutex mutex;
bool started = false;
int net_pool = -1, ssl_context = -1, http_context = -1;
// app.json's userAgent, saying which console asks.
std::string agent;

bool resolver_error(std::uint32_t c) { return (c & 0xFFFFF000u) == 0x80436000u; }

// Connection-level failures: the network, a timeout, the server closing or a handshake cut short.
bool transient(int code) {
  const auto c = static_cast<std::uint32_t>(code);
  if (resolver_error(c)) return c != 0x80436007u && c != 0x8043600Au; // "no such host" stays
  if ((c & 0xFFFF0000u) == 0x80410000u) return true; // libSceNet's errno
  switch (c) {
    case 0x80431022u: // out of memory
    case 0x80431063u: // network
    case 0x80431064u: // bad response
    case 0x80431065u: // before send
    case 0x80431066u: // after send
    case 0x80431068u: // timeout
    case 0x80431082u: // EAGAIN
    case 0x80431085u: // broken connection
    case 0x80435061u: // TLS handshake
    case 0x80435062u: // TLS I/O
      return true;
    default:
      return false;
  }
}

std::string origin_of(const std::string& url) {
  const std::size_t scheme = url.find("://");
  if (scheme == std::string::npos) return url;
  const std::size_t end = url.find_first_of("/?#", scheme + 3);
  return url.substr(0, end);
}

std::string lower(std::string text) {
  for (char& c : text) if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
  return text;
}

std::string trim(std::string_view text) {
  while (!text.empty() && (text.front() == ' ' || text.front() == '\t')) text.remove_prefix(1);
  while (!text.empty() && (text.back() == ' ' || text.back() == '\t' || text.back() == '\r' || text.back() == '\n'))
    text.remove_suffix(1);
  return std::string(text);
}

// The method numbers sceHttpCreateRequestWithURL takes; others go by name.
int method_number(const std::string& method) {
  static constexpr const char* kMethods[] = {"GET", "POST", "HEAD", "OPTIONS", "PUT", "DELETE"};
  for (int i = 0; i < static_cast<int>(std::size(kMethods)); ++i)
    if (method == kMethods[i]) return i;
  return -1;
}

int init_libraries(std::size_t ssl_pool, std::size_t http_pool, std::string& error) {
  ssl_context = sceSslInit(ssl_pool);
  if (ssl_context < 0) {
    error = "sceSslInit failed: " + describe(ssl_context);
    return ssl_context;
  }
  http_context = sceHttpInit(net_pool, ssl_context, http_pool);
  if (http_context < 0) {
    error = "sceHttpInit failed: " + describe(http_context);
    sceSslTerm(ssl_context);
    ssl_context = -1;
    return http_context;
  }
  return 0;
}
} // namespace

const std::string& Exchange::header(const char* name) const {
  static const std::string none;
  for (const auto& [key, value] : response_headers) if (key == name) return value;
  return none;
}

std::string describe(int code) {
  const auto c = static_cast<std::uint32_t>(code);
  const char* words = nullptr;
  switch (c) {
    case 0x80431022u: words = "HTTP library out of memory"; break;
    case 0x80431060u: case 0x80433060u: words = "invalid URL"; break;
    case 0x80431061u: words = "unsupported URL scheme"; break;
    case 0x80431063u: words = "network error, could not connect"; break;
    case 0x80431064u: words = "bad response from the server"; break;
    case 0x80431065u: words = "could not connect"; break;
    case 0x80431066u: words = "connection lost after sending"; break;
    case 0x80431068u: words = "connection timed out"; break;
    case 0x80431073u: words = "response headers too large"; break;
    case 0x80431075u: words = "SSL error"; break;
    case kAborted: words = "aborted"; break;
    case 0x80431082u: words = "network busy, could not connect"; break;
    case 0x80431085u: words = "connection broken while receiving data"; break;
    case 0x80435060u: words = "SSL certificate not trusted"; break;
    case 0x80435061u: words = "SSL handshake failed"; break;
    case 0x80435062u: words = "SSL connection error while receiving data"; break;
    case 0x80435063u: words = "SSL internal error"; break;
    default: break;
  }
  if (!words && resolver_error(c))
    words = c == 0x80436007u || c == 0x8043600Au ? "could not resolve host (no such name)" : "could not resolve host";
  if (!words && (c & 0xFFFF0000u) == 0x80410000u) words = "network error, could not connect";
  if (!words && (c & 0xFFFFF000u) == 0x80435000u) words = "SSL error";
  char hex[16];
  std::snprintf(hex, sizeof hex, "0x%08x", c);
  return std::string(words ? words : "HTTP library error") + " (" + hex + ")";
}

bool start(std::string& error) {
  std::lock_guard lock(mutex);
  if (started) return true;
  // Each is already loaded in some titles: a failure here is logged, and the init below says whether it matters.
  for (const auto& [name, id] : {std::pair{"libSceNet", kNetModule}, {"libSceSsl", kSslModule}, {"libSceHttp", kHttpModule}}) {
    const int rc = sceSysmoduleLoadModuleInternal(id);
    ps4_log::write("[PS4-REACT] http: load %s 0x%08x", name, static_cast<unsigned>(rc));
  }
  const int net = sceNetInit();
  // The resolver's memory, for every connection looking up its host at once; less if the system refuses it.
  for (const int size : {1024 * 1024, 64 * 1024})
    if ((net_pool = sceNetPoolCreate("ps4-react-http", size, 0)) >= 0) break;
  ps4_log::write("[PS4-REACT] http: sceNetInit 0x%08x, pool %d", static_cast<unsigned>(net), net_pool);
  if (net_pool < 0) {
    error = "sceNetPoolCreate failed: " + describe(net_pool);
    return false;
  }
  // Room for the thirty or so connections the app keeps open (pictures, requests, downloads); smaller pools if the
  // system refuses, down to about Sony's sample's sizes.
  static constexpr std::pair<std::size_t, std::size_t> kPools[] = {{6 << 20, 6 << 20}, {2 << 20, 4 << 20}, {304 << 10, 512 << 10}};
  int rc = -1;
  for (const auto& [ssl_pool, http_pool] : kPools) {
    if ((rc = init_libraries(ssl_pool, http_pool, error)) >= 0) {
      ps4_log::write("[PS4-REACT] http: pools ssl %zu KiB, http %zu KiB", ssl_pool >> 10, http_pool >> 10);
      break;
    }
    ps4_log::write("[PS4-REACT] http: %s", error.c_str());
  }
  if (rc < 0) {
    sceNetPoolDestroy(net_pool);
    net_pool = -1;
    return false;
  }
  error.clear();
  agent = PS5_REACT_USER_AGENT;
  if (const std::size_t ps5 = agent.find("(PS5)"); ps5 != std::string::npos) agent.replace(ps5, 5, "(PS4)");
  else agent += " (PS4)";
  ps4_log::write("[PS4-REACT] http: ssl %d, http %d, agent %s", ssl_context, http_context, agent.c_str());
  started = true;
  return true;
}

void stop() {
  std::lock_guard lock(mutex);
  if (!started) return;
  sceHttpTerm(http_context);
  sceSslTerm(ssl_context);
  sceNetPoolDestroy(net_pool);
  http_context = ssl_context = net_pool = -1;
  started = false;
}

bool running() {
  std::lock_guard lock(mutex);
  return started;
}

void abort(int request) {
  if (request > 0) sceHttpAbortRequest(request);
}

Client::~Client() {
  for (const Connection& c : connections_) sceHttpDeleteConnection(c.id);
  if (template_ > 0) sceHttpDeleteTemplate(template_);
}

// A keep-alive connection to the URL's origin: one this client opened before, or a new one (the least recently used
// goes when there are too many). Negative is Sony's error code.
int Client::connection(const std::string& url, bool& reused) {
  reused = false;
  if (template_ <= 0) {
    template_ = sceHttpCreateTemplate(http_context, agent.c_str(), kHttpVersion11, 1);
    if (template_ < 0) {
      const int code = template_;
      template_ = 0;
      return code;
    }
    sceHttpSetConnectTimeOut(template_, 15 * 1000 * 1000);
    sceHttpSetSendTimeOut(template_, 30 * 1000 * 1000);
    sceHttpSetResolveTimeOut(template_, 10 * 1000 * 1000);
    sceHttpSetResolveRetry(template_, 2);
    // The bytes as the server sent them: downloads write the file itself, and ranges count raw bytes.
    sceHttpSetAcceptEncodingGZIPEnabled(template_, 0);
    sceHttpSetInflateGZIPEnabled(template_, 0);
    sceHttpSetResponseHeaderMaxSize(template_, 64 * 1024);
    // On in Sony's defaults; said again, since without it no request to Cloudflare or GitHub gets past the handshake.
    if (const int rc = sceHttpsEnableOption(template_, kHttpsSni); rc < 0)
      ps4_log::write("[PS4-REACT] http: SNI option 0x%08x", static_cast<unsigned>(rc));
  }
  const std::string origin = origin_of(url);
  for (Connection& c : connections_)
    if (c.origin == origin) {
      c.used = ++clock_;
      reused = true;
      return c.id;
    }
  if (connections_.size() >= kConnectionsPerClient) {
    auto oldest = std::min_element(connections_.begin(), connections_.end(),
                                   [](const Connection& a, const Connection& b) { return a.used < b.used; });
    drop(oldest->id);
  }
  const int id = sceHttpCreateConnectionWithURL(template_, url.c_str(), 1);
  if (id < 0) return id;
  connections_.push_back({origin, id, ++clock_});
  return id;
}

void Client::drop(int id) {
  for (auto it = connections_.begin(); it != connections_.end(); ++it)
    if (it->id == id) {
      sceHttpDeleteConnection(id);
      connections_.erase(it);
      return;
    }
}

bool Client::perform(Exchange& x, const Sink& sink, const std::atomic<bool>* abort, const Head& head) {
  x.status = 0;
  x.response_headers.clear();
  x.content_length = 0;
  x.length_known = x.transient = x.stopped = false;
  x.error.clear();
  if (buffer_.empty()) buffer_.resize(kReadSize);
  const std::uint64_t length = x.body ? x.body->size() : 0;
  const auto fail = [&](int code) {
    x.error = describe(code);
    x.transient = transient(code) && static_cast<std::uint32_t>(code) != kAborted;
    return false;
  };
  // Where the time goes, for the first requests and any slow one: until the answer (on a new connection, the name
  // lookup, the connection and the TLS handshake as well) and the whole. The host only: paths can carry a token.
  static std::atomic<int> timed{0};
  const auto began = std::chrono::steady_clock::now();
  const auto since = [&] {
    return static_cast<long long>(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - began).count());
  };
  long long answered_ms = -1;
  std::uint64_t received = 0;
  // A keep-alive connection the server has since closed fails at once: the request goes again on a new one.
  for (int attempt = 0;; ++attempt) {
    bool reused = false;
    const int connection_id = connection(x.url, reused);
    if (connection_id < 0) return fail(connection_id);
    const int method = method_number(x.method);
    const int request = method >= 0 ? sceHttpCreateRequestWithURL(connection_id, method, x.url.c_str(), length)
                                    : sceHttpCreateRequestWithURL2(connection_id, x.method.c_str(), x.url.c_str(), length);
    if (request < 0) {
      drop(connection_id);
      return fail(request);
    }
    current = request;
    const auto finish = [&](bool keep) {
      current = 0;
      sceHttpDeleteRequest(request);
      if (!keep) drop(connection_id);
    };
    sceHttpSetAutoRedirect(request, x.follow_redirects ? 1 : 0);
    sceHttpSetRecvTimeOut(request, std::max(1u, x.timeout_seconds) * 1000u * 1000u);
    for (const std::string& line : x.headers) {
      const std::size_t colon = line.find(':');
      if (colon == std::string::npos) continue;
      const std::string name = trim(std::string_view(line).substr(0, colon)), value = trim(std::string_view(line).substr(colon + 1));
      sceHttpAddRequestHeader(request, name.c_str(), value.c_str(), kHeaderOverwrite);
    }
    if (abort && abort->load()) {
      finish(true);
      x.stopped = true;
      return true;
    }
    int rc = sceHttpSendRequest(request, x.body ? x.body->data() : nullptr, x.body ? x.body->size() : 0);
    if (rc < 0) {
      finish(false);
      if (reused && attempt == 0 && static_cast<std::uint32_t>(rc) != kAborted && !(abort && abort->load())) continue;
      return fail(rc);
    }
    answered_ms = since();
    if ((rc = sceHttpGetStatusCode(request, &x.status)) < 0) {
      finish(false);
      return fail(rc);
    }
    char* raw = nullptr;
    std::size_t raw_size = 0;
    if (sceHttpGetAllResponseHeaders(request, &raw, &raw_size) >= 0 && raw) {
      // Name: value lines; the status line, if the block starts with one, is not a header.
      std::string_view text(raw, raw_size);
      while (!text.empty() && x.response_headers.size() < 64) {
        const std::size_t end = text.find('\n');
        const std::string_view line = text.substr(0, end);
        text = end == std::string_view::npos ? std::string_view() : text.substr(end + 1);
        const std::size_t colon = line.find(':');
        if (colon == std::string_view::npos || line.starts_with("HTTP/")) continue;
        x.response_headers.emplace_back(lower(trim(line.substr(0, colon))), trim(line.substr(colon + 1)));
      }
    }
    int kind = -1;
    std::uint64_t announced = 0;
    if (sceHttpGetResponseContentLength(request, &kind, &announced) >= 0 && kind == kContentLengthExists) {
      x.content_length = announced;
      x.length_known = true;
    }
    if (head && !head()) {
      finish(false);
      x.stopped = true;
      return true;
    }
    if (x.method == "HEAD") {
      finish(true);
      return true;
    }
    for (;;) {
      if (abort && abort->load()) {
        finish(false);
        x.stopped = true;
        return true;
      }
      const int count = sceHttpReadData(request, buffer_.data(), buffer_.size());
      if (count < 0) {
        finish(false);
        return fail(count);
      }
      if (count == 0) break;
      received += static_cast<std::uint64_t>(count);
      if (!sink(buffer_.data(), static_cast<std::size_t>(count))) {
        finish(false);
        x.stopped = true;
        return true;
      }
    }
    finish(true);
    if (const long long whole = since(); timed.fetch_add(1) < 24 || whole > 3000) {
      const std::size_t start = x.url.find("://") == std::string::npos ? 0 : x.url.find("://") + 3;
      std::string host = x.url.substr(start, x.url.find_first_of("/?#", start) - start);
      if (const std::size_t at = host.rfind('@'); at != std::string::npos) host.erase(0, at + 1);
      ps4_log::write("[PS4-REACT] http: %s on a %s connection, answered in %lld ms, whole %lld ms, %llu KiB, HTTP %d",
                     host.c_str(), reused ? "kept" : "new", answered_ms, whole, static_cast<unsigned long long>(received >> 10), x.status);
    }
    return true;
  }
}
} // namespace sce_http
