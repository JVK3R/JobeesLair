# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
# PS4 (Orbis) cross build with the OpenOrbis toolchain and LLVM 18: static libraries only (the engine,
# its QuickJS bridge and the software backend); tools/build_ps4.py compiles and links the host itself.
# OO_PS4_TOOLCHAIN names the toolchain's root.
set(CMAKE_SYSTEM_NAME FreeBSD)
set(CMAKE_SYSTEM_PROCESSOR x86_64)
set(OO_PS4_TOOLCHAIN "$ENV{OO_PS4_TOOLCHAIN}" CACHE PATH "OpenOrbis PS4 toolchain root")
if(NOT OO_PS4_TOOLCHAIN)
  message(FATAL_ERROR "OO_PS4_TOOLCHAIN must name the OpenOrbis toolchain")
endif()
set(LLVM_BIN "/usr/lib/llvm-18/bin" CACHE PATH "LLVM 18 binaries")
set(CMAKE_C_COMPILER "${LLVM_BIN}/clang")
set(CMAKE_CXX_COMPILER "${LLVM_BIN}/clang++")
set(CMAKE_AR "${LLVM_BIN}/llvm-ar" CACHE FILEPATH "")
set(CMAKE_RANLIB "${LLVM_BIN}/llvm-ranlib" CACHE FILEPATH "")
set(CMAKE_C_COMPILER_TARGET x86_64-pc-freebsd12-elf)
set(CMAKE_CXX_COMPILER_TARGET x86_64-pc-freebsd12-elf)
set(CMAKE_SYSROOT "${OO_PS4_TOOLCHAIN}")
# native/ps4/include: the FreeBSD headers the engine's dependencies expect that OpenOrbis lacks. Frame pointers let the
# crash log (native/ps4/crash_log.c) follow the calls.
set(ORBIS_FLAGS "-fPIC -funwind-tables -fno-omit-frame-pointer -isystem ${CMAKE_CURRENT_LIST_DIR}/include -isystem ${OO_PS4_TOOLCHAIN}/include -DORBIS=1")
set(CMAKE_C_FLAGS_INIT "${ORBIS_FLAGS}")
set(CMAKE_CXX_FLAGS_INIT "${ORBIS_FLAGS} -isystem ${OO_PS4_TOOLCHAIN}/include/c++/v1")
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
