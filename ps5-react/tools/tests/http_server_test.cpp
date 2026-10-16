// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// native/shared/http_server.cpp over real sockets on loopback: routes, PIN sign-in and session cookies,
// the X-JBH and Host checks, per-device throttling (devices are 127.0.0.x source addresses) and the
// lockout, the poll/respond hand-off, limits, busy ports and the port list, stalled and vanishing
// clients, and stopping with requests in flight.
//   clang++ -std=c++20 -I native/shared tools/tests/http_server_test.cpp native/shared/http_server.cpp -lcrypto -lpthread
#include "http_server.hpp"
#include <arpa/inet.h>
#include <atomic>
#include <cassert>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <netinet/in.h>
#include <set>
#include <string>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

using namespace std::chrono_literals;
namespace {
std::uint16_t port = 0;
const std::string kPin = "135790"; // a six-digit PIN, as the player chooses one

// A connection from 127.0.0.`device` (each its own "phone" to the throttle).
int connect_to(std::uint16_t to, int device = 1) {
  const int fd = socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in from{};
  from.sin_family = AF_INET;
  from.sin_addr.s_addr = htonl(0x7f000000u | static_cast<unsigned>(device));
  assert(bind(fd, reinterpret_cast<sockaddr*>(&from), sizeof from) == 0);
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(to);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  assert(connect(fd, reinterpret_cast<sockaddr*>(&address), sizeof address) == 0);
  return fd;
}

struct Reply {
  int status = 0;
  std::string head, body;
};

Reply exchange(const std::string& raw, std::uint16_t to = port, int device = 1) {
  const int fd = connect_to(to, device);
  for (std::size_t sent = 0; sent < raw.size();) {
    const ssize_t n = send(fd, raw.data() + sent, raw.size() - sent, MSG_NOSIGNAL);
    if (n <= 0) break; // the server may answer (and close) before a too-large request is all sent
    sent += static_cast<std::size_t>(n);
  }
  std::string data;
  char chunk[8192];
  for (ssize_t n; (n = recv(fd, chunk, sizeof chunk, 0)) > 0;) data.append(chunk, static_cast<std::size_t>(n));
  close(fd);
  Reply out;
  if (data.size() > 12) out.status = std::stoi(data.substr(9, 3));
  const auto split = data.find("\r\n\r\n");
  out.head = data.substr(0, split);
  out.body = split == std::string::npos ? "" : data.substr(split + 4);
  return out;
}

std::string get(const std::string& target, const std::string& extra = "") {
  return "GET " + target + " HTTP/1.1\r\nHost: 127.0.0.1\r\n" + extra + "\r\n";
}
std::string api(const std::string& target, const std::string& cookie, const std::string& method = "GET", const std::string& body = "") {
  return method + " " + target + " HTTP/1.1\r\nHost: 127.0.0.1:" + std::to_string(port) + "\r\nX-JBH: 1\r\nCookie: theme=dark; jbh=" +
         cookie + "\r\nContent-Length: " + std::to_string(body.size()) + "\r\n\r\n" + body;
}
Reply sign_in(const std::string& pin, int device = 1, bool header = true) {
  const std::string body = "{\"pin\":\"" + pin + "\"}";
  return exchange("POST /auth HTTP/1.1\r\nHost: 192.168.1.50:34177\r\n" + std::string(header ? "X-JBH: 1\r\n" : "") +
                      "Content-Type: application/json\r\nContent-Length: " + std::to_string(body.size()) + "\r\n\r\n" + body,
                  port, device);
}
std::string cookie_of(const Reply& reply) {
  const auto at = reply.head.find("Set-Cookie: jbh=");
  assert(at != std::string::npos);
  const auto start = at + std::strlen("Set-Cookie: jbh=");
  return reply.head.substr(start, reply.head.find(';', start) - start);
}

void wait_for(const char* state) {
  for (int i = 0; i < 100 && http_server::status().state != state; ++i) std::this_thread::sleep_for(10ms);
  assert(http_server::status().state == state);
}

// The app's side: answers every API request with what it was asked, until told to stop.
struct Echo {
  std::atomic<bool> on{true};
  std::thread thread{[this] {
    while (on) {
      for (const auto& request : http_server::poll())
        http_server::respond(request.id, 200, "application/json",
                             request.method + " " + request.path + "?" + request.query + " [" + request.body + "] from " + request.client);
      std::this_thread::sleep_for(5ms);
    }
  }};
  ~Echo() {
    on = false;
    thread.join();
  }
};
} // namespace

int main() {
  std::signal(SIGPIPE, SIG_DFL); // a write to a vanished client must not raise it
  port = static_cast<std::uint16_t>(41000 + getpid() % 2000);
  std::string error;
  assert(!http_server::start({port}, "12345", "", error) && error.find("6 digits") != std::string::npos);
  assert(!http_server::start({port}, "24a024", "", error));
  assert(!http_server::start({port}, "1357905", "", error));
  assert(!http_server::start({}, kPin, "", error) && error.find("1..8 ports") != std::string::npos);
  assert(http_server::start({port}, kPin, "<!doctype html><title>t</title>", error));
  assert(!http_server::start({port}, kPin, "", error) && error.find("already running") != std::string::npos);
  wait_for("listening");
  assert(http_server::status().port == port && !http_server::status().address.empty());

  // The clean address serves the page with no secret in it.
  Reply page = exchange(get("/"));
  assert(page.status == 200 && page.body == "<!doctype html><title>t</title>");
  assert(page.head.find("text/html") != std::string::npos && page.head.find("Connection: close") != std::string::npos);
  assert(exchange("HEAD / HTTP/1.1\r\n\r\n").body.empty());
  assert(exchange(get("/favicon.ico")).status == 204);
  assert(exchange(get("/elsewhere")).status == 404);

  // Host: an IP address or localhost; never a name a web page could point at the console.
  assert(exchange("GET / HTTP/1.1\r\nHost: 192.168.1.50:34177\r\n\r\n").status == 200);
  assert(exchange("GET / HTTP/1.1\r\nHost: localhost:34177\r\n\r\n").status == 200);
  assert(exchange("GET / HTTP/1.1\r\nHost: attacker.example\r\n\r\n").status == 403);
  assert(exchange("GET / HTTP/1.1\r\nHost: 192.168.1.50.nip.io\r\n\r\n").status == 403);
  assert(exchange("GET / HTTP/1.1\r\nHost: 300.1.1.1\r\n\r\n").status == 403);
  assert(exchange("GET / HTTP/1.1\r\nHost: 1.2.3\r\n\r\n").status == 403);
  assert(exchange("GET / HTTP/1.1\r\nHost: 1.2.3.4:http\r\n\r\n").status == 403);

  // Signing in: POST only, from the page's own script (X-JBH), and only with the PIN.
  assert(exchange(get("/auth", "X-JBH: 1\r\n")).status == 405);
  assert(sign_in(kPin, 3, false).status == 403);
  Reply ok = sign_in(kPin, 3);
  assert(ok.status == 200);
  assert(ok.head.find("HttpOnly") != std::string::npos && ok.head.find("SameSite=Strict") != std::string::npos);
  assert(ok.head.find("Max-Age") == std::string::npos && ok.head.find("Expires") == std::string::npos); // a session cookie
  const std::string cookie = cookie_of(ok);
  assert(cookie.size() == 26 && cookie.find_first_not_of("abcdefghijklmnopqrstuvwxyz234567") == std::string::npos);
  assert(cookie != cookie_of(sign_in(kPin, 4)));
  assert(http_server::status().sessions == 2);

  // The API: the cookie and X-JBH, or nothing reaches the app.
  assert(exchange(get("/api/games")).status == 403);
  assert(exchange(get("/api/games", "X-JBH: 1\r\n")).status == 401);
  assert(exchange(api("/api/games", "notasession")).status == 401);
  // One character off the real cookie: the last one changed to something else (never to itself).
  assert(exchange(api("/api/games", cookie.substr(0, 25) + (cookie.back() == 'a' ? "b" : "a"))).status == 401);
  assert(exchange("GET /api/games HTTP/1.1\r\nCookie: jbh=" + cookie + "\r\n\r\n").status == 403); // a cross-site request has no X-JBH
  assert(http_server::poll().empty());
  {
    Echo app;
    Reply asked = exchange(api("/api/games?q=tchia&offset=0", cookie));
    assert(asked.status == 200 && asked.body == "GET /api/games?q=tchia&offset=0 [] from 127.0.0.1");
    Reply posted = exchange(api("/api/download", cookie, "POST", "{\"id\":\"PPSA04892\"}"), port, 7);
    assert(posted.status == 200 && posted.body == "POST /api/download? [{\"id\":\"PPSA04892\"}] from 127.0.0.7");
    assert(exchange(api("/api/x", cookie, "PUT")).status == 405);
  }

  // Throttling: three free wrong PINs per device, then a growing wait; the right PIN waits too.
  for (int i = 0; i < 2; ++i) {
    Reply wrong = sign_in("000000", 2);
    assert(wrong.status == 401 && wrong.body.find("retryAfter") == std::string::npos);
  }
  Reply third = sign_in("111111", 2);
  assert(third.status == 401 && third.body.find("\"retryAfter\":2") != std::string::npos);
  assert(third.head.find("Retry-After: 2") != std::string::npos);
  assert(sign_in("222222", 2).status == 429);
  assert(sign_in(kPin, 2).status == 429);
  assert(sign_in("9", 5).status == 401);        // another device is not held up (and too short is wrong)
  assert(sign_in("4892", 5).status == 401);     // the old four digits are not the PIN
  assert(sign_in("1357905", 5).status == 401);  // too long is wrong
  std::this_thread::sleep_for(2100ms);
  assert(sign_in("333333", 2).body.find("\"retryAfter\":4") != std::string::npos);
  assert(http_server::status().failures == 7 && !http_server::status().locked);

  // Lockout: 20 wrong PINs from anywhere, and nobody signs in until the server starts again; signed-in phones keep working.
  for (int device = 20; http_server::status().failures < http_server::kLockAfterFailures - 1; ++device)
    for (int i = 0; i < 2 && http_server::status().failures < http_server::kLockAfterFailures - 1; ++i)
      assert(sign_in("000001", device).status == 401);
  assert(sign_in("000002", 60).status == 423);
  assert(http_server::status().locked);
  assert(sign_in(kPin, 61).status == 423);
  {
    Echo app;
    assert(exchange(api("/api/still", cookie)).status == 200);
  }

  // Limits and malformed requests.
  assert(exchange("POST /api/x HTTP/1.1\r\nContent-Length: 70000\r\n\r\n").status == 413);
  assert(exchange("POST /api/x HTTP/1.1\r\nContent-Length: 12x\r\n\r\n").status == 413);
  assert(exchange("POST /api/x HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n").status == 400);
  assert(exchange(get("/", "X-Junk: " + std::string(20000, 'a') + "\r\n")).status == 431);
  assert(exchange("NONSENSE\r\n\r\n").status == 400);
  assert(exchange("GET nowhere HTTP/1.1\r\n\r\n").status == 400);

  // Nobody answers: the request gives up after kAnswerMs and the server carries on.
  const auto asked_at = std::chrono::steady_clock::now();
  assert(exchange(api("/api/slow", cookie)).status == 504);
  assert(std::chrono::steady_clock::now() - asked_at >= std::chrono::milliseconds(http_server::kAnswerMs - 200));
  for (const auto& request : http_server::poll()) assert(!http_server::respond(request.id, 200, "", "late"));

  // A client that connects and says nothing is dropped after kReadMs; the next one is served.
  const int silent = connect_to(port);
  const auto silent_at = std::chrono::steady_clock::now();
  assert(exchange(get("/")).status == 200);
  assert(std::chrono::steady_clock::now() - silent_at < std::chrono::milliseconds(http_server::kReadMs + 1500));
  close(silent);

  // Clients that leave before the answer: the write fails quietly (no SIGPIPE ends this process).
  for (int i = 0; i < 20; ++i) {
    const int fd = connect_to(port);
    const std::string raw = get("/");
    send(fd, raw.data(), raw.size(), MSG_NOSIGNAL);
    linger hard{1, 0};
    setsockopt(fd, SOL_SOCKET, SO_LINGER, &hard, sizeof hard);
    close(fd);
  }
  assert(exchange(get("/")).status == 200);
  assert(!http_server::respond(999999, 200, "text/plain", "x"));

  // stop() with a request waiting for the app: the client hears 503 and stop returns promptly.
  std::thread waiting([&] { assert(exchange(api("/api/wait", cookie)).status == 503); });
  for (int i = 0; i < 100 && http_server::poll().empty(); ++i) std::this_thread::sleep_for(10ms);
  const auto stop_at = std::chrono::steady_clock::now();
  http_server::stop();
  waiting.join();
  assert(std::chrono::steady_clock::now() - stop_at < 1s);
  assert(http_server::status().state == "stopped" && http_server::status().sessions == 0);
  http_server::stop(); // twice is harmless

  // Started again (the same fixed PIN): the lock and every old session are gone.
  assert(http_server::start({port}, kPin, "fresh", error));
  wait_for("listening");
  assert(!http_server::status().locked && http_server::status().failures == 0);
  assert(exchange(api("/api/games", cookie)).status == 401);
  assert(sign_in("135791", 2).status == 401); // one digit off is wrong
  assert(sign_in(kPin, 2).status == 200);   // and the fixed PIN signs in again

  // stop() while a slow phone takes a large answer: the write is cut to a short grace, so stop() (on the
  // render thread) returns long before kWriteMs.
  {
    const std::string fresh = cookie_of(sign_in(kPin, 3));
    std::atomic<bool> handed{false};
    std::thread app([&] {
      for (int i = 0; i < 400 && !handed; ++i) {
        for (const auto& request : http_server::poll())
          handed = http_server::respond(request.id, 200, "text/plain", std::string(http_server::kMaxResponseBytes, 'x'));
        std::this_thread::sleep_for(5ms);
      }
    });
    const int fd = socket(AF_INET, SOCK_STREAM, 0);
    const int small = 2048; // a tiny window: the server's writes stall once its buffer fills
    setsockopt(fd, SOL_SOCKET, SO_RCVBUF, &small, sizeof small);
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(port);
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    assert(connect(fd, reinterpret_cast<sockaddr*>(&address), sizeof address) == 0);
    const std::string raw = api("/api/big", fresh);
    assert(send(fd, raw.data(), raw.size(), MSG_NOSIGNAL) == static_cast<ssize_t>(raw.size()));
    app.join();
    assert(handed);
    std::this_thread::sleep_for(300ms); // the worker is now writing into the full window
    const auto cut_at = std::chrono::steady_clock::now();
    http_server::stop();
    assert(std::chrono::steady_clock::now() - cut_at < 1500ms);
    close(fd);
  }
  assert(http_server::status().state == "stopped");

  // Busy ports are a status, not a crash: the next port in the list is tried, and every failure is told.
  const auto squat = [](std::uint16_t on) {
    const int fd = socket(AF_INET, SOCK_STREAM, 0);
    const int yes = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(on);
    address.sin_addr.s_addr = htonl(INADDR_ANY);
    assert(bind(fd, reinterpret_cast<sockaddr*>(&address), sizeof address) == 0 && listen(fd, 1) == 0);
    return fd;
  };
  const auto busy = static_cast<std::uint16_t>(port + 1), busy2 = static_cast<std::uint16_t>(port + 2);
  const int squatter = squat(busy), squatter2 = squat(busy2);
  assert(http_server::start({busy, busy2}, kPin, "p", error));
  wait_for("failed");
  const std::string why = http_server::status().error;
  assert(why.find("port " + std::to_string(busy) + ": in use by another app (errno") != std::string::npos);
  assert(why.find("port " + std::to_string(busy2) + ": in use") != std::string::npos);
  http_server::stop();
  assert(http_server::start({busy, port}, kPin, "second", error));
  wait_for("listening");
  assert(http_server::status().port == port && exchange(get("/")).body == "second");
  http_server::stop();
  assert(http_server::start({busy, busy2, 0}, kPin, "any", error));
  wait_for("listening");
  const std::uint16_t picked = http_server::status().port;
  assert(picked != 0 && picked != busy && picked != busy2 && exchange(get("/"), picked).body == "any");
  http_server::stop();
  close(squatter);
  close(squatter2);

  // Session cookies (the only random values left) differ between sign-ins.
  assert(http_server::start({port}, kPin, "cookies", error));
  wait_for("listening");
  std::set<std::string> seen;
  for (int i = 0; i < 20; ++i) seen.insert(cookie_of(sign_in(kPin, 2 + i % 3)));
  assert(seen.size() == 20);
  http_server::stop();
  std::printf("http_server: all checks passed (six-digit PIN; %zu distinct session cookies; local address %s)\n", seen.size(),
              http_server::local_address().c_str());
  return 0;
}
