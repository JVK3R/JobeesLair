# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
# The PS4 toolchain for building curl (tools/ps4_ports.py): like orbis-toolchain.cmake, but its configuration
# checks link real test programs against the PS4's C library and libkernel stubs, so a function curl looks for is
# found only when the PS4 has it.
include("${CMAKE_CURRENT_LIST_DIR}/orbis-toolchain.cmake")
unset(CMAKE_TRY_COMPILE_TARGET_TYPE)
set(ORBIS_LINK "${LLVM_BIN}/ld.lld -m elf_x86_64 -pie --script ${OO_PS4_TOOLCHAIN}/link.x --eh-frame-hdr -L${OO_PS4_TOOLCHAIN}/lib")
set(CMAKE_C_LINK_EXECUTABLE "${ORBIS_LINK} <OBJECTS> -o <TARGET> <LINK_LIBRARIES> -lc -lkernel ${OO_PS4_TOOLCHAIN}/lib/crt1.o")
set(CMAKE_CXX_LINK_EXECUTABLE "${ORBIS_LINK} <OBJECTS> -o <TARGET> <LINK_LIBRARIES> -lc++ -lc -lkernel ${OO_PS4_TOOLCHAIN}/lib/crt1.o")
