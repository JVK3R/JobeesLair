// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// ABI v24 `keyboard.*` (keyboard.hpp): the bridge, and the text conversions both platforms share.
#include "host_api.hpp"
#include "keyboard.hpp"
#include <cmath>
#include <cstring>
#include <string>

namespace keyboard {
std::u16string utf16(const std::string& text, std::size_t limit) {
  std::u16string out;
  const auto* p = reinterpret_cast<const unsigned char*>(text.data());
  const std::size_t length = text.size();
  for (std::size_t at = 0; at < length;) {
    const unsigned char b = p[at];
    const int count = b < 0x80 ? 1 : (b & 0xE0) == 0xC0 ? 2 : (b & 0xF0) == 0xE0 ? 3 : (b & 0xF8) == 0xF0 ? 4 : 0;
    std::uint32_t cp = 0xFFFD;
    if (count && at + count <= length) {
      cp = count == 1 ? b : b & (0x7F >> count);
      for (int i = 1; i < count && cp != 0xFFFD; ++i)
        cp = (p[at + i] & 0xC0) == 0x80 ? (cp << 6) | (p[at + i] & 0x3F) : 0xFFFD;
      // Overlong forms, surrogates and values past U+10FFFF are not characters.
      if ((count == 2 && cp < 0x80) || (count == 3 && cp < 0x800) || (count == 4 && cp < 0x10000) || cp > 0x10FFFF ||
          (cp >= 0xD800 && cp <= 0xDFFF))
        cp = 0xFFFD;
      at += count;
    } else {
      ++at;
    }
    const std::size_t needed = cp >= 0x10000 ? 2 : 1;
    if (out.size() + needed > limit) break;
    if (cp >= 0x10000) {
      out += static_cast<char16_t>(0xD800 + ((cp - 0x10000) >> 10));
      out += static_cast<char16_t>(0xDC00 + ((cp - 0x10000) & 0x3FF));
    } else {
      out += static_cast<char16_t>(cp);
    }
  }
  return out;
}

std::string utf8(const std::u16string& text) {
  std::string out;
  for (std::size_t i = 0; i < text.size(); ++i) {
    std::uint32_t cp = text[i];
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < text.size() && text[i + 1] >= 0xDC00 && text[i + 1] <= 0xDFFF) {
      cp = 0x10000 + ((cp - 0xD800) << 10) + (text[i + 1] - 0xDC00);
      ++i;
    } else if (cp >= 0xD800 && cp <= 0xDFFF) {
      cp = 0xFFFD; // a lone surrogate
    }
    if (cp < 0x80) {
      out += static_cast<char>(cp);
    } else if (cp < 0x800) {
      out += static_cast<char>(0xC0 | (cp >> 6));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
      out += static_cast<char>(0xE0 | (cp >> 12));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else {
      out += static_cast<char>(0xF0 | (cp >> 18));
      out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    }
  }
  return out;
}

std::size_t units(const std::string& text) { return utf16(text, static_cast<std::size_t>(-1)).size(); }
} // namespace keyboard

namespace {
// A string property, or `fallback` when it is missing; false (with the JS error thrown) otherwise.
bool string_field(JSContext* ctx, JSValueConst options, const char* name, std::size_t max_units, std::string& out) {
  JSValue value = JS_GetPropertyStr(ctx, options, name);
  bool ok = true;
  if (!JS_IsUndefined(value)) {
    std::size_t size = 0;
    const char* bytes = JS_IsString(value) ? JS_ToCStringLen(ctx, &size, value) : nullptr;
    if (!bytes) {
      JS_ThrowTypeError(ctx, "keyboard.open: %s must be a string", name);
      ok = false;
    } else {
      out.assign(bytes, size);
      JS_FreeCString(ctx, bytes);
      if (keyboard::units(out) > max_units) {
        JS_ThrowRangeError(ctx, "keyboard.open: %s is longer than %zu characters", name, max_units);
        ok = false;
      }
    }
  }
  JS_FreeValue(ctx, value);
  return ok;
}

// One of `names` (its index), or `fallback` when missing.
bool choice_field(JSContext* ctx, JSValueConst options, const char* name, const char* const* names, int count, int& out) {
  JSValue value = JS_GetPropertyStr(ctx, options, name);
  bool ok = true;
  if (!JS_IsUndefined(value)) {
    const char* text = JS_IsString(value) ? JS_ToCString(ctx, value) : nullptr;
    ok = false;
    for (int i = 0; text && i < count; ++i)
      if (!std::strcmp(text, names[i])) {
        out = i;
        ok = true;
      }
    if (text) JS_FreeCString(ctx, text);
    if (!ok) JS_ThrowRangeError(ctx, "keyboard.open: unknown %s", name);
  }
  JS_FreeValue(ctx, value);
  return ok;
}

bool flag_field(JSContext* ctx, JSValueConst options, const char* name, bool& out) {
  JSValue value = JS_GetPropertyStr(ctx, options, name);
  if (!JS_IsUndefined(value)) out = JS_ToBool(ctx, value) > 0;
  JS_FreeValue(ctx, value);
  return true;
}

JSValue available(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  host::CallScope scope("keyboard.available");
  return JS_NewBool(ctx, keyboard::available());
}

// keyboard.open({title, text, placeholder, maxLength, type, enter, multiline, password})
JSValue open_keyboard(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  host::CallScope scope("keyboard.open");
  static const char* const kTypes[] = {"default", "basic", "url", "mail", "number"};
  static const char* const kEnters[] = {"default", "send", "search", "go"};
  if (argc < 1 || !JS_IsObject(argv[0])) return JS_ThrowTypeError(ctx, "keyboard.open: expected an options object");
  keyboard::Options options;
  int type = 0, enter = 0;
  if (!string_field(ctx, argv[0], "title", keyboard::kMaxLabel, options.title) ||
      !string_field(ctx, argv[0], "placeholder", keyboard::kMaxLabel, options.placeholder) ||
      !string_field(ctx, argv[0], "text", keyboard::kMaxLength, options.text) ||
      !choice_field(ctx, argv[0], "type", kTypes, 5, type) || !choice_field(ctx, argv[0], "enter", kEnters, 4, enter) ||
      !flag_field(ctx, argv[0], "multiline", options.multiline) || !flag_field(ctx, argv[0], "password", options.password))
    return JS_EXCEPTION;
  JSValue length = JS_GetPropertyStr(ctx, argv[0], "maxLength");
  if (!JS_IsUndefined(length)) {
    double value = 0;
    if (JS_ToFloat64(ctx, &value, length) || value != std::floor(value) || value < 1 || value > keyboard::kMaxLength) {
      JS_FreeValue(ctx, length);
      return JS_ThrowRangeError(ctx, "keyboard.open: maxLength must be a whole number from 1 to %u", keyboard::kMaxLength);
    }
    options.max_length = static_cast<std::uint32_t>(value);
  }
  JS_FreeValue(ctx, length);
  options.type = static_cast<keyboard::Type>(type);
  options.enter = static_cast<keyboard::Enter>(enter);
  // The system keyboard's own rules: hidden text only for plain Latin or numbers, several lines only for text.
  if (options.password && options.multiline) return JS_ThrowRangeError(ctx, "keyboard.open: password text has one line");
  if (options.password && type != 1 && type != 4)
    return JS_ThrowRangeError(ctx, "keyboard.open: password needs type 'basic' or 'number'");
  if (options.multiline && type > 1) return JS_ThrowRangeError(ctx, "keyboard.open: multiline needs type 'default' or 'basic'");
  std::string error;
  if (!keyboard::open(options, error)) return JS_ThrowPlainError(ctx, "keyboard.open: %s", error.c_str());
  return JS_UNDEFINED;
}

// null while open (or when nothing is left to report), else {status, text} once.
JSValue poll(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  std::string text;
  const keyboard::Outcome outcome = keyboard::take(text);
  if (outcome == keyboard::Outcome::kNone) return JS_NULL;
  static const char* const kNames[] = {"", "done", "cancelled", "aborted"};
  JSValue out = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, out, "status", JS_NewString(ctx, kNames[static_cast<int>(outcome)]));
  JS_SetPropertyStr(ctx, out, "text", JS_NewStringLen(ctx, text.data(), text.size()));
  return out;
}

JSValue close_keyboard(JSContext*, JSValueConst, int, JSValueConst*) {
  host::CallScope scope("keyboard.close");
  keyboard::close();
  return JS_UNDEFINED;
}

JSValue is_open(JSContext* ctx, JSValueConst, int, JSValueConst*) { return JS_NewBool(ctx, keyboard::is_open()); }
} // namespace

JSValue ps5_react_keyboard_api(JSContext* ctx) {
  JSValue api = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, api, "available", JS_NewCFunction(ctx, available, "available", 0));
  JS_SetPropertyStr(ctx, api, "open", JS_NewCFunction(ctx, open_keyboard, "open", 1));
  JS_SetPropertyStr(ctx, api, "poll", JS_NewCFunction(ctx, poll, "poll", 0));
  JS_SetPropertyStr(ctx, api, "close", JS_NewCFunction(ctx, close_keyboard, "close", 0));
  JS_SetPropertyStr(ctx, api, "isOpen", JS_NewCFunction(ctx, is_open, "isOpen", 0));
  return api;
}
