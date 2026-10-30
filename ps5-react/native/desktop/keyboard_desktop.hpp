// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// The desktop preview's side of the keyboard (keyboard.cpp): the host hands it SDL's events first while one is open.
#pragma once
#include <SDL2/SDL.h>
#include <string>

// The window whose title shows the text while the keyboard is open.
void desktop_keyboard_window(SDL_Window* window);
// True when the open keyboard took the event (typing, Enter, Escape, Cross, Circle): the host passes it no further.
bool desktop_keyboard_event(const SDL_Event& event);
// A tool's `type <text>` (finishes it with that text) or `keyboard-cancel`; false when no keyboard is open.
bool desktop_keyboard_type(const std::string& text, bool cancel);
