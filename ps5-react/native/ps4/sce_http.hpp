// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The PS4's HTTP client: Sony's libSceHttp over libSceSsl. Unlike curl and OpenSSL built for the PS4, it checks
// servers against the console's own certificate list and takes its DNS and randomness from the system, all of which
// an app's sandbox allows. A request blocks the thread that sends it; each thread has its own Client.
#pragma once
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <utility>
#include <vector>

namespace sce_http {
// Loads the network, HTTP and SSL modules and starts the libraries once; false (with the reason) when one fails.
bool start(std::string& error);
void stop();
bool running();

struct Exchange {
  std::string url, method = "GET";
  const std::string* body = nullptr;
  std::vector<std::string> headers; // "Name: value"
  bool follow_redirects = true;
  unsigned timeout_seconds = 30; // the longest wait for the next bytes
  // The answer.
  int status = 0;
  std::vector<std::pair<std::string, std::string>> response_headers; // names in lower case
  std::uint64_t content_length = 0;
  bool length_known = false;
  // Why the transfer failed (empty when it ran to the end, or the sink stopped it); a transient failure (the network,
  // a timeout, a dropped connection) is worth another attempt.
  std::string error;
  bool transient = false, stopped = false;
  const std::string& header(const char* name) const;
};

// The body arrives in pieces; returning false stops the transfer.
using Sink = std::function<bool(const char* data, std::size_t size)>;
// Hears the status and headers before any of the body; returning false stops the transfer there.
using Head = std::function<bool()>;

class Client {
public:
  Client() = default;
  ~Client();
  Client(const Client&) = delete;
  Client& operator=(const Client&) = delete;
  // Sends `x` and reads its answer into `sink`, after `head` (when given) has seen the status and headers. `abort`,
  // read between pieces, ends it early. False on a transport failure, with x.error set.
  bool perform(Exchange& x, const Sink& sink, const std::atomic<bool>* abort = nullptr, const Head& head = nullptr);
  // The request in flight, for abort() from another thread; 0 when none.
  std::atomic<int> current{0};

private:
  struct Connection { std::string origin; int id = 0; std::uint64_t used = 0; };
  int connection(const std::string& url, bool& reused);
  void drop(int id);
  int template_ = 0;
  std::vector<Connection> connections_;
  std::uint64_t clock_ = 0;
  std::vector<char> buffer_;
};

// Ends a request another thread is waiting on (its perform() returns a failure).
void abort(int request);
// Sony's error code in words the app's error messages recognize ("timed out", "resolve", "connect", "SSL").
std::string describe(int code);
} // namespace sce_http
