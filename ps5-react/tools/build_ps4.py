# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
"""PS4 title build with the OpenOrbis toolchain (LLVM 18): the same app bundle as the PS5's, its 1920x1080
layout, the engine drawing on the CPU and native/ps4 putting frames on screen. Makes a fake PKG for GoldHEN.

OO_PS4_TOOLCHAIN (or --toolchain) names the OpenOrbis toolchain. --compile-only stops at the linked ELF. --network
picks the HTTP client: Sony's libSceHttp (sce, native/ps4/network_sce.cpp), or curl and OpenSSL built for the PS4
(curl, shared/network.cpp; tools/ps4_ports.py)."""
import argparse
from collections import Counter
from datetime import datetime
from html import escape
import os
from pathlib import Path
import shutil
import struct

from common import ROOT, run, dependency, digest, stb_image, bundle, layouts, layout_directory, resource_files
from text_fonts import harfbuzz, sheenbidi
import ps4_ports

PS4_LAYOUT = (1920, 1080)
PACK_FOLDER_FILES = 64  # a resource folder with more files than this goes into app.pack


def ps4_ids(config):
    """The PS4 title and content IDs: app.json's "ps4" when it has them, else made from the PS5 ones."""
    own = config.get("ps4", {})
    title = own.get("titleId") or "PSRE" + config["titleId"][-5:]
    label = config["contentId"].rsplit("-", 1)[-1]
    return title, own.get("contentId") or f"IV0000-{title}_00-{label}"


def write_pack(path, files):
    """app.pack (native/ps4/app_pack.cpp): "JLPACK1\\n", a u32 count, each entry's u16 name length, name, u64 offset
    and u32 size (little-endian), then the files' bytes in the same order."""
    names = [name.encode() for name in sorted(files)]
    blobs = [Path(files[name.decode()]).read_bytes() for name in names]
    offset = 12 + sum(14 + len(name) for name in names)
    entries = []
    for name, blob in zip(names, blobs):
        entries.append(struct.pack("<H", len(name)) + name + struct.pack("<QI", offset, len(blob)))
        offset += len(blob)
    path.write_bytes(b"JLPACK1\n" + struct.pack("<I", len(names)) + b"".join(entries) + b"".join(blobs))


def write_gp4(path, content, files):
    """The package project PkgTool builds from: every file, and every folder they are in (OpenOrbis's create-gp4
    declares only the first level, and PkgTool can't place a file in an undeclared folder)."""
    tree = {}
    for name in files:
        node = tree
        for part in name.split("/")[:-1]:
            node = node.setdefault(part, {})

    def folders(node, indent):
        lines = []
        for name in sorted(node):
            if node[name]:
                lines += [f'{indent}<dir targ_name="{escape(name)}">', *folders(node[name], indent + "\t"), f"{indent}</dir>"]
            else:
                lines.append(f'{indent}<dir targ_name="{escape(name)}" />')
        return lines

    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    path.write_text("\n".join([
        '<?xml version="1.0"?>',
        '<psproject fmt="gp4" version="1000">',
        "\t<volume>",
        "\t\t<volume_type>pkg_ps4_app</volume_type>",
        "\t\t<volume_id>PS4VOLUME</volume_id>",
        f"\t\t<volume_ts>{stamp}</volume_ts>",
        f'\t\t<package content_id="{content}" passcode="{"0" * 32}" storage_type="digital50" app_type="full" />',
        '\t\t<chunk_info chunk_count="1" scenario_count="1">',
        '\t\t\t<chunks><chunk id="0" layer_no="0" label="Chunk #0" /></chunks>',
        '\t\t\t<scenarios default_id="0"><scenario id="0" type="sp" initial_chunk_count="1" label="Scenario #0">0</scenario></scenarios>',
        "\t\t</chunk_info>",
        "\t</volume>",
        '\t<files img_no="0">',
        *[f'\t\t<file targ_path="{escape(name)}" orig_path="{escape(name)}" />' for name in files],
        "\t</files>",
        "\t<rootdir>",
        *folders(tree, "\t\t"),
        "\t</rootdir>",
        "</psproject>", ""]))


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--app", default="starter")
    source.add_argument("--app-dir", type=Path)
    parser.add_argument("--toolchain", type=Path, default=Path(os.environ.get("OO_PS4_TOOLCHAIN", Path.home() / "ps4/PS4Toolchain")))
    parser.add_argument("--llvm", type=Path, default=Path("/usr/lib/llvm-18/bin"))
    parser.add_argument("--compile-only", action="store_true", help="Stop at the linked ELF, without the PKG")
    parser.add_argument("--network", choices=("sce", "curl"), default="sce", help="HTTP client (default: Sony's libSceHttp)")
    args = parser.parse_args()
    app_dir = args.app_dir.resolve() if args.app_dir else ROOT / "apps" / args.app
    tc, llvm = args.toolchain.resolve(), args.llvm.resolve()
    build = ROOT / ".build" / app_dir.name / "ps4"
    for directory in (build, build / "obj"):
        directory.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, OO_PS4_TOOLCHAIN=str(tc))

    hui = dependency("platform")
    er = dependency("embeddedReact")
    quickjs = dependency("quickjsSource")
    _, config, generated = bundle(app_dir, er)
    if PS4_LAYOUT not in [layout[:2] for layout in layouts(config)]:
        raise SystemExit(f"{app_dir.name} has no {PS4_LAYOUT[0]}x{PS4_LAYOUT[1]} layout for the PS4")
    layout = layout_directory(generated, (*PS4_LAYOUT, *PS4_LAYOUT))
    title, content = ps4_ids(config)

    # The engine, its QuickJS bridge and the software backend, with native/ps5's engine settings.
    engine = build / "engine"
    # --fresh: the toolchain file's flags reach a build folder configured before they changed.
    run(["cmake", "--fresh", "-S", ROOT / "native/ps5", "-B", engine, f"-DCMAKE_TOOLCHAIN_FILE={ROOT / 'native/ps4/orbis-toolchain.cmake'}",
         "-DCMAKE_MAKE_PROGRAM=/usr/bin/make", f"-DLLVM_BIN={llvm}", f"-DER_ROOT={er}",
         f"-DFETCHCONTENT_SOURCE_DIR_QUICKJS={quickjs}", "-DCMAKE_BUILD_TYPE=Release"], env=env, log=build / "engine-configure.log")
    run(["cmake", "--build", engine, "--target", "er-bridge-quickjs", "er-software", "-j", "8"], env=env,
        log=build / "engine-build.log")
    definitions = next(line.split("=", 1)[1] for line in
                       (engine / "bridge/engine/CMakeFiles/embedded-react.dir/flags.make").read_text().splitlines()
                       if line.startswith("C_DEFINES ="))

    js_bundle = (layout / "app.bundle.js").read_bytes()
    bundle_c = build / "bundle.c"
    bundle_c.write_text("const char ps4_react_bundle[] = {" + ",".join(str(x) for x in js_bundle) + ",0};\n"
                        f"const unsigned ps4_react_bundle_size = {len(js_bundle)};\n")

    shared = ROOT / "native/shared"
    hb, sb = harfbuzz() / "src", sheenbidi()
    harfbuzz_sources = [hb / "harfbuzz.cc", hb / "hb-raster-draw.cc", hb / "hb-raster-image.cc"]
    # Networking: Sony's HTTP client (sce), or curl, OpenSSL and zlib built for the PS4 (tools/ps4_ports.py) with
    # getaddrinfo on the console's resolver (native/ps4/netdb.c).
    sce = args.network == "sce"
    ports = None if sce else ps4_ports.ports(tc, llvm)
    network_sources = ("sce_http.cpp", "network_sce.cpp") if sce else ("network_platform.cpp", "netdb.c", "random_compat.c")
    sources = [*(ROOT / "native/ps4" / n for n in ("native_host.cpp", "host_platform.cpp", "pending_modules.cpp", "app_pack.cpp",
                                                   "clock_compat.c", "crash_log.c", *network_sources)),
               *(shared / (n + ".cpp") for n in ("host_api", "removals", "copies", "disk_probes", "text_shaper",
                                                 "render_workers", "damage_tracker", "js_heap", "sound_api", "frame_stats",
                                                 *(() if sce else ("network",)), "network_api", "image_loader", "image_api")),
               hui / "src/audio/mixer.cpp", layout / "assets.generated.c", layout / "sounds.generated.c", bundle_c,
               *harfbuzz_sources, sb / "Source/SheenBidi.c"]
    includes = [ROOT / "native/ps4", ROOT / "native/ps4/include", shared, hui / "src", generated, er / "engine/include",
                er / "bridges/quickjs", er / "backends/software", er / "engine/text", hb, sb / "Headers", sb / "Source",
                quickjs, stb_image(), *(() if sce else (ports / "include",)), tc / "include"]
    # _DEFAULT_SOURCE: musl shows POSIX (nanosleep, CLOCK_MONOTONIC) to a strict -std=c++20 only when asked.
    target = ["--target=x86_64-pc-freebsd12-elf", "-fPIC", "-funwind-tables", "-fno-omit-frame-pointer", "-DORBIS=1",
              "-D_DEFAULT_SOURCE", f"-DPS4_REACT_TITLE=\"{title}\"",
              *(("-DPS5_REACT_SCE_HTTP=1",) if sce else ()), f"--sysroot={tc}"]
    objects = []
    for i, path in enumerate(sources):
        obj = build / "obj" / f"{i}-{path.name}.o"
        cpp = path.suffix in (".cpp", ".cc")
        flags = ["-std=c++20", "-fno-exceptions", "-fno-rtti", "-isystem", tc / "include/c++/v1"] if cpp else ["-std=c11"]
        warnings = (["-w", "-DHB_TINY", "-DHB_HAS_RASTER"] if path in harfbuzz_sources else
                    ["-w", "-DSB_CONFIG_UNITY"] if path.name == "SheenBidi.c" else
                    ["-w"] if path.suffix == ".c" else ["-Wall", "-Wextra", "-Werror"])
        run([llvm / ("clang++" if cpp else "clang"), *target, *flags, "-O2", *warnings, *definitions.split(),
             *[flag for path in includes for flag in ("-isystem" if path == tc / "include" else "-I", path)],
             "-c", path, "-o", obj], log=build / f"compile-{i}.log")
        objects.append(obj)
    elf = build / "eboot.elf"
    # native/ps4/clock_compat.c translates the clock numbers on their way to libkernel; with curl, random_compat.c
    # answers OpenSSL's kern.arandom sysctl.
    network_link = (["-lSceHttp", "-lSceSsl", "-lSceSysmodule"] if sce else
                    ["--wrap=sysctl", *(ports / "lib" / name for name in ("libcurl.a", "libssl.a", "libcrypto.a", "libz.a")),
                     "-lSceRandom"])
    run([llvm / "ld.lld", "-m", "elf_x86_64", "-pie", "--script", tc / "link.x", "--eh-frame-hdr", "-L", tc / "lib",
         "--wrap=clock_gettime", "--wrap=pthread_condattr_setclock",
         *objects, engine / "liber-software.a", engine / "bridge/liber-bridge-quickjs.a",
         engine / "bridge/engine/libembedded-react.a", engine / "_deps/quickjs-build/libqjs.a",
         *network_link, "-lc", "-lkernel", "-lc++", "-lSceVideoOut", "-lScePad", "-lSceUserService", "-lSceSystemService",
         "-lSceNet", tc / "lib/crt1.o", "-o", elf], log=build / "link.log")
    # native/ps4/clock_compat.c turns libkernel's timeout (FreeBSD's ETIMEDOUT, 60) into the 110 the toolchain's libc++
    # was built to expect. A libc++ that expects 60 would make every timeout fatal through that shim instead.
    timed_wait = build / "timed-wait.dis"
    run([llvm / "llvm-objdump", "-d", "--no-show-raw-insn", "--disassemble-symbols=_ZNSt3__118condition_variable15__do_"
         "timed_waitERNS_11unique_lockINS_5mutexEEENS_6chrono10time_pointINS5_12system_clockENS5_8durationIxNS_5ratioIL"
         "l1ELl1000000000EEEEEEE", elf], log=timed_wait)
    if "__do_timed_wait" in timed_wait.read_text() and "$0x6e" not in timed_wait.read_text():
        raise RuntimeError("libc++'s timed wait no longer expects ETIMEDOUT 110: revisit native/ps4/clock_compat.c")
    if args.compile_only:
        print(f"PS4 ELF linked: {elf}; no package made")
        return

    stage = build / "pkg"
    shutil.rmtree(stage, ignore_errors=True)
    (stage / "sce_sys/about").mkdir(parents=True)
    (stage / "sce_module").mkdir()
    tools = tc / "bin/linux"
    run([tools / "create-fself", f"-in={elf}", f"-out={build / 'eboot.oelf'}", "--eboot", stage / "eboot.bin",
         "--paid", "0x3800000000000011"], log=build / "fself.log")
    # The toolchain's stand-in libc and Fios2 modules, which a homebrew package carries (OpenOrbis 0.5).
    samples = tc / "samples/hello_world"
    for name in ("libc.prx", "libSceFios2.prx"):
        shutil.copy2(samples / "sce_module" / name, stage / "sce_module" / name)
    shutil.copy2(samples / "sce_sys/about/right.sprx", stage / "sce_sys/about/right.sprx")
    icon = app_dir / "sce_sys/icon0.png"
    shutil.copy2(icon if icon.exists() else samples / "sce_sys/icon0.png", stage / "sce_sys/icon0.png")
    sfo = stage / "sce_sys/param.sfo"
    version = config["version"].split(".")
    app_ver = f"{int(version[0]):02d}.{int(version[1]) % 100:02d}"
    pkgtool = [tools / "PkgTool.Core"]
    # PkgTool.Core is .NET Core 3.1: no ICU, and OpenSSL 1.1 where the system has only 3 (OPENSSL11_DIR, or
    # libssl1.1 beside the toolchain).
    openssl11 = os.environ.get("OPENSSL11_DIR", str(tc.parent / "libssl1.1"))
    tool_env = dict(env, DOTNET_SYSTEM_GLOBALIZATION_INVARIANT="1",
                    LD_LIBRARY_PATH=":".join(filter(None, [openssl11, env.get("LD_LIBRARY_PATH")])))
    run([*pkgtool, "sfo_new", sfo], env=tool_env)
    for key, kind, size, value in (("APP_TYPE", "Integer", 4, "1"), ("APP_VER", "Utf8", 8, app_ver),
                                   ("ATTRIBUTE", "Integer", 4, "0"), ("CATEGORY", "Utf8", 4, "gd"),
                                   ("CONTENT_ID", "Utf8", 48, content), ("DOWNLOAD_DATA_SIZE", "Integer", 4, "0"),
                                   ("SYSTEM_VER", "Integer", 4, "0"), ("TITLE", "Utf8", 128, config["name"]),
                                   ("TITLE_ID", "Utf8", 12, title), ("VERSION", "Utf8", 8, app_ver)):
        run([*pkgtool, "sfo_setentry", sfo, key, "--type", kind, "--maxsize", str(size), "--value", value], env=tool_env)
    fonts = sorted((generated / "fonts").glob("*"))
    if fonts:
        (stage / "fonts").mkdir()
        for font in fonts: shutil.copy2(font, stage / "fonts" / font.name)
    if not sce: shutil.copy2(ps4_ports.ca_bundle(), stage / "cacert.pem")
    # A folder of many small files goes into app.pack instead (native/ps4/app_pack.hpp): the package gives every
    # file at least 64 KiB.
    resources = resource_files(app_dir, config)
    per_folder = Counter(str(Path(relative).parent) for relative in resources)
    packed = {Path(relative).as_posix(): path for relative, path in resources.items()
              if per_folder[str(Path(relative).parent)] > PACK_FOLDER_FILES}
    for relative, path in resources.items():
        if Path(relative).as_posix() in packed: continue
        (stage / relative).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, stage / relative)
    if packed:
        write_pack(stage / "app.pack", packed)
        (stage / "app.pack.id").write_text(digest(stage / "app.pack")[:16] + "\n")
    files = sorted(str(p.relative_to(stage)) for p in stage.rglob("*") if p.is_file())
    # PkgTool reads the files from beside the project file, so it goes in the package folder (after the list is made).
    write_gp4(stage / "pkg.gp4", content, files)
    out = ROOT / "dist/ps4"
    out.mkdir(parents=True, exist_ok=True)
    run([*pkgtool, "pkg_build", stage / "pkg.gp4", out], env=tool_env, cwd=stage, log=build / "pkg.log")
    print(f"PS4 package: {out / (content + '.pkg')}")


if __name__ == "__main__":
    main()
