// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// ABI v24: the on-screen keyboard (`Keyboard` in runtime/js/native.js). On the PS5 it is the system keyboard
// (libSceImeDialog), drawn by the system over the app in the player's own languages and input methods; the
// desktop preview takes what is typed on the computer's keyboard, or a tool's `type` command.
// Everything runs on the render thread. While it is open the host keeps the controller from the app, and once
// it closes, buttons still held from it (the Cross that confirmed it) are let go before the app hears them.
#pragma once
#include <cstdint>
#include <string>

namespace keyboard {
enum class Type : int { kDefault = 0, kBasicLatin = 1, kUrl = 2, kMail = 3, kNumber = 4 };
enum class Enter : int { kDefault = 0, kSend = 1, kSearch = 2, kGo = 3 };
enum class Outcome : int { kNone = 0, kDone = 1, kCancelled = 2, kAborted = 3 };
// The system keyboard's limits: text and its maximum in UTF-16 code units, title and placeholder likewise.
inline constexpr std::uint32_t kMaxLength = 2048, kMaxLabel = 127;

struct Options {
  std::string title, text, placeholder; // UTF-8
  std::uint32_t max_length = 255;       // 1..kMaxLength
  Type type = Type::kDefault;
  Enter enter = Enter::kDefault;
  bool multiline = false, password = false;
};

// Per platform (native/ps5/keyboard.cpp, native/desktop/keyboard.cpp).
// Whether open() can work here at all (PS5: the system keyboard's module and calls resolved).
bool available();
// Opens it over the app; false, with why, when one is already open or the system refused it.
bool open(const Options& options, std::string& error);
// Whether one is open now: hosts hold the controller's input from the app while it is.
bool is_open();
// Once per frame: follows an open keyboard until it closes.
void tick();
// What the last keyboard ended with, once (kNone while one is open, or when it was already taken); `text` is
// what was typed when it ended kDone, else empty.
Outcome take(std::string& text);
// Asks an open keyboard to close; its outcome is kAborted.
void close();
// PS5: loads the system keyboard's module before filesystem elevation, when a title still can (host_platform.cpp).
void preload();

// UTF-8 <-> UTF-16 for the system keyboard's text; malformed input becomes U+FFFD. `limit` counts code units
// and never cuts a surrogate pair.
std::u16string utf16(const std::string& text, std::size_t limit);
std::string utf8(const std::u16string& text);
// UTF-16 code units `text` takes.
std::size_t units(const std::string& text);
} // namespace keyboard
