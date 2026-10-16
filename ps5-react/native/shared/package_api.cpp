// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "host_api.hpp"
#include "packages.hpp"
#include <climits>
#include <cstring>

namespace {
// The installer runs with every right, so it takes only a plainly written .pkg or .fpkg on a drive.
bool package_path(JSContext* ctx, JSValueConst value, std::string& out) {
  if (!JS_IsString(value)) return false;
  std::size_t length = 0;
  const char* input = JS_ToCStringLen(ctx, &length, value);
  if (!input) return false;
  char resolved[PATH_MAX];
  const bool package = (length > 4 && !std::strcmp(input + length - 4, ".pkg")) || (length > 5 && !std::strcmp(input + length - 5, ".fpkg"));
  const bool ok = package && length < PATH_MAX && !std::memchr(input, 0, length) &&
                  !std::strstr(input, "/../") && host::resolve_path(input, resolved, sizeof resolved) &&
                  (!std::strncmp(resolved, "/data/", 6) || !std::strncmp(resolved, "/mnt/usb", 8) || !std::strncmp(resolved, "/mnt/ext", 8));
  if (ok) out = resolved;
  JS_FreeCString(ctx, input);
  return ok;
}
JSValue install(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::string path;
  if (argc < 1 || !package_path(ctx, argv[0], path))
    return JS_ThrowTypeError(ctx, "packages.install: expected a .pkg or .fpkg path under /data, /mnt/usb or /mnt/ext");
  std::string name;
  if (argc > 1 && JS_IsString(argv[1])) {
    const char* value = JS_ToCString(ctx, argv[1]);
    if (value) { name = value; JS_FreeCString(ctx, value); }
  }
  if (name.find('\n') != std::string::npos || name.size() > 200) return JS_ThrowTypeError(ctx, "packages.install: name must be one line of at most 200 bytes");
  std::string error;
  const auto id = packages::install(std::move(path), std::move(name), error);
  if (!id) return JS_ThrowPlainError(ctx, "packages.install: %s", error.c_str());
  return JS_NewUint32(ctx, id);
}
JSValue cancel(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::uint32_t id = 0;
  if (!argc || JS_ToUint32(ctx, &id, argv[0])) return JS_ThrowTypeError(ctx, "packages.cancel: expected task id");
  packages::cancel(id);
  return JS_UNDEFINED;
}
JSValue poll(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  JSValue out = JS_NewArray(ctx);
  std::uint32_t index = 0;
  for (const auto& snapshot : packages::poll()) {
    JSValue item = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, item, "id", JS_NewUint32(ctx, snapshot.id));
    JS_SetPropertyStr(ctx, item, "state", JS_NewString(ctx, snapshot.state.c_str()));
    JS_SetPropertyStr(ctx, item, "error", JS_NewString(ctx, snapshot.error.c_str()));
    JS_SetPropertyStr(ctx, item, "contentId", JS_NewString(ctx, snapshot.content_id.c_str()));
    JS_SetPropertyStr(ctx, item, "status", JS_NewString(ctx, snapshot.status.c_str()));
    JS_SetPropertyStr(ctx, item, "written", JS_NewFloat64(ctx, static_cast<double>(snapshot.written)));
    JS_SetPropertyStr(ctx, item, "total", snapshot.total ? JS_NewFloat64(ctx, static_cast<double>(snapshot.total)) : JS_NULL);
    JS_SetPropertyUint32(ctx, out, index++, item);
  }
  return out;
}
}

JSValue ps5_react_package_api(JSContext* ctx) {
  JSValue api = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, api, "install", JS_NewCFunction(ctx, install, "install", 2));
  JS_SetPropertyStr(ctx, api, "cancel", JS_NewCFunction(ctx, cancel, "cancel", 1));
  JS_SetPropertyStr(ctx, api, "poll", JS_NewCFunction(ctx, poll, "poll", 0));
  return api;
}
