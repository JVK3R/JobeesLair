// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#pragma once

namespace ps4_platform {
// The controller the light bar and vibration go to (native_host.cpp opens it).
void set_pad(int handle);
// Where the app's own files live: /data/ps5-react/<PS4 title ID>, which /download0 names.
const char* data_root();
// Makes the data folder and its tmp, cache and dev folders; false when one can't be made.
bool prepare_storage();
}
