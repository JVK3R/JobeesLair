// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "host_api.hpp"
#include "http_server.hpp"
#include "network.hpp"
#include <cmath>
#include <string>
#include <vector>

namespace {
bool text(JSContext* ctx, JSValueConst value, std::size_t max, std::string& out) {
  if (!JS_IsString(value)) return false;
  std::size_t size = 0;
  const char* bytes = JS_ToCStringLen(ctx, &size, value);
  if (!bytes) return false;
  const bool fits = size <= max;
  if (fits) out.assign(bytes, size);
  JS_FreeCString(ctx, bytes);
  return fits;
}

bool port_number(JSContext* ctx, JSValueConst value, std::uint16_t& out) {
  double port = 0;
  if (!JS_IsNumber(value) || JS_ToFloat64(ctx, &port, value) || port != std::floor(port) || port < 0 || port > 65535)
    return false;
  out = static_cast<std::uint16_t>(port);
  return true;
}

// Ports to try in order: a number or an array of 1..8 numbers (0: any free port).
bool port_list(JSContext* ctx, JSValueConst value, std::vector<std::uint16_t>& out) {
  std::uint16_t port = 0;
  if (JS_IsNumber(value)) {
    if (!port_number(ctx, value, port)) return false;
    out.push_back(port);
    return true;
  }
  if (!JS_IsArray(value)) return false; // quickjs-ng: no context argument
  JSValue length_value = JS_GetPropertyStr(ctx, value, "length");
  std::uint32_t length = 0;
  const bool sized = !JS_ToUint32(ctx, &length, length_value);
  JS_FreeValue(ctx, length_value);
  if (!sized || length < 1 || length > http_server::kMaxPorts) return false;
  for (std::uint32_t i = 0; i < length; ++i) {
    JSValue item = JS_GetPropertyUint32(ctx, value, i);
    const bool ok = port_number(ctx, item, port);
    JS_FreeValue(ctx, item);
    if (!ok) return false;
    out.push_back(port);
  }
  return true;
}

// MODIFIED (Jobee'sLair 0.5.0): an optional fourth argument, the session cookie every phone gets
// (http_server::start); undefined or '' for one random cookie per sign-in, as before.
JSValue start(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::vector<std::uint16_t> ports;
  std::string pin, page, session;
  if (argc < 3 || !port_list(ctx, argv[0], ports) || !text(ctx, argv[1], http_server::kPinDigits, pin) ||
      !text(ctx, argv[2], http_server::kMaxPageBytes, page) ||
      (argc > 3 && !JS_IsUndefined(argv[3]) && !text(ctx, argv[3], http_server::kMaxSessionChars, session)))
    return JS_ThrowTypeError(ctx, "httpServer.start: expected a port or 1..8 ports (0..65535), a 6-digit PIN, a page of at most 512 KiB and an optional session");
  if (!network::running())
    return JS_ThrowPlainError(ctx, "httpServer.start: enable networking: true and filesystemAccess: console in app.json");
  std::string error;
  if (!http_server::start(std::move(ports), std::move(pin), std::move(page), std::move(session), error))
    return JS_ThrowPlainError(ctx, "httpServer.start: %s", error.c_str());
  return JS_UNDEFINED;
}

// MODIFIED (Jobee'sLair 0.5.0): 16 random bytes as 26 base-32 characters, for start's session.
JSValue token(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  const std::string value = http_server::random_token(16);
  if (value.empty()) return JS_ThrowPlainError(ctx, "httpServer.token: no random bytes could be had");
  return JS_NewString(ctx, value.c_str());
}

// ABI v24: the page `/` serves from now on (the app's language changed); phones and their streams stay.
JSValue set_page(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::string page;
  if (argc < 1 || !text(ctx, argv[0], http_server::kMaxPageBytes, page))
    return JS_ThrowTypeError(ctx, "httpServer.setPage: expected a page of at most 512 KiB");
  std::string error;
  if (!http_server::set_page(std::move(page), error)) return JS_ThrowPlainError(ctx, "httpServer.setPage: %s", error.c_str());
  return JS_UNDEFINED;
}

JSValue stop(JSContext*, JSValueConst, int, JSValueConst*) {
  http_server::stop();
  return JS_UNDEFINED;
}

JSValue status(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  const auto current = http_server::status();
  JSValue out = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, out, "state", JS_NewString(ctx, current.state.c_str()));
  JS_SetPropertyStr(ctx, out, "error", JS_NewString(ctx, current.error.c_str()));
  JS_SetPropertyStr(ctx, out, "port", JS_NewUint32(ctx, current.port));
  JS_SetPropertyStr(ctx, out, "address", JS_NewString(ctx, current.address.c_str()));
  JS_SetPropertyStr(ctx, out, "served", JS_NewFloat64(ctx, static_cast<double>(current.served)));
  JS_SetPropertyStr(ctx, out, "failures", JS_NewInt32(ctx, current.failures));
  JS_SetPropertyStr(ctx, out, "locked", JS_NewBool(ctx, current.locked));
  JS_SetPropertyStr(ctx, out, "sessions", JS_NewUint32(ctx, static_cast<std::uint32_t>(current.sessions)));
  JS_SetPropertyStr(ctx, out, "streams", JS_NewUint32(ctx, static_cast<std::uint32_t>(current.streams)));
  JS_SetPropertyStr(ctx, out, "pushed", JS_NewFloat64(ctx, static_cast<double>(current.pushed)));
  return out;
}

// ABI v24: an event to every open event stream; the number of streams that took it.
JSValue push(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::string name, data;
  if (argc < 2 || !text(ctx, argv[0], http_server::kMaxEventName, name) || !http_server::event_name(name) ||
      !text(ctx, argv[1], http_server::kMaxEventBytes, data))
    return JS_ThrowTypeError(ctx, "httpServer.push: expected an event name of 1..32 of a-z, 0-9 and -, and data of at most 256 KiB");
  bool ok = false;
  const std::size_t taken = http_server::push(name, data, ok);
  return JS_NewUint32(ctx, static_cast<std::uint32_t>(taken));
}

JSValue poll(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  JSValue out = JS_NewArray(ctx);
  std::uint32_t index = 0;
  for (const auto& request : http_server::poll()) {
    JSValue item = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, item, "id", JS_NewUint32(ctx, request.id));
    JS_SetPropertyStr(ctx, item, "method", JS_NewString(ctx, request.method.c_str()));
    JS_SetPropertyStr(ctx, item, "path", JS_NewString(ctx, request.path.c_str()));
    JS_SetPropertyStr(ctx, item, "query", JS_NewString(ctx, request.query.c_str()));
    JS_SetPropertyStr(ctx, item, "body", JS_NewStringLen(ctx, request.body.data(), request.body.size()));
    JS_SetPropertyStr(ctx, item, "client", JS_NewString(ctx, request.client.c_str()));
    JS_SetPropertyUint32(ctx, out, index++, item);
  }
  return out;
}

JSValue respond(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::uint32_t id = 0;
  int32_t code = 0;
  std::string type, body;
  if (argc < 4 || JS_ToUint32(ctx, &id, argv[0]) || JS_ToInt32(ctx, &code, argv[1]) || !text(ctx, argv[2], 256, type) ||
      !text(ctx, argv[3], http_server::kMaxResponseBytes, body))
    return JS_ThrowTypeError(ctx, "httpServer.respond: expected id, status, content type and a body of at most 4 MiB");
  return JS_NewBool(ctx, http_server::respond(id, code, std::move(type), std::move(body)));
}

// What the worker last looked up: no socket is opened on the calling (render) thread.
JSValue address(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  return JS_NewString(ctx, http_server::status().address.c_str());
}

} // namespace

JSValue ps5_react_http_server_api(JSContext* ctx) {
  JSValue api = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, api, "start", JS_NewCFunction(ctx, start, "start", 4));
  JS_SetPropertyStr(ctx, api, "token", JS_NewCFunction(ctx, token, "token", 0));
  JS_SetPropertyStr(ctx, api, "setPage", JS_NewCFunction(ctx, set_page, "setPage", 1));
  JS_SetPropertyStr(ctx, api, "stop", JS_NewCFunction(ctx, stop, "stop", 0));
  JS_SetPropertyStr(ctx, api, "status", JS_NewCFunction(ctx, status, "status", 0));
  JS_SetPropertyStr(ctx, api, "poll", JS_NewCFunction(ctx, poll, "poll", 0));
  JS_SetPropertyStr(ctx, api, "respond", JS_NewCFunction(ctx, respond, "respond", 4));
  JS_SetPropertyStr(ctx, api, "push", JS_NewCFunction(ctx, push, "push", 2));
  JS_SetPropertyStr(ctx, api, "address", JS_NewCFunction(ctx, address, "address", 0));
  return api;
}
