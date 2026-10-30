// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "http_server.hpp"
#include "thread_name.hpp"
#include "worker_thread.hpp"
#include <algorithm>
#include <arpa/inet.h>
#include <atomic>
#include <cctype>
#include <cerrno>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <fcntl.h>
#include <map>
#include <memory>
#include <mutex>
#include <netinet/in.h>
#include <openssl/rand.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

namespace http_server {
namespace {
using Clock = std::chrono::steady_clock;
// Every wait is sliced, so stop() is noticed within this long; nothing spins.
constexpr int kSliceMs = 100;

struct Pending {
  Request request;
  bool delivered = false, answered = false;
  int status = 0;
  std::string type, body;
};

std::mutex mutex;
std::condition_variable answered;
std::map<std::uint32_t, std::shared_ptr<Pending>> pending;
std::uint32_t next_id = 1;
Status current;
std::string pin, page;
// Signed-in phones' cookies, oldest first; and each device's wrong PINs and when it may try again.
std::deque<std::string> sessions;
// MODIFIED (Jobee'sLair 0.5.0): the app's own session cookie, when it gave one (start's `session`).
std::string fixed_session;
struct Guesser {
  int failures = 0;
  Clock::time_point retry_at{};
};
std::map<std::string, Guesser> guessers;
std::atomic<bool> stopping{false};
bool running = false;
WorkerThread worker;

// Event streams (ABI v24), held by their own worker. Their list has its own lock, taken before `mutex` when
// both are needed; the stream worker never waits on a socket while holding it (every write is non-blocking).
struct Stream {
  int fd = -1;
  std::string backlog; // written as the socket takes it
  Clock::time_point last_write{};
};
std::mutex streams_mutex;
std::condition_variable streams_wake;
std::deque<Stream> streams;
bool streams_dirty = false;
WorkerThread streamer;

#ifdef MSG_NOSIGNAL
constexpr int kNoSignal = MSG_NOSIGNAL; // a client that hung up must not end the title with SIGPIPE
#else
constexpr int kNoSignal = 0;
#endif
// Every socket call is non-blocking and waits only in poll, under a deadline. A blocking send() of a
// large answer waits until all of it is queued, however long a stalled phone takes to read: the worker
// would hang there, and stop() on the render thread with it. Sockets are also set O_NONBLOCK (below);
// the flags hold even where that fails.
constexpr int kSendFlags = kNoSignal | MSG_DONTWAIT, kRecvFlags = MSG_DONTWAIT;

bool would_block() {
  return errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR;
}

void set_nonblocking(int fd) {
  const int flags = ::fcntl(fd, F_GETFL, 0);
  if (flags >= 0) ::fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

void set_status(const char* state, std::string error = {}) {
  std::lock_guard lock(mutex);
  current.state = state;
  current.error = std::move(error);
}

// Waits up to one slice for `events` on `fd`: 1 ready (or hung up, which the next call reports), 0 not
// yet, -1 failed.
int poll_slice(int fd, short events, Clock::time_point deadline) {
  const auto left = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - Clock::now()).count();
  if (left <= 0) return 0;
  pollfd waiting{fd, events, 0};
  const int ready = ::poll(&waiting, 1, static_cast<int>(std::min<long long>(left, kSliceMs)));
  if (ready < 0) return errno == EINTR ? 0 : -1;
  if (ready == 0) return 0;
  return (waiting.revents & (events | POLLHUP | POLLERR)) != 0 ? 1 : -1;
}

// Reads give up once the server is stopping.
bool wait_ready(int fd, short events, Clock::time_point deadline) {
  while (!stopping && Clock::now() < deadline) {
    const int ready = poll_slice(fd, events, deadline);
    if (ready) return ready > 0;
  }
  return false;
}

bool send_all(int fd, const char* data, std::size_t size) {
  // While stopping, a client still hears why (503), but only briefly: stop() must not wait on it. A
  // stop that comes during a long write (a slow phone) cuts the rest to the same short grace, so the
  // render thread's stop() never waits out the full kWriteMs.
  constexpr auto kStopGrace = std::chrono::milliseconds(500);
  auto deadline = Clock::now() + (stopping ? kStopGrace : std::chrono::milliseconds(kWriteMs));
  bool cut = stopping;
  while (size) {
    if (!cut && stopping) {
      cut = true;
      deadline = std::min(deadline, Clock::now() + kStopGrace);
    }
    if (Clock::now() >= deadline) return false;
    const int ready = poll_slice(fd, POLLOUT, deadline);
    if (ready < 0) return false;
    if (ready == 0) continue; // no room yet: look at `stopping` again, then keep waiting
    const ssize_t sent = ::send(fd, data, size, kSendFlags);
    if (sent < 0 && would_block()) continue;
    if (sent <= 0) return false;
    data += sent;
    size -= static_cast<std::size_t>(sent);
  }
  return true;
}

const char* reason(int status) {
  switch (status) {
    case 200: return "OK";
    case 204: return "No Content";
    case 400: return "Bad Request";
    case 401: return "Unauthorized";
    case 403: return "Forbidden";
    case 404: return "Not Found";
    case 405: return "Method Not Allowed";
    case 409: return "Conflict";
    case 413: return "Payload Too Large";
    case 423: return "Locked";
    case 429: return "Too Many Requests";
    case 431: return "Request Header Fields Too Large";
    case 500: return "Internal Server Error";
    case 503: return "Service Unavailable";
    case 504: return "Gateway Timeout";
    default: return "Status";
  }
}

void reply(int fd, int status, const std::string& type, const std::string& body, const std::string& extra = {}) {
  std::string head = "HTTP/1.1 " + std::to_string(status) + " " + reason(status) + "\r\n";
  if (!type.empty()) head += "Content-Type: " + type + "\r\n";
  head += extra; // more header lines, each ending in CRLF
  head += "Content-Length: " + std::to_string(body.size()) + "\r\n"
          "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n"
          "Connection: close\r\n\r\n";
  if (send_all(fd, head.data(), head.size()) && !body.empty()) send_all(fd, body.data(), body.size());
  std::lock_guard lock(mutex);
  ++current.served;
}

void reply_json_error(int fd, int status, const char* message) {
  reply(fd, status, "application/json", std::string("{\"error\":\"") + message + "\"}");
}

std::string lower(std::string text) {
  for (auto& c : text) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return text;
}

// Constant time in the token's length: the comparison says nothing about how much of a guess was right.
bool same_token(const std::string& offered, const std::string& expected) {
  if (offered.size() != expected.size()) return false;
  unsigned char difference = 0;
  for (std::size_t i = 0; i < expected.size(); ++i) difference |= static_cast<unsigned char>(offered[i] ^ expected[i]);
  return difference == 0;
}

// Reads one request: its head (up to kMaxHeaderBytes), then Content-Length bytes of body. Answers and
// returns false itself when the request is malformed or too large.
bool read_request(int fd, std::string& method, std::string& target, std::map<std::string, std::string>& headers,
                  std::string& body) {
  const auto deadline = Clock::now() + std::chrono::milliseconds(kReadMs);
  std::string data;
  std::size_t end = std::string::npos;
  char chunk[4096];
  while ((end = data.find("\r\n\r\n")) == std::string::npos) {
    if (data.size() > kMaxHeaderBytes) {
      reply_json_error(fd, 431, "request head too large");
      return false;
    }
    if (!wait_ready(fd, POLLIN, deadline)) return false;
    const ssize_t got = ::recv(fd, chunk, sizeof chunk, kRecvFlags);
    if (got < 0 && would_block()) continue;
    if (got <= 0) return false;
    data.append(chunk, static_cast<std::size_t>(got));
  }
  if (end > kMaxHeaderBytes) {
    reply_json_error(fd, 431, "request head too large");
    return false;
  }
  const std::size_t line_end = data.find("\r\n");
  const std::string line = data.substr(0, line_end);
  const std::size_t first = line.find(' '), second = first == std::string::npos ? first : line.find(' ', first + 1);
  if (first == std::string::npos || second == std::string::npos || line.compare(second + 1, 5, "HTTP/") != 0) {
    reply_json_error(fd, 400, "malformed request line");
    return false;
  }
  method = line.substr(0, first);
  target = line.substr(first + 1, second - first - 1);
  if (target.empty() || target[0] != '/') {
    reply_json_error(fd, 400, "malformed target");
    return false;
  }
  for (std::size_t at = line_end + 2; at < end;) {
    const std::size_t next = data.find("\r\n", at);
    const std::string field = data.substr(at, next - at);
    at = next + 2;
    const std::size_t colon = field.find(':');
    if (colon == std::string::npos) continue;
    std::string value = field.substr(colon + 1);
    value.erase(0, value.find_first_not_of(" \t"));
    value.erase(value.find_last_not_of(" \t") + 1);
    headers[lower(field.substr(0, colon))] = value;
  }
  std::size_t length = 0;
  if (const auto found = headers.find("content-length"); found != headers.end()) {
    char* stop = nullptr;
    const unsigned long long parsed = std::strtoull(found->second.c_str(), &stop, 10);
    if (found->second.empty() || *stop || parsed > kMaxBodyBytes) {
      reply_json_error(fd, 413, "body too large");
      return false;
    }
    length = static_cast<std::size_t>(parsed);
  }
  if (headers.count("transfer-encoding")) {
    reply_json_error(fd, 400, "chunked bodies are not accepted");
    return false;
  }
  body = data.substr(end + 4);
  while (body.size() < length) {
    if (!wait_ready(fd, POLLIN, deadline)) return false;
    const ssize_t got = ::recv(fd, chunk, std::min(sizeof chunk, length - body.size()), kRecvFlags);
    if (got < 0 && would_block()) continue;
    if (got <= 0) return false;
    body.append(chunk, static_cast<std::size_t>(got));
  }
  body.resize(length);
  return true;
}

// Queues an API request for the app and waits for its answer.
void ask_app(int fd, Request request) {
  auto entry = std::make_shared<Pending>();
  std::uint32_t id = 0;
  {
    std::lock_guard lock(mutex);
    if (pending.size() >= 16) {
      // The app is not answering (busy or paused): refuse rather than queue without end.
      entry = nullptr;
    } else {
      id = next_id++;
      if (!next_id) next_id = 1;
      request.id = id;
      entry->request = std::move(request);
      pending.emplace(id, entry);
    }
  }
  if (!entry) {
    reply_json_error(fd, 503, "the console is busy; try again");
    return;
  }
  std::unique_lock lock(mutex);
  const bool done = answered.wait_for(lock, std::chrono::milliseconds(kAnswerMs),
                                      [&] { return entry->answered || stopping.load(); });
  pending.erase(id);
  lock.unlock();
  if (!done || !entry->answered) {
    reply_json_error(fd, stopping ? 503 : 504, stopping ? "the server is stopping" : "the console did not answer in time");
    return;
  }
  reply(fd, entry->status, entry->type, entry->body);
}

// The Host a request names: an IPv4 address (with a port) or localhost. A domain name is how a web page
// would reach the console through DNS rebinding; no browser on the network needs one to reach it.
bool literal_host(const std::map<std::string, std::string>& headers) {
  const auto found = headers.find("host");
  if (found == headers.end()) return true; // HTTP/1.0 tools; every browser sends one
  std::string host = lower(found->second);
  if (const auto colon = host.rfind(':'); colon != std::string::npos) {
    const std::string port = host.substr(colon + 1);
    if (port.empty() || port.size() > 5 || port.find_first_not_of("0123456789") != std::string::npos) return false;
    host.resize(colon);
  }
  if (host == "localhost") return true;
  int parts = 0;
  for (std::size_t at = 0; at <= host.size(); ++parts) {
    const std::size_t dot = std::min(host.find('.', at), host.size());
    const std::string part = host.substr(at, dot - at);
    if (part.empty() || part.size() > 3 || part.find_first_not_of("0123456789") != std::string::npos || std::stoi(part) > 255)
      return false;
    at = dot + 1;
  }
  return parts == 4;
}

// A header only this page's own script adds: a form or page on another site cannot send it unasked.
bool own_page(const std::map<std::string, std::string>& headers) {
  const auto found = headers.find("x-jbh");
  return found != headers.end() && found->second == "1";
}

std::string cookie_session(const std::map<std::string, std::string>& headers) {
  const auto found = headers.find("cookie");
  if (found == headers.end()) return {};
  const std::string& cookies = found->second;
  for (std::size_t at = 0; at < cookies.size();) {
    const std::size_t end = std::min(cookies.find(';', at), cookies.size());
    std::string pair = cookies.substr(at, end - at);
    pair.erase(0, pair.find_first_not_of(' '));
    if (pair.rfind("jbh=", 0) == 0) return pair.substr(4);
    at = end + 1;
  }
  return {};
}

bool signed_in(const std::string& offered) {
  if (offered.empty()) return false;
  bool match = false;
  std::lock_guard lock(mutex);
  for (const auto& session : sessions) match |= same_token(offered, session); // every one, in constant time
  if (!fixed_session.empty()) match |= same_token(offered, fixed_session);
  return match;
}

// POST /auth {"pin": "1234"}: the right PIN gets a session cookie; wrong ones are counted and slowed.
void sign_in(int fd, const std::string& client, const std::string& body) {
  std::string digits;
  for (const char c : body)
    if (c >= '0' && c <= '9') digits += c;
  int status = 0, wait = 0;
  std::string message, cookie;
  {
    std::lock_guard lock(mutex);
    const auto now = Clock::now();
    if (guessers.size() > 1024)
      for (auto it = guessers.begin(); it != guessers.end();) it = it->second.retry_at <= now ? guessers.erase(it) : std::next(it);
    Guesser& guesser = guessers[client];
    if (current.locked) {
      status = 423;
      message = "Too many wrong PINs. Turn the phone companion off and on in Settings to sign in.";
    } else if (now < guesser.retry_at) {
      status = 429;
      wait = static_cast<int>(std::chrono::duration_cast<std::chrono::seconds>(guesser.retry_at - now).count()) + 1;
      message = "Too many tries. Wait a moment.";
    } else if (body.size() <= 64 && digits.size() == kPinDigits && same_token(digits, pin)) {
      cookie = fixed_session.empty() ? random_token(16) : fixed_session;
      if (cookie.empty()) {
        status = 503;
        message = "The console could not make a session. Try again.";
      } else {
        guessers.erase(client);
        if (fixed_session.empty()) {
          sessions.push_back(cookie);
          if (sessions.size() > kMaxSessions) sessions.pop_front();
          current.sessions = sessions.size();
        } else if (current.sessions < kMaxSessions) {
          ++current.sessions; // sign-ins: every phone shares the one cookie
        }
        status = 200;
      }
    } else {
      ++guesser.failures;
      ++current.failures;
      if (current.failures >= kLockAfterFailures) {
        current.locked = true;
        status = 423;
        message = "Too many wrong PINs. Turn the phone companion off and on in Settings to sign in.";
      } else {
        status = 401;
        message = "Wrong PIN.";
        if (guesser.failures >= kFreeAttempts) {
          wait = std::min(kMaxWaitSeconds, 1 << std::min(guesser.failures - kFreeAttempts + 1, 5)); // 2, 4, 8, 16, 30 s
          guesser.retry_at = now + std::chrono::seconds(wait);
        }
      }
    }
  }
  if (status == 200)
    return reply(fd, 200, "application/json", "{\"ok\":true}", "Set-Cookie: jbh=" + cookie + "; Path=/; HttpOnly; SameSite=Strict\r\n");
  const std::string retry = wait ? ",\"retryAfter\":" + std::to_string(wait) : "";
  reply(fd, status, "application/json", "{\"error\":\"" + message + "\"" + retry + "}",
        wait ? "Retry-After: " + std::to_string(wait) + "\r\n" : std::string());
}

void close_socket(int fd) {
  ::shutdown(fd, SHUT_RDWR);
  close(fd);
}

void count_streams() {
  const std::size_t open = streams.size(); // streams_mutex is held
  std::lock_guard lock(mutex);
  current.streams = open;
}

// GET /api/events, signed in: the head, then the socket goes to the stream worker, which owns it from here.
// A ninth stream closes the oldest: a phone that reloaded its page never waits for its old stream to time out.
bool open_stream(int fd) {
  static const std::string head =
      "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\nCache-Control: no-store\r\n"
      "X-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n: open\n\n";
  if (!send_all(fd, head.data(), head.size())) return false;
  {
    std::lock_guard lock(mutex);
    ++current.served;
  }
  std::lock_guard lock(streams_mutex);
  if (stopping) return false;
  while (streams.size() >= kMaxStreams) {
    close_socket(streams.front().fd);
    streams.pop_front();
  }
  streams.push_back({fd, {}, Clock::now()});
  count_streams();
  streams_dirty = true;
  streams_wake.notify_all();
  return true;
}

// The stream worker: writes each stream's backlog as its socket takes it, adds a comment line to a stream
// quiet for kKeepAliveMs (a phone gone without a word shows up as a failed write), and closes a stream whose
// phone hung up, failed a write, or fell kMaxStreamBacklog behind. A push wakes it at once; otherwise it
// looks every 50 ms while streams are open.
void stream_loop() {
  name_thread("http-events");
  std::vector<pollfd> waiting;
  while (!stopping) {
    {
      std::unique_lock lock(streams_mutex);
      if (streams.empty()) {
        streams_wake.wait_for(lock, std::chrono::milliseconds(kSliceMs), [] { return stopping.load() || streams_dirty; });
        streams_dirty = false;
        continue;
      }
      waiting.clear();
      const auto now = Clock::now();
      for (Stream& stream : streams) {
        if (stream.backlog.empty() && now - stream.last_write >= std::chrono::milliseconds(kKeepAliveMs))
          stream.backlog = ": keep-alive\n\n";
        waiting.push_back({stream.fd, static_cast<short>(POLLIN | (stream.backlog.empty() ? 0 : POLLOUT)), 0});
      }
      streams_dirty = false;
    }
    // Sockets are only polled here; the list may change meanwhile (a new stream, a push), which the next turn sees.
    if (::poll(waiting.data(), waiting.size(), 50) < 0 && errno != EINTR) ::poll(nullptr, 0, kSliceMs);
    std::lock_guard lock(streams_mutex);
    bool changed = false;
    for (auto it = streams.begin(); it != streams.end();) {
      const auto seen = std::find_if(waiting.begin(), waiting.end(), [&](const pollfd& p) { return p.fd == it->fd; });
      bool drop = it->backlog.size() > kMaxStreamBacklog;
      if (!drop && seen != waiting.end() && (seen->revents & (POLLIN | POLLHUP | POLLERR))) {
        // A phone says nothing on a stream: anything readable is it hanging up (or noise, dropped).
        char ignored[512];
        const ssize_t got = ::recv(it->fd, ignored, sizeof ignored, kRecvFlags);
        drop = got == 0 || (got < 0 && !would_block());
      }
      while (!drop && !it->backlog.empty()) {
        const ssize_t sent = ::send(it->fd, it->backlog.data(), it->backlog.size(), kSendFlags);
        if (sent < 0 && would_block()) break;
        if (sent <= 0) {
          drop = true;
          break;
        }
        it->backlog.erase(0, static_cast<std::size_t>(sent));
        it->last_write = Clock::now();
      }
      if (drop) {
        close_socket(it->fd);
        it = streams.erase(it);
        changed = true;
      } else {
        ++it;
      }
    }
    if (changed) count_streams();
  }
  std::lock_guard lock(streams_mutex);
  if (streams.empty()) return; // start() may be joining this thread with `mutex` held: count only when needed
  for (const Stream& stream : streams) close_socket(stream.fd);
  streams.clear();
  count_streams();
}

// One event in the text/event-stream format: CR, LF and CRLF all end a line, and each line is its own
// "data:" field, so nothing in the data can end the event early or start another.
std::string event_text(const std::string& name, const std::string& data) {
  std::string out = "event: " + name + "\ndata: ";
  out.reserve(data.size() + name.size() + 32);
  for (std::size_t i = 0; i < data.size(); ++i) {
    const char c = data[i];
    if (c == '\r' || c == '\n') {
      if (c == '\r' && i + 1 < data.size() && data[i + 1] == '\n') ++i;
      out += "\ndata: ";
    } else {
      out += c;
    }
  }
  out += "\n\n";
  return out;
}

// Returns true when the socket went to the stream worker (the caller must not close it).
bool serve(int fd, const std::string& client) {
  std::string method, target, body;
  std::map<std::string, std::string> headers;
  if (!read_request(fd, method, target, headers, body)) return false;
  if (!literal_host(headers)) return reply_json_error(fd, 403, "open the console by its IP address"), false;
  const std::size_t mark = target.find('?');
  const std::string path = target.substr(0, mark), query = mark == std::string::npos ? "" : target.substr(mark + 1);
  if (path == "/" || path == "/index.html") {
    if (method != "GET" && method != "HEAD") return reply_json_error(fd, 405, "method not allowed"), false;
    std::string copy;
    {
      std::lock_guard lock(mutex);
      copy = page;
    }
    return reply(fd, 200, "text/html; charset=utf-8", method == "HEAD" ? std::string() : copy), false;
  }
  if (path == "/favicon.ico") return reply(fd, 204, "", ""), false;
  if (path == "/auth") {
    if (method != "POST") return reply_json_error(fd, 405, "method not allowed"), false;
    if (!own_page(headers)) return reply_json_error(fd, 403, "missing X-JBH header"), false;
    return sign_in(fd, client, body), false;
  }
  if (path.rfind("/api/", 0) != 0) return reply_json_error(fd, 404, "not found"), false;
  if (method != "GET" && method != "POST" && method != "DELETE") return reply_json_error(fd, 405, "method not allowed"), false;
  if (!own_page(headers)) return reply_json_error(fd, 403, "missing X-JBH header"), false;
  if (!signed_in(cookie_session(headers))) return reply_json_error(fd, 401, "sign in with the PIN"), false;
  // The stream is the server's own; the app only pushes to it (push()).
  if (path == "/api/events") {
    if (method != "GET") return reply_json_error(fd, 405, "method not allowed"), false;
    return open_stream(fd);
  }
  Request request;
  request.method = method;
  request.path = path;
  request.query = query;
  request.body = std::move(body);
  request.client = client;
  ask_app(fd, std::move(request));
  return false;
}

std::string port_name(std::uint16_t port) {
  return port ? "port " + std::to_string(port) : "a free port";
}

// A listening socket on the first port that binds; -1, with every port's failure in `why`, when none does.
int open_listener(const std::vector<std::uint16_t>& ports, std::uint16_t& bound, std::string& why) {
  for (const std::uint16_t port : ports) {
    const int listener = ::socket(AF_INET, SOCK_STREAM, 0);
    if (listener < 0) {
      why = std::string("socket: ") + std::strerror(errno) + " (errno " + std::to_string(errno) + ")";
      return -1; // no socket at all: no other port will do better
    }
    const int on = 1;
    setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &on, sizeof on);
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(port);
    address.sin_addr.s_addr = htonl(INADDR_ANY);
    const char* step = "bind";
    bool ok = ::bind(listener, reinterpret_cast<const sockaddr*>(&address), sizeof address) == 0;
    if (ok) {
      step = "listen";
      ok = ::listen(listener, 8) == 0;
      // A connection reset between poll and accept must not leave accept() waiting for the next one.
      if (ok) set_nonblocking(listener);
    }
    sockaddr_in self{};
    socklen_t size = sizeof self;
    if (ok) {
      step = "getsockname";
      ok = ::getsockname(listener, reinterpret_cast<sockaddr*>(&self), &size) == 0 && self.sin_port != 0;
    }
    if (ok) {
      bound = ntohs(self.sin_port);
      return listener;
    }
    const int failure = errno;
    close(listener);
    if (!why.empty()) why += "; ";
    why += port_name(port) + ": " + (failure == EADDRINUSE ? std::string("in use by another app")
                                                            : std::string(step) + " failed, " + std::strerror(failure)) +
           " (errno " + std::to_string(failure) + ")";
  }
  return -1;
}

void run(std::vector<std::uint16_t> ports) {
  name_thread("http-server");
  std::uint16_t bound = 0;
  std::string why;
  const int listener = open_listener(ports, bound, why);
  if (listener < 0) return set_status("failed", why);
  // Looked up here, never on the render thread: it opens a socket of its own.
  std::string here = local_address();
  {
    std::lock_guard lock(mutex);
    current.port = bound;
    current.address = here;
  }
  set_status("listening");
  auto looked = Clock::now();
  while (!stopping) {
    // The console may join a network (or change address) while it listens.
    if (Clock::now() - looked > std::chrono::seconds(10)) {
      looked = Clock::now();
      here = local_address();
      std::lock_guard lock(mutex);
      current.address = here;
    }
    pollfd waiting{listener, POLLIN, 0};
    const int ready = ::poll(&waiting, 1, kSliceMs);
    if (ready < 0 && errno != EINTR) {
      const int failure = errno;
      set_status("failed", std::string("poll: ") + std::strerror(failure));
      break;
    }
    if (ready <= 0 || !(waiting.revents & POLLIN)) continue;
    sockaddr_in from{};
    socklen_t from_size = sizeof from;
    const int client = ::accept(listener, reinterpret_cast<sockaddr*>(&from), &from_size);
    if (client < 0) {
      // Out of descriptors or buffers: the connection stays queued and poll reports it again at once,
      // so wait a slice instead of spinning the worker until it clears.
      if (!would_block() && errno != ECONNABORTED) ::poll(nullptr, 0, kSliceMs);
      continue;
    }
    set_nonblocking(client); // Linux does not hand it the listener's O_NONBLOCK
#ifdef SO_NOSIGPIPE
    const int on = 1; // the console's headers have it (Linux has MSG_NOSIGNAL alone)
    setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &on, sizeof on);
#endif
    char peer[INET_ADDRSTRLEN] = {};
    inet_ntop(AF_INET, &from.sin_addr, peer, sizeof peer);
    if (!serve(client, peer)) close_socket(client);
  }
  close(listener);
}
} // namespace

bool start(std::vector<std::uint16_t> ports, std::string code, std::string html, std::string session, std::string& error) {
  if (ports.empty() || ports.size() > kMaxPorts) {
    error = "give 1..8 ports to try";
    return false;
  }
  if (code.size() != kPinDigits || code.find_first_not_of("0123456789") != std::string::npos) {
    error = "the PIN must be 6 digits";
    return false;
  }
  if (html.size() > kMaxPageBytes) {
    error = "the page is larger than 512 KiB";
    return false;
  }
  if (!session.empty() && (session.size() < kMinSessionChars || session.size() > kMaxSessionChars ||
                           session.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789") != std::string::npos)) {
    error = "the session must be 16..64 lowercase letters and digits";
    return false;
  }
  std::lock_guard lock(mutex);
  if (running) {
    error = "already running; stop it first";
    return false;
  }
  pin = std::move(code);
  page = std::move(html);
  fixed_session = std::move(session);
  sessions.clear();
  guessers.clear();
  current = Status{};
  current.state = "starting"; // the worker reports 'listening' or 'failed' once it has tried the ports
  stopping = false;
  if (!streamer.start(stream_loop, 128 * 1024)) {
    current.state = "failed";
    current.error = "could not start the event stream thread";
    error = current.error;
    return false;
  }
  if (!worker.start([ports = std::move(ports)] { run(ports); }, 256 * 1024)) {
    stopping = true;
    streams_wake.notify_all();
    streamer.join();
    current.state = "failed";
    current.error = "could not start the server thread";
    error = current.error;
    return false;
  }
  running = true;
  return true;
}

bool set_page(std::string html, std::string& error) {
  if (html.size() > kMaxPageBytes) {
    error = "the page is larger than 512 KiB";
    return false;
  }
  std::lock_guard lock(mutex);
  if (!running) {
    error = "the server is not running";
    return false;
  }
  page = std::move(html);
  return true;
}

void stop() {
  {
    std::lock_guard lock(mutex);
    if (!running) return;
    stopping = true;
  }
  answered.notify_all();
  worker.join();
  {
    std::lock_guard lock(streams_mutex);
    streams_dirty = true;
  }
  streams_wake.notify_all();
  streamer.join(); // closes every stream
  std::lock_guard lock(mutex);
  running = false;
  pending.clear();
  if (current.state != "failed") current.state = "stopped";
  pin.clear();
  page.clear();
  sessions.clear(); // every phone signs in again with the PIN the server next starts with
  fixed_session.clear();
  guessers.clear();
  current.sessions = 0;
}

Status status() {
  std::lock_guard lock(mutex);
  return current;
}

std::vector<Request> poll(std::size_t max) {
  std::vector<Request> out;
  std::lock_guard lock(mutex);
  for (auto& [id, entry] : pending) {
    if (out.size() >= max) break;
    if (entry->delivered) continue;
    entry->delivered = true;
    out.push_back(entry->request);
  }
  return out;
}

bool respond(std::uint32_t id, int code, std::string content_type, std::string body) {
  if (code < 200 || code > 599 || body.size() > kMaxResponseBytes ||
      content_type.find_first_of("\r\n") != std::string::npos)
    return false;
  {
    std::lock_guard lock(mutex);
    const auto found = pending.find(id);
    if (found == pending.end() || found->second->answered) return false;
    found->second->answered = true;
    found->second->status = code;
    found->second->type = std::move(content_type);
    found->second->body = std::move(body);
  }
  answered.notify_all();
  return true;
}

bool event_name(const std::string& name) {
  return !name.empty() && name.size() <= kMaxEventName &&
         name.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789-") == std::string::npos;
}

std::size_t push(const std::string& name, const std::string& data, bool& ok) {
  ok = event_name(name) && data.size() <= kMaxEventBytes;
  if (!ok) return 0;
  std::size_t taken = 0;
  {
    std::lock_guard lock(streams_mutex);
    if (streams.empty()) return 0;
    const std::string text = event_text(name, data);
    for (Stream& stream : streams) stream.backlog += text; // a stream past kMaxStreamBacklog is closed by its worker
    taken = streams.size();
    streams_dirty = true;
  }
  streams_wake.notify_all();
  std::lock_guard lock(mutex);
  ++current.pushed;
  return taken;
}

std::string local_address() {
  // Connecting a UDP socket only picks the route and source address; nothing is sent.
  const int fd = ::socket(AF_INET, SOCK_DGRAM, 0);
  if (fd < 0) return {};
  sockaddr_in to{};
  to.sin_family = AF_INET;
  to.sin_port = htons(53);
  inet_pton(AF_INET, "192.0.2.1", &to.sin_addr); // TEST-NET-1: routed by default, never answered
  std::string out;
  sockaddr_in self{};
  socklen_t size = sizeof self;
  if (::connect(fd, reinterpret_cast<const sockaddr*>(&to), sizeof to) == 0 &&
      ::getsockname(fd, reinterpret_cast<sockaddr*>(&self), &size) == 0 && self.sin_addr.s_addr != htonl(INADDR_ANY)) {
    char text[INET_ADDRSTRLEN] = {};
    if (inet_ntop(AF_INET, &self.sin_addr, text, sizeof text)) out = text;
  }
  close(fd);
  return out;
}

std::string random_token(std::size_t bytes) {
  static constexpr char kAlphabet[] = "abcdefghijklmnopqrstuvwxyz234567";
  bytes = std::clamp<std::size_t>(bytes, 5, 40);
  std::vector<unsigned char> raw(bytes);
  if (RAND_bytes(raw.data(), static_cast<int>(raw.size())) != 1) return {};
  std::string out;
  unsigned buffer = 0, bits = 0;
  for (const unsigned char byte : raw) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += kAlphabet[(buffer >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += kAlphabet[(buffer << (5 - bits)) & 31];
  return out;
}
} // namespace http_server
