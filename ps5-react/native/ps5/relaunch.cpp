// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "app_config.hpp"
#include "host_api.hpp"
#include "payload_loader.hpp"
#include <cstdio>
#include <cstring>
#include <string>

// A payload's answer: its first line that is its own. MODIFIED (Jobee'sLair 0.5.1): the loader gives the
// payload this socket as its stdout and stderr, and a system library can write a line of its own there
// before the payload answers ("[SceLncUtil] ... getAppStatus: LNC_ISOK::0x80940004" came first on a
// console, now and then); read as the first 15 bytes, that line was "did not answer", the app withdrew
// the update, and updater.elf, which had answered "ready" right after, found it withdrawn and quit. As
// send_payload below: lines are read one at a time, and up to 8 that open with "[" are passed over.
static std::string payload_answer(int socket) {
  std::string line;
  for (int lines = 0; lines < 8; ++lines) {
    line.clear();
    char byte = 0;
    while (line.size() < 255 && payload_loader::receive(socket, &byte, 1) == 1) {
      line += byte;
      if (byte == '\n') break;
    }
    if (line.empty() || line[0] != '[') break;
  }
  return line;
}

// relauncher.elf (native/ps5/payloads/relauncher.c) waits for this title to close and opens it again.
// It answers "ready" once it has the request, which is the proof the app needs before it closes.
bool host::arrange_relaunch(char* error, std::size_t size) {
  std::string reason;
  const int socket = payload_loader::send("relauncher.elf", std::string("RLA1\n") + PS5_REACT_TITLE + "\n", 3'000'000, "relaunch", reason);
  if (socket >= 0) {
    const std::string answer = payload_answer(socket);
    payload_loader::close(socket);
    if (answer == "ready\n") return true;
    reason = "relaunch: relauncher.elf did not answer";
  }
  std::snprintf(error, size, "%s", reason.c_str());
  return false;
}

// updater.elf (native/ps5/payloads/updater.c) waits for this title to close, then carries out the
// control directory's apply.txt. It answers "ready" once it has the request, or "armed" when another
// updater already waits (that one reads apply.txt when the title closes, so the request still holds).
bool host::arm_update(const char* control_dir, char* error, std::size_t size) {
  std::string reason;
  const int socket = payload_loader::send("updater.elf", std::string("UPD1\n") + PS5_REACT_TITLE + "\n" + control_dir + "\n",
                                          3'000'000, "update", reason);
  if (socket >= 0) {
    const std::string answer = payload_answer(socket);
    payload_loader::close(socket);
    if (answer == "ready\n" || answer == "armed\n") return true;
    reason = "update: updater.elf did not answer";
  }
  std::snprintf(error, size, "%s", reason.c_str());
  return false;
}

// ABI v22 `payloads.send`: any ELF the app can read, to the loader on 127.0.0.1:`port`, then `request` as
// its standard input. With `answer`, the first line it writes back (at most 3 s) comes back in `reply`.
// MODIFIED (Jobee'sLair 0.5.0): the loader gives the payload this socket as its stdout and stderr, so a system
// library's own log line ("[SceLncUtil] ...") can come before the payload's answer: up to 8 of those are skipped.
bool host::send_payload(const char* path, int port, const std::string& request, bool answer, std::string& reply,
                        std::string& error) {
  const int socket = payload_loader::send_file(path, port, request, 3'000'000, "Payloads.send", error);
  if (socket < 0) return false;
  for (int lines = 0; answer && lines < 8; ++lines) {
    char line[256] = {};
    std::size_t used = 0;
    for (int count; used + 1 < sizeof line && (count = payload_loader::receive(socket, line + used, 1)) == 1;)
      if (line[used++] == '\n') break;
    const bool whole = used && line[used - 1] == '\n';
    reply.assign(line, whole ? used - 1 : used);
    if (!whole || reply.empty() || reply[0] != '[') break;
  }
  payload_loader::close(socket);
  return true;
}
