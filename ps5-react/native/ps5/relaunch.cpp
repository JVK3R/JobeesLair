// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "app_config.hpp"
#include "host_api.hpp"
#include "payload_loader.hpp"
#include <cstdio>
#include <cstring>
#include <string>

// relauncher.elf (native/ps5/payloads/relauncher.c) waits for this title to close and opens it again.
// It answers "ready" once it has the request, which is the proof the app needs before it closes.
bool host::arrange_relaunch(char* error, std::size_t size) {
  std::string reason;
  const int socket = payload_loader::send("relauncher.elf", std::string("RLA1\n") + PS5_REACT_TITLE + "\n", 3'000'000, "relaunch", reason);
  if (socket >= 0) {
    char answer[16] = {};
    const int count = payload_loader::receive(socket, answer, sizeof answer - 1);
    payload_loader::close(socket);
    if (count > 0 && !std::strncmp(answer, "ready\n", 6)) return true;
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
    char answer[16] = {};
    const int count = payload_loader::receive(socket, answer, sizeof answer - 1);
    payload_loader::close(socket);
    if (count > 0 && (!std::strncmp(answer, "ready\n", 6) || !std::strncmp(answer, "armed\n", 6))) return true;
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
