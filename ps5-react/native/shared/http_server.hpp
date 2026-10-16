// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// A small HTTP/1.1 server on the local network, for a companion page on a phone. It owns one worker
// thread and its own sockets, apart from the download transport, the filesystem workers and rendering:
// the render thread only starts it, polls the API requests it has queued and answers them.
//
// The page (`/`) is served from memory by the worker. A phone signs in with the console's 6-digit PIN
// (POST /auth) and gets a session cookie; every `/api/…` request needs that cookie and an `X-JBH: 1`
// header (which a page on another site cannot add without asking), then waits for the app to answer
// through poll/respond, up to kAnswerMs. A million PINs are few for a fixed one, so guessing is throttled: a few
// free tries per device, then a growing wait, and after kLockAfterFailures wrong PINs from anywhere
// sign-in locks until the server is started again. Requests must name the console by its IP
// address (Host), so a web page cannot reach it through a domain name pointed at it.
// One connection at a time, `Connection: close`, bounded sizes and deadlines everywhere: a slow or
// hostile client costs at most a few seconds of the worker.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace http_server {
inline constexpr std::size_t kMaxHeaderBytes = 16 * 1024, kMaxBodyBytes = 64 * 1024;
inline constexpr std::size_t kMaxPageBytes = 512 * 1024, kMaxResponseBytes = 4 * 1024 * 1024;
inline constexpr std::size_t kPinDigits = 6, kMaxSessions = 32;
inline constexpr int kFreeAttempts = 3, kMaxWaitSeconds = 30, kLockAfterFailures = 20;
inline constexpr int kReadMs = 3000, kWriteMs = 5000, kAnswerMs = 5000;
inline constexpr std::size_t kMaxPorts = 8;

struct Request {
  std::uint32_t id = 0;
  std::string method, path, query, body, client;
};

struct Status {
  std::string state = "stopped"; // 'stopped' | 'starting' | 'listening' | 'failed'
  std::string error;              // why it failed: each port tried, with the system's reason
  std::uint16_t port = 0;         // the port it listens on (the first of `ports` it could bind)
  std::string address;            // this console's IPv4 address, looked up by the worker; '' unknown
  int failures = 0;               // wrong PINs since start
  bool locked = false;            // sign-in refused until the server is started again
  std::size_t sessions = 0;       // phones signed in
  std::uint64_t served = 0; // responses written since start
};

// Listens on 0.0.0.0 from a new worker, on the first of `ports` it can bind (0: any free port). Only the
// worker touches sockets; this returns at once. False with `error` set when it cannot start (already
// running, bad arguments); ports that cannot be bound are reported by status() as 'failed'.
bool start(std::vector<std::uint16_t> ports, std::string pin, std::string page, std::string& error);
// Closes the listener, refuses waiting requests and joins the worker.
void stop();
Status status();
// API requests not handed out yet, oldest first.
std::vector<Request> poll(std::size_t max = 8);
// Answers request `id`; false when it is no longer waiting (answered, timed out, or the server stopped).
bool respond(std::uint32_t id, int status, std::string content_type, std::string body);
// This console's IPv4 address on its default route, dotted, or empty when it has none. Opens a socket:
// call it off the render thread (the worker does, into status().address).
std::string local_address();
// `bytes` random bytes as lowercase base-32 text, for a session cookie; empty when none could be had.
// From OpenSSL's RAND_bytes, which the title's TLS already uses: arc4random_buf is exported to titles
// only by libScePosixForWebKit, and calling it there faulted the title.
std::string random_token(std::size_t bytes);
} // namespace http_server
