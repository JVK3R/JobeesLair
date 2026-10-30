// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// ABI v24 in the desktop preview (keyboard.hpp): while the app's keyboard is open, what is typed on the computer's
// keyboard goes into it. The window's title shows the text; Enter finishes (Shift+Enter starts a new line in a
// multiline one), Escape cancels, and a controller's Cross and Circle do the same. A tool finishes it with the
// control channel's `type <text>` or cancels it with `keyboard-cancel` (tools/ps5_drive.py).
#include "keyboard.hpp"
#include "keyboard_desktop.hpp"
#include <cstdio>
#include <string>

namespace {
SDL_Window* window = nullptr;
std::string window_title;
bool showing = false;
keyboard::Options current;
std::u16string text;
keyboard::Outcome outcome = keyboard::Outcome::kNone;
std::string typed;

void show() {
  if (!window) return;
  std::string shown = keyboard::utf8(text);
  if (current.password) shown.assign(text.size(), '*');
  const std::string label = current.title.empty() ? std::string("Keyboard") : current.title;
  SDL_SetWindowTitle(window, (label + ": " + shown + "_  (Enter to finish, Esc to cancel)").c_str());
}

void finish(keyboard::Outcome how) {
  showing = false;
  outcome = how;
  typed = how == keyboard::Outcome::kDone ? keyboard::utf8(text) : std::string();
  SDL_StopTextInput();
  if (window) SDL_SetWindowTitle(window, window_title.c_str());
  static const char* const kNames[] = {"", "done", "cancelled", "aborted"};
  std::printf("[keyboard] %s%s%s\n", kNames[static_cast<int>(how)], how == keyboard::Outcome::kDone ? ": " : "",
              how == keyboard::Outcome::kDone && !current.password ? typed.c_str() : "");
  std::fflush(stdout);
}

void append(const std::string& more) {
  const std::u16string added = keyboard::utf16(more, current.max_length - text.size());
  for (char16_t c : added)
    if (current.multiline || (c != u'\n' && c != u'\r')) text += c;
}
} // namespace

void desktop_keyboard_window(SDL_Window* main_window) {
  window = main_window;
  if (window) window_title = SDL_GetWindowTitle(window);
}

bool desktop_keyboard_event(const SDL_Event& event) {
  if (!showing) return false;
  switch (event.type) {
    case SDL_TEXTINPUT:
      append(event.text.text);
      show();
      return true;
    case SDL_KEYDOWN: {
      const SDL_Keycode key = event.key.keysym.sym;
      if (key == SDLK_ESCAPE) {
        finish(keyboard::Outcome::kCancelled);
      } else if (key == SDLK_RETURN || key == SDLK_KP_ENTER) {
        if (current.multiline && (SDL_GetModState() & KMOD_SHIFT)) append("\n");
        else finish(keyboard::Outcome::kDone);
      } else if (key == SDLK_BACKSPACE && !text.empty()) {
        text.pop_back();
        if (!text.empty() && text.back() >= 0xD800 && text.back() <= 0xDBFF) text.pop_back(); // the pair's other half
      } else if (key == SDLK_v && (SDL_GetModState() & (KMOD_CTRL | KMOD_GUI)) && SDL_HasClipboardText()) {
        char* pasted = SDL_GetClipboardText();
        append(pasted ? pasted : "");
        SDL_free(pasted);
      }
      if (showing) show();
      return true;
    }
    case SDL_KEYUP:
      return true;
    case SDL_CONTROLLERBUTTONDOWN:
      if (event.cbutton.button == SDL_CONTROLLER_BUTTON_A) finish(keyboard::Outcome::kDone);
      else if (event.cbutton.button == SDL_CONTROLLER_BUTTON_B) finish(keyboard::Outcome::kCancelled);
      return true;
    case SDL_CONTROLLERBUTTONUP:
      return true;
    default:
      return false;
  }
}

bool desktop_keyboard_type(const std::string& value, bool cancel) {
  if (!showing) return false;
  if (cancel) {
    finish(keyboard::Outcome::kCancelled);
    return true;
  }
  text.clear();
  append(value);
  finish(keyboard::Outcome::kDone);
  return true;
}

namespace keyboard {
void preload() {}
bool available() { return true; }

bool open(const Options& options, std::string& error) {
  if (showing) {
    error = "a keyboard is already open";
    return false;
  }
  current = options;
  text = utf16(options.text, options.max_length);
  showing = true;
  outcome = Outcome::kNone;
  typed.clear();
  SDL_StartTextInput();
  show();
  std::printf("[keyboard] open: %s (type in the preview window; Enter finishes, Esc cancels)\n",
              options.title.empty() ? "untitled" : options.title.c_str());
  std::fflush(stdout);
  return true;
}

bool is_open() { return showing; }
void tick() {}

Outcome take(std::string& out) {
  if (showing) return Outcome::kNone;
  const Outcome result = outcome;
  outcome = Outcome::kNone;
  out = result == Outcome::kDone ? std::move(typed) : std::string();
  typed.clear();
  return result;
}

void close() {
  if (showing) finish(Outcome::kAborted);
}
} // namespace keyboard
