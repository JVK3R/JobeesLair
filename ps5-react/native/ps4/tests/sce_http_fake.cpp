// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// Test stand-in for native/ps4/sce_http.cpp on Linux: the same contract over blocking libcurl, so network_sce.cpp and
// image_loader.cpp's PS4 path run unchanged against a local server.
#include "sce_http.hpp"
#include <curl/curl.h>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <string_view>

extern "C" int sceKernelDebugOutText(int, const char*, ...) { return 0; }

namespace sce_http {
namespace {
bool started = false;
std::string lower(std::string text) {
  for (char& c : text) if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
  return text;
}
std::string trim(std::string_view text) {
  while (!text.empty() && (text.front() == ' ' || text.front() == '\t')) text.remove_prefix(1);
  while (!text.empty() && (text.back() == ' ' || text.back() == '\r' || text.back() == '\n')) text.remove_suffix(1);
  return std::string(text);
}
struct Call {
  Exchange* x;
  const Sink* sink;
  const std::atomic<bool>* abort;
  const Head* head;
  CURL* curl;
  bool headed = false;
};
bool judge(Call& call) {
  call.headed = true;
  long status = 0;
  curl_easy_getinfo(call.curl, CURLINFO_RESPONSE_CODE, &status);
  call.x->status = static_cast<int>(status);
  if (*call.head && !(*call.head)()) {
    call.x->stopped = true;
    return false;
  }
  return true;
}
std::size_t on_header(char* data, std::size_t size, std::size_t count, void* opaque) {
  auto& call = *static_cast<Call*>(opaque);
  const std::string_view line(data, size * count);
  if (line.starts_with("HTTP/")) {
    call.x->response_headers.clear();
    call.x->length_known = false;
    return size * count;
  }
  const auto colon = line.find(':');
  if (colon == std::string_view::npos) return size * count;
  const std::string name = lower(trim(line.substr(0, colon))), value = trim(line.substr(colon + 1));
  call.x->response_headers.emplace_back(name, value);
  if (name == "content-length") {
    call.x->content_length = std::strtoull(value.c_str(), nullptr, 10);
    call.x->length_known = true;
  }
  return size * count;
}
std::size_t on_body(char* data, std::size_t size, std::size_t count, void* opaque) {
  auto& call = *static_cast<Call*>(opaque);
  if (!call.headed && !judge(call)) return 0;
  if (!(*call.sink)(data, size * count)) {
    call.x->stopped = true;
    return 0;
  }
  return size * count;
}
int on_progress(void* opaque, curl_off_t, curl_off_t, curl_off_t, curl_off_t) {
  auto& call = *static_cast<Call*>(opaque);
  if (call.abort && call.abort->load()) {
    call.x->stopped = true;
    return 1;
  }
  return 0;
}
} // namespace

const std::string& Exchange::header(const char* name) const {
  static const std::string none;
  for (const auto& [key, value] : response_headers) if (key == name) return value;
  return none;
}

bool start(std::string&) {
  curl_global_init(CURL_GLOBAL_DEFAULT);
  started = true;
  return true;
}
void stop() { started = false; }
bool running() { return started; }
void abort(int) {}
std::string describe(int code) { return "fake error " + std::to_string(code); }

Client::~Client() {}

bool Client::perform(Exchange& x, const Sink& sink, const std::atomic<bool>* abort, const Head& head) {
  x.status = 0;
  x.response_headers.clear();
  x.content_length = 0;
  x.length_known = x.transient = x.stopped = false;
  x.error.clear();
  CURL* curl = curl_easy_init();
  Call call{&x, &sink, abort, &head, curl};
  curl_slist* headers = nullptr;
  for (const auto& line : x.headers) headers = curl_slist_append(headers, line.c_str());
  curl_easy_setopt(curl, CURLOPT_URL, x.url.c_str());
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, x.follow_redirects ? 1L : 0L);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 5L);
  curl_easy_setopt(curl, CURLOPT_LOW_SPEED_LIMIT, 1L);
  curl_easy_setopt(curl, CURLOPT_LOW_SPEED_TIME, static_cast<long>(x.timeout_seconds));
  if (x.method == "HEAD") curl_easy_setopt(curl, CURLOPT_NOBODY, 1L);
  else curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, x.method.c_str());
  if (x.body) {
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, x.body->data());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE_LARGE, static_cast<curl_off_t>(x.body->size()));
  }
  curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, on_header);
  curl_easy_setopt(curl, CURLOPT_HEADERDATA, &call);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, on_body);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &call);
  curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, on_progress);
  curl_easy_setopt(curl, CURLOPT_XFERINFODATA, &call);
  curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
  const CURLcode result = curl_easy_perform(curl);
  if (result == CURLE_OK && !call.headed) judge(call);
  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);
  if (result == CURLE_OK || x.stopped) return true;
  x.error = std::string(curl_easy_strerror(result));
  x.transient = result == CURLE_COULDNT_CONNECT || result == CURLE_OPERATION_TIMEDOUT || result == CURLE_RECV_ERROR ||
                result == CURLE_PARTIAL_FILE || result == CURLE_GOT_NOTHING;
  return false;
}
} // namespace sce_http
