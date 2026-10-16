# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
"""Fails the build when the linked title imports a function the console does not give titles.

The payload SDK's stubs declare more than a title can call: a symbol only libScePosixForWebKit exports
(WebKit's private POSIX layer) links fine but faulted at address 0 when called, as the *at calls did from
libkernel_sys (see native/shared/archives.cpp). Such a call kills the title on first use, often far from
startup, so it is caught here instead.

    python3 check_imports.py <llvm-nm> <linked pie elf> <sdk target/lib>
"""
import shutil
import subprocess
import sys
from pathlib import Path

# Modules whose exports are not a title's: anything only they provide is refused.
TITLE_UNSAFE_MODULES = ("libScePosixForWebKit.so",)
# Functions known to fault from a title although some module the title loads declares them.
TITLE_UNSAFE_FUNCTIONS = {"openat", "mkdirat", "fstatat", "unlinkat", "renameat", "linkat", "symlinkat",
                          "readlinkat", "fchmodat", "fchownat", "faccessat", "arc4random", "arc4random_buf",
                          "arc4random_uniform"}


def symbols(nm, path, *flags):
    out = subprocess.run([str(nm), "-D", *flags, str(path)], capture_output=True, text=True, check=True).stdout
    return {line.split()[-1] for line in out.splitlines() if line.strip()}


def find_nm(given):
    # --llvm points at clang's directory; Ubuntu ships llvm-nm only versioned (llvm-nm-18) there.
    for candidate in (given, shutil.which("llvm-nm-18"), shutil.which("llvm-nm")):
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    sys.exit(f"llvm-nm not found (looked for {given}, llvm-nm-18 and llvm-nm on PATH)")


def main():
    nm, elf, libs = find_nm(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    imported = symbols(nm, elf, "--undefined-only")
    unsafe, safe = set(), set()
    for lib in sorted(libs.glob("*.so")):
        (unsafe if lib.name in TITLE_UNSAFE_MODULES else safe).update(symbols(nm, lib, "--defined-only"))
    refused = sorted((imported & (unsafe - safe)) | (imported & TITLE_UNSAFE_FUNCTIONS))
    if refused:
        sys.exit("The title imports functions the console does not give titles (calling one faults):\n  "
                 + "\n  ".join(refused) + "\nUse another way to do what they do (see tools/check_imports.py).")
    print(f"imports: {len(imported)} checked, none title-unsafe")


if __name__ == "__main__":
    main()
