# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
"""The PS4's networking libraries, built from the pinned sources with the OpenOrbis toolchain: zlib, OpenSSL and
curl, the versions the PS5's ports carry. The PS5's prebuilt ports are made for its own C library, so the PS4 builds
its own against OpenOrbis's. Static libraries and headers land in .deps/ps4-ports/<versions>."""
import hashlib
import os
from pathlib import Path
import shutil
import tarfile

from common import DEPS, LOCK, ROOT, fetch, run

# zlib's library sources: the build is these, compiled one by one (its configure script links test programs).
ZLIB_SOURCES = ["adler32", "compress", "crc32", "deflate", "gzclose", "gzlib", "gzread", "gzwrite", "infback",
                "inffast", "inflate", "inftrees", "trees", "uncompr", "zutil"]


def source(name):
    item = LOCK["ps4Ports"][name]
    archive = fetch(item["url"], DEPS / "ps4-ports-src" / Path(item["url"]).name, item["sha256"])
    directory = DEPS / "ps4-ports-src" / f"{name}-{item['version']}"
    if not directory.exists():
        with tarfile.open(archive) as package:
            package.extractall(directory.parent, filter="data")
    return directory


def ca_bundle():
    """Mozilla's certificate list as curl publishes it: an app's sandbox on the PS4 has no /system, so the console's
    own list is out of its reach (native/ps4/network_platform.cpp)."""
    item = LOCK["ps4Ports"]["caBundle"]
    return fetch(item["url"], DEPS / "ps4-ports-src" / Path(item["url"]).name, item["sha256"])


def shims():
    """A short hash of the header shims the libraries are built against (native/ps4/include): changing one builds
    them all again."""
    digest = hashlib.sha256()
    for path in sorted((ROOT / "native/ps4/include").rglob("*.h")):
        digest.update(path.relative_to(ROOT).as_posix().encode() + bytes(1) + path.read_bytes())
    return digest.hexdigest()[:8]


def ports(toolchain, llvm):
    """The prefix holding include/ and lib/ (libz.a, libssl.a, libcrypto.a, libcurl.a), built once per version set
    and set of shims; a library already in it is not built again."""
    versions = "-".join(f"{name}{LOCK['ps4Ports'][name]['version']}" for name in ("zlib", "openssl", "curl"))
    prefix = DEPS / "ps4-ports" / f"{versions}-{shims()}"
    if (prefix / ".complete").exists():
        return prefix
    (prefix / "lib").mkdir(parents=True, exist_ok=True)
    (prefix / "include").mkdir(exist_ok=True)
    build = DEPS / "ps4-ports-build"
    build.mkdir(parents=True, exist_ok=True)
    cflags = ["--target=x86_64-pc-freebsd12-elf", "-fPIC", "-funwind-tables", f"--sysroot={toolchain}",
              "-isystem", str(ROOT / "native/ps4/include"), "-isystem", str(toolchain / "include"),
              "-D_DEFAULT_SOURCE", "-DORBIS=1", "-O2"]
    env = dict(os.environ, OO_PS4_TOOLCHAIN=str(toolchain))

    zlib = source("zlib")
    objects = [] if not (prefix / "lib/libz.a").exists() else None
    for name in ZLIB_SOURCES if objects is not None else ():
        obj = build / f"zlib-{name}.o"
        run([llvm / "clang", *cflags, "-w", "-DHAVE_UNISTD_H", "-DHAVE_STDARG_H", "-c", zlib / f"{name}.c", "-o", obj],
            log=build / "zlib.log")
        objects.append(obj)
    if objects is not None:
        run([llvm / "llvm-ar", "rcs", prefix / "lib/libz.a", *objects], log=build / "zlib.log")
        for header in ("zlib.h", "zconf.h"):
            shutil.copy2(zlib / header, prefix / "include" / header)

    # OpenSSL: libraries only. It seeds itself from the kern.arandom sysctl, which the PS4 host answers from the
    # console's generator (include/sys/sysctl.h, native/ps4/random_compat.c). No datagrams (DTLS, QUIC): curl doesn't
    # use them, and their BSD socket code expects FreeBSD's in6_addr, not musl's. The source folder is shared, and its
    # make doesn't track the shims (system headers), so every build starts clean.
    openssl = source("openssl")
    if not (prefix / "lib/libssl.a").exists():
        run(["perl", openssl / "Configure", "BSD-x86_64", "no-shared", "no-module", "no-dso", "no-engine", "no-async",
             "no-tests", "no-apps", "no-docs", "no-ui-console", "no-comp", "no-afalgeng", "no-dgram", "no-dtls",
             "no-quic", f"--prefix={prefix}", "--libdir=lib", f"CC={llvm / 'clang'}", f"AR={llvm / 'llvm-ar'}",
             f"RANLIB={llvm / 'llvm-ranlib'}", "CFLAGS=" + " ".join(cflags)],
            env=env, cwd=openssl, log=build / "openssl-configure.log")
        run(["make", "clean"], env=env, cwd=openssl, log=build / "openssl-clean.log")
        run(["make", "-j8", "build_libs"], env=env, cwd=openssl, log=build / "openssl-build.log")
        run(["make", "install_dev"], env=env, cwd=openssl, log=build / "openssl-install.log")

    # curl: HTTP and HTTPS only, over OpenSSL with zlib for compressed answers. The checks find these in musl, but
    # each is a Linux system call the PS4's kernel (FreeBSD 9) doesn't have: curl wakes itself with a pipe instead of
    # an eventfd, accepts with accept(), and leaves the rest (and Linux's STREAMS header) alone.
    linux_only = ["HAVE_ACCEPT4", "HAVE_PIPE2", "HAVE_EVENTFD", "HAVE_SYS_EVENTFD_H", "HAVE_SENDMMSG", "HAVE_GETIFADDRS",
                  "HAVE_IF_NAMETOINDEX", "HAVE_FSETXATTR", "HAVE_FSETXATTR_5", "HAVE_CLOCK_GETTIME_MONOTONIC_RAW",
                  "HAVE_STROPTS_H"]
    curl = source("curl")
    shutil.rmtree(build / "curl", ignore_errors=True)
    run(["cmake", "-S", curl, "-B", build / "curl", "-G", "Ninja",
         f"-DCMAKE_TOOLCHAIN_FILE={ROOT / 'native/ps4/orbis-ports.cmake'}", f"-DLLVM_BIN={llvm}",
         "-DCMAKE_BUILD_TYPE=Release", f"-DCMAKE_INSTALL_PREFIX={prefix}", f"-DCMAKE_PREFIX_PATH={prefix}",
         "-DCMAKE_C_FLAGS=" + " ".join(cflags[1:]),  # replaces the toolchain's own, so all of them
         "-DBUILD_SHARED_LIBS=OFF", "-DBUILD_STATIC_LIBS=ON", "-DBUILD_CURL_EXE=OFF", "-DBUILD_TESTING=OFF",
         "-DBUILD_LIBCURL_DOCS=OFF", "-DBUILD_MISC_DOCS=OFF", "-DENABLE_CURL_MANUAL=OFF", "-DCURL_DISABLE_INSTALL=OFF",
         # The libraries by path: the toolchain file keeps CMake's searches inside the OpenOrbis folder.
         "-DHTTP_ONLY=ON", "-DCURL_USE_OPENSSL=ON", "-DOPENSSL_USE_STATIC_LIBS=ON",
         f"-DOPENSSL_INCLUDE_DIR={prefix / 'include'}", f"-DOPENSSL_SSL_LIBRARY={prefix / 'lib/libssl.a'}",
         f"-DOPENSSL_CRYPTO_LIBRARY={prefix / 'lib/libcrypto.a'}", "-DCURL_ZLIB=ON",
         f"-DZLIB_INCLUDE_DIR={prefix / 'include'}", f"-DZLIB_LIBRARY={prefix / 'lib/libz.a'}",
         "-DCURL_USE_LIBPSL=OFF", "-DCURL_USE_LIBSSH2=OFF",
         "-DUSE_NGHTTP2=OFF", "-DCURL_BROTLI=OFF", "-DCURL_ZSTD=OFF", "-DUSE_LIBIDN2=OFF", "-DENABLE_IPV6=OFF",
         "-DCURL_CA_BUNDLE=none", "-DCURL_CA_PATH=none", "-DENABLE_UNIX_SOCKETS=OFF",
         *[f"-D{name}=0" for name in linux_only]],
        env=env, log=build / "curl-configure.log")
    run(["cmake", "--build", build / "curl", "-j", "8"], env=env, log=build / "curl-build.log")
    run(["cmake", "--install", build / "curl"], env=env, log=build / "curl-install.log")
    (prefix / ".complete").write_text(versions + "\n")
    return prefix


if __name__ == "__main__":
    tc = Path(os.environ.get("OO_PS4_TOOLCHAIN", Path.home() / "ps4/PS4Toolchain")).resolve()
    print(ports(tc, Path("/usr/lib/llvm-18/bin")))
