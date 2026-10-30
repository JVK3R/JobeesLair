// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The native modules not ported to the PS4 yet. Each has its PS5 functions: `poll` answers an empty list, the
// questions (available, isOpen) answer no, capabilities answers none, and the clean-ups (cancel, close, stop) do
// nothing, so the frame loop runs on; any other call throws "Not on the PS4 yet" and logs its name the first time,
// which says what to port next. They come over as the PS4 build gains archives, package installs, the keyboard,
// the phone companion's server and video.

#include "host_api.hpp"
#include "ps4_log.hpp"
#include <mutex>
#include <set>
#include <string>

namespace {
std::mutex seen_lock;
std::set<std::string> seen;

JSValue pending_call(JSContext* ctx, JSValueConst, int, JSValueConst*, int, JSValueConst* data) {
  const char* name = JS_ToCString(ctx, data[0]);
  std::string call = name ? name : "?";
  if (name) JS_FreeCString(ctx, name);
  const std::string function = call.substr(call.find('.') + 1);
  if (function == "poll") return JS_NewArray(ctx);
  if (function == "available" || function == "isOpen") return JS_FALSE;
  if (function == "capabilities") return JS_NewObject(ctx);
  if (function == "cancel" || function == "close" || function == "stop") return JS_UNDEFINED;
  {
    std::lock_guard<std::mutex> lock(seen_lock);
    if (seen.insert(call).second) ps4_log::write("[PS4-REACT] pending native call %s", call.c_str());
  }
  return JS_ThrowInternalError(ctx, "Not on the PS4 yet: %s", call.c_str());
}

JSValue pending(JSContext* ctx, const char* module, std::initializer_list<const char*> functions) {
  JSValue object = JS_NewObject(ctx);
  for (const char* function : functions) {
    JSValue name = JS_NewString(ctx, (std::string(module) + "." + function).c_str());
    JS_SetPropertyStr(ctx, object, function, JS_NewCFunctionData(ctx, pending_call, 0, 0, 1, &name));
    JS_FreeValue(ctx, name);
  }
  return object;
}
} // namespace

JSValue ps5_react_archive_api(JSContext* ctx) {
  return pending(ctx, "archives", {"extract", "inspect", "inspectRanges", "cancel", "poll"});
}
JSValue ps5_react_package_api(JSContext* ctx) { return pending(ctx, "packages", {"install", "cancel", "poll"}); }
JSValue ps5_react_browser_capture_api(JSContext* ctx) { return pending(ctx, "browser", {"capture", "cancel", "poll"}); }
JSValue ps5_react_lan_api(JSContext* ctx) { return pending(ctx, "lan", {"broadcast", "cancel", "poll"}); }
JSValue ps5_react_http_server_api(JSContext* ctx) {
  return pending(ctx, "httpServer", {"start", "stop", "status", "address", "token", "setPage", "respond", "push", "poll"});
}
JSValue ps5_react_video_api(JSContext* ctx) { return pending(ctx, "video", {"open", "close", "poll"}); }
JSValue ps5_react_audio_output_api(JSContext* ctx) { return pending(ctx, "audioOutput", {"capabilities"}); }
JSValue ps5_react_keyboard_api(JSContext* ctx) {
  return pending(ctx, "keyboard", {"available", "open", "close", "isOpen", "poll"});
}
