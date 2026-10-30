// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// Drives native/ps4/network_sce.cpp (with the curl stand-in for Sony's client) against server.py.
#include "network.hpp"
#include "image_loader.hpp"
#include "sha256.hpp"
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <functional>
#include <sstream>
#include <string>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>

namespace images { Memory memory() { return {}; } }

using namespace std::chrono_literals;
static int failures = 0, passes = 0;
static std::string base, digest;
static std::uint64_t size_expected = 0;

static void check(bool ok, const std::string& what) {
  std::printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str());
  ok ? ++passes : ++failures;
}

static bool terminal(const std::string& state) { return state == "completed" || state == "failed" || state == "cancelled"; }

static network::Snapshot run(network::Request request, std::function<bool(const network::Snapshot&)> during = {},
                             std::uint32_t* out_id = nullptr) {
  std::string error;
  const auto id = network::enqueue(std::move(request), error);
  if (out_id) *out_id = id;
  if (!id) {
    network::Snapshot failed;
    failed.state = "enqueue-failed";
    failed.error = error;
    return failed;
  }
  const auto deadline = std::chrono::steady_clock::now() + 60s;
  network::Snapshot last;
  bool stop = false;
  while (std::chrono::steady_clock::now() < deadline) {
    for (const auto& s : network::poll())
      if (s.id == id) {
        last = s;
        if (terminal(s.state)) return s;
        if (during && !stop && during(s)) {
          network::cancel(id);
          stop = true;
        }
      }
    std::this_thread::sleep_for(20ms);
  }
  last.state = "timeout";
  return last;
}

static std::string file_sha(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  std::stringstream bytes;
  bytes << in.rdbuf();
  const std::string data = bytes.str();
  Sha256 hash;
  hash.update(data.data(), data.size());
  return hash.finish();
}

static bool exists(const std::string& path) {
  struct stat st{};
  return stat(path.c_str(), &st) == 0;
}

static std::uint64_t file_size(const std::string& path) {
  struct stat st{};
  return stat(path.c_str(), &st) == 0 ? static_cast<std::uint64_t>(st.st_size) : 0;
}

static network::Request download(const std::string& path, const std::string& destination) {
  network::Request r;
  r.url = base + path;
  r.destination = destination;
  return r;
}

int main(int argc, char** argv) {
  if (argc != 4) {
    std::fputs("usage: test_network <port> <expected.txt> <folder>\n", stderr);
    return 2;
  }
  base = std::string("http://127.0.0.1:") + argv[1];
  {
    std::ifstream in(argv[2]);
    in >> digest >> size_expected;
  }
  const std::string dir = argv[3];
  check(network::start(), "network starts");

  {
    network::Request r;
    r.url = base + "/json";
    const auto s = run(r);
    bool etag = false, cookie = false;
    for (const auto& [name, value] : s.headers) {
      if (name == "etag" && value == "\"j1\"") etag = true;
      if (name == "set-cookie") cookie = true;
    }
    check(s.state == "completed" && s.status == 200 && s.body == "{\"hello\":\"ps4\"}" && etag && !cookie,
          "GET: body, status, the ETag shown and no cookie (" + s.state + " " + s.error + ")");
  }
  {
    network::Request r;
    r.url = base + "/post";
    r.method = "POST";
    r.body = "abc";
    const auto s = run(r);
    check(s.state == "completed" && s.body.find("\"got\": \"abc\"") != std::string::npos, "POST sends its body (" + s.body + ")");
  }
  {
    network::Request r;
    r.url = base + "/big";
    const auto s = run(r);
    check(s.state == "failed" && s.error == "response exceeds maxBytes", "a body over maxBytes fails (" + s.error + ")");
  }
  {
    network::Request r;
    r.url = base + "/flaky";
    const auto s = run(r);
    check(s.state == "completed" && s.status == 200 && s.body == "steady now" && s.retries == 2,
          "503 twice, then the answer: retried (" + s.state + " retries " + std::to_string(s.retries) + ")");
  }
  {
    network::Request r;
    r.url = base + "/notfound";
    const auto s = run(r);
    check(s.state == "completed" && s.status == 404, "a 404 completes with its status (" + s.state + ")");
  }
  const std::string whole = dir + "/whole.bin";
  {
    auto r = download("/file", whole);
    r.sha256 = digest;
    const auto s = run(r);
    check(s.state == "completed" && s.written == size_expected && s.total == size_expected && file_sha(whole) == digest &&
              !exists(whole + ".part") && !exists(whole + ".resume"),
          "download: the file whole, checked, no .part or .resume left (" + s.state + " " + s.error + ")");
  }
  {
    auto r = download("/file", dir + "/bad.bin");
    r.sha256 = std::string(64, 'a');
    const auto s = run(r);
    check(s.state == "failed" && s.error == "SHA-256 mismatch" && !exists(dir + "/bad.bin.part") && !exists(dir + "/bad.bin"),
          "a wrong SHA-256 fails and removes the partial file (" + s.error + ")");
  }
  for (const char* path : {"/slowfile", "/norange?slow=1"}) {
    const std::string target = dir + (path[1] == 's' ? "/resumed.bin" : "/restarted.bin");
    auto r = download(path, target);
    const auto first = run(r, [](const network::Snapshot& s) { return s.written >= 1024 * 1024; });
    const std::uint64_t kept = file_size(target + ".part");
    check(first.state == "cancelled" && kept >= 1024 * 1024 && exists(target + ".resume"),
          std::string(path) + ": cancelled part way, .part and .resume kept (" + first.state + ", " + std::to_string(kept) + " bytes)");
    const auto second = run(download(path, target));
    check(second.state == "completed" && file_sha(target) == digest && file_size(target) == size_expected,
          std::string(path) + ": the second run finishes the right file (" + second.state + " " + second.error + ")");
  }
  {
    const auto s = run(download("/deny", dir + "/deny.bin"));
    check(s.state == "failed" && s.error.find("browser verification required") != std::string::npos,
          "403: the provider-denied message (" + s.error + ")");
  }
  {
    auto r = download("/html", dir + "/page.bin");
    r.reject_html = true;
    const auto s = run(r);
    check(s.state == "failed" && s.error == "provider returned a web page; browser verification required",
          "a web page instead of the file is refused (" + s.error + ")");
  }
  {
    auto r = download("/file", dir + "/sized.bin");
    r.expected_bytes = 12345;
    const auto s = run(r);
    check(s.state == "failed" && s.error == "expectedBytes does not match the server file size",
          "a size other than expectedBytes is refused (" + s.error + ")");
  }
  {
    network::Request r;
    r.url = "http://127.0.0.1:1/refused";
    r.destination = dir + "/mirrored.bin";
    r.mirrors = {base + "/file"};
    const auto s = run(r);
    check(s.state == "completed" && file_sha(dir + "/mirrored.bin") == digest && s.retries >= 1,
          "a refused primary falls to the mirror (" + s.state + " " + s.error + ")");
  }
  {
    const auto s = run(download("/file", whole));
    check(s.state == "failed" && s.error.find("destination already exists") == 0, "an existing destination is refused (" + s.error + ")");
  }
  {
    auto r = download("/file", whole);
    r.recover_completed = true;
    r.expected_bytes = size_expected;
    const auto s = run(r);
    check(s.state == "completed" && s.written == size_expected, "recoverCompleted reports the finished file (" + s.state + ")");
  }
  {
    auto r = download("/file", dir + "/pieces.bin");
    r.pieces.push_back({base + "/file", "", 0, size_expected});
    r.expected_bytes = size_expected;
    const auto s = run(r);
    check(s.state == "failed" && s.error.find("not supported on the PS4") != std::string::npos, "pieces are refused (" + s.error + ")");
  }
  {
    // Two downloads run at once; a third waits, and cancelling it ends it at once.
    std::string error;
    const auto a = network::enqueue(download("/slowfile", dir + "/q1.bin"), error);
    const auto b = network::enqueue(download("/slowfile", dir + "/q2.bin"), error);
    const auto c = network::enqueue(download("/slowfile", dir + "/q3.bin"), error);
    std::this_thread::sleep_for(300ms);
    std::string third;
    for (const auto& s : network::poll()) if (s.id == c) third = s.state;
    network::Request quick;
    quick.url = base + "/json";
    const auto q = run(quick);
    network::cancel(c);
    std::string after;
    for (int i = 0; i < 10 && after != "cancelled"; ++i) {
      for (const auto& s : network::poll()) if (s.id == c) after = s.state;
      std::this_thread::sleep_for(20ms);
    }
    check(third == "queued" && after == "cancelled" && q.state == "completed",
          "a third download waits (" + third + "), a request still runs (" + q.state + "), cancelling the queued one ends it (" + after + ")");
    network::cancel(a);
    network::cancel(b);
    std::this_thread::sleep_for(500ms);
    network::poll();
  }
  network::stop();
  std::printf("%d passed, %d failed\n", passes, failures);
  return failures ? 1 : 0;
}
