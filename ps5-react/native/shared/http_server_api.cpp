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

JSValue start(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::vector<std::uint16_t> ports;
  std::string pin, page;
  if (argc < 3 || !port_list(ctx, argv[0], ports) || !text(ctx, argv[1], http_server::kPinDigits, pin) ||
      !text(ctx, argv[2], http_server::kMaxPageBytes, page))
    return JS_ThrowTypeError(ctx, "httpServer.start: expected a port or 1..8 ports (0..65535), a 6-digit PIN and a page of at most 512 KiB");
  if (!network::running())
    return JS_ThrowPlainError(ctx, "httpServer.start: enable networking: true and filesystemAccess: console in app.json");
  std::string error;
  if (!http_server::start(std::move(ports), std::move(pin), std::move(page), error))
    return JS_ThrowPlainError(ctx, "httpServer.start: %s", error.c_str());
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
  return out;
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
  JS_SetPropertyStr(ctx, api, "start", JS_NewCFunction(ctx, start, "start", 3));
  JS_SetPropertyStr(ctx, api, "stop", JS_NewCFunction(ctx, stop, "stop", 0));
  JS_SetPropertyStr(ctx, api, "status", JS_NewCFunction(ctx, status, "status", 0));
  JS_SetPropertyStr(ctx, api, "poll", JS_NewCFunction(ctx, poll, "poll", 0));
  JS_SetPropertyStr(ctx, api, "respond", JS_NewCFunction(ctx, respond, "respond", 4));
  JS_SetPropertyStr(ctx, api, "address", JS_NewCFunction(ctx, address, "address", 0));
  return api;
}
