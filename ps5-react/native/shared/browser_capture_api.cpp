// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "host_api.hpp"
#include "browser_capture.hpp"
#include <cmath>
#include <cstring>
namespace {
bool text(JSContext* ctx, JSValueConst value, std::string& out) {
  if (!JS_IsString(value)) return false;
  size_t length = 0;
  const char* input = JS_ToCStringLen(ctx, &length, value);
  if (!input) return false;
  const bool valid = length && length <= 161 && !std::memchr(input, 0, length);
  if (valid) out.assign(input, length);
  JS_FreeCString(ctx, input);
  return valid;
}
JSValue capture(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::string prefix, suffix;
  double timeout = 0;
  if (argc < 3 || !text(ctx, argv[0], prefix) || prefix != "https://vikingfile.com/d/" ||
      !text(ctx, argv[1], suffix) || suffix.empty() || suffix[0] != '/' ||
      suffix.find('/', 1) != std::string::npos || suffix.find('\\') != std::string::npos ||
      suffix.find("..") != std::string::npos || JS_ToFloat64(ctx, &timeout, argv[2]) ||
      !std::isfinite(timeout) || timeout < 1 || timeout > 180 || std::floor(timeout) != timeout)
    return JS_ThrowTypeError(ctx, "browser.capture: expected the Vikingfile prefix, /filename (160 UTF-8 bytes), and 1..180 seconds");
  for (const unsigned char c : suffix) if (c < 32 || c == 127)
    return JS_ThrowTypeError(ctx, "browser.capture: filename contains a control character");
  std::string error;
  const auto id = browser_capture::capture(std::move(prefix), std::move(suffix), static_cast<int>(timeout), error);
  return id ? JS_NewUint32(ctx, id) : JS_ThrowPlainError(ctx, "browser.capture: %s", error.c_str());
}
JSValue cancel(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::uint32_t id = 0;
  if (!argc || JS_ToUint32(ctx, &id, argv[0])) return JS_ThrowTypeError(ctx, "browser.cancel: expected task id");
  browser_capture::cancel(id); return JS_UNDEFINED;
}
JSValue poll(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  JSValue out = JS_NewArray(ctx);
  std::uint32_t index = 0;
  for (const auto& snapshot : browser_capture::poll()) {
    JSValue item = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, item, "id", JS_NewUint32(ctx, snapshot.id));
    JS_SetPropertyStr(ctx, item, "state", JS_NewString(ctx, snapshot.state.c_str()));
    JS_SetPropertyStr(ctx, item, "error", JS_NewString(ctx, snapshot.error.c_str()));
    JS_SetPropertyStr(ctx, item, "url", JS_NewString(ctx, snapshot.url.c_str()));
    JS_SetPropertyUint32(ctx, out, index++, item);
  }
  return out;
}
}
JSValue ps5_react_browser_capture_api(JSContext* ctx) {
  JSValue api = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, api, "capture", JS_NewCFunction(ctx, capture, "capture", 3));
  JS_SetPropertyStr(ctx, api, "cancel", JS_NewCFunction(ctx, cancel, "cancel", 1));
  JS_SetPropertyStr(ctx, api, "poll", JS_NewCFunction(ctx, poll, "poll", 0));
  return api;
}
