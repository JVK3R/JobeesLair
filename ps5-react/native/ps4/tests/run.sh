#!/usr/bin/env bash
# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
# The PS4 network layer's tests, on Linux: native/ps4/sce_http.cpp against a scripted stand-in for Sony's libraries
# (test_sce_http.cpp), then network_sce.cpp and shared/image_loader.cpp's PS4 path against server.py, with
# sce_http_fake.cpp (blocking libcurl) standing in for Sony's HTTP client, all under ASan and UBSan.
# Needs clang, libcurl's headers, python3 and the stb_image dependency (.deps/stbImage, fetched by any build).
set -u -o pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
FLAGS=(-std=c++20 -O1 -g -fsanitize=address,undefined -Wall -Wextra -Werror -I "$ROOT/native/ps4" -I "$ROOT/native/shared" -I "$HERE")
# The build writes app_config.hpp from app.json; the test's own says only the user agent.
printf '#define PS5_REACT_USER_AGENT "JobeesLair/test (PS5)"\n' > "$OUT/app_config.hpp"
clang++ "${FLAGS[@]}" -I "$OUT" "$HERE/test_sce_http.cpp" "$ROOT/native/ps4/sce_http.cpp" -lpthread -o "$OUT/test_sce_http" || exit 1
clang++ "${FLAGS[@]}" "$HERE/test_network.cpp" "$ROOT/native/ps4/network_sce.cpp" "$HERE/sce_http_fake.cpp" \
  -lcurl -lpthread -o "$OUT/test_network" || exit 1
clang++ "${FLAGS[@]}" -DPS5_REACT_SCE_HTTP=1 -I "$ROOT/.deps/stbImage" "$HERE/test_images.cpp" "$ROOT/native/shared/image_loader.cpp" \
  "$ROOT/native/ps4/network_sce.cpp" "$HERE/sce_http_fake.cpp" -lcurl -lpthread -o "$OUT/test_images" || exit 1
status=0
"$OUT/test_sce_http" | grep -E "^(PASS|FAIL)|passed" || status=1
PORT=${PORT:-8797}
python3 "$HERE/server.py" "$PORT" "$OUT/expected.txt" &
SERVER=$!
trap 'kill $SERVER; rm -rf "$OUT"' EXIT
sleep 1.5
mkdir -p "$OUT/files" "$OUT/images"
"$OUT/test_network" "$PORT" "$OUT/expected.txt" "$OUT/files" | grep -E "^(PASS|FAIL)|passed" || status=1
"$OUT/test_images" "$PORT" "$OUT/images" | grep -E "^(PASS|FAIL)|passed" || status=1
exit $status
