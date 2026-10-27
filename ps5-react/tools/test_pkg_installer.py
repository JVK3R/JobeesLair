# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
"""pkg-installer.elf (native/ps5/payloads/pkg_installer.c) on the desktop, with a stand-in install service: PS4 and
PS5 packages, files that only look like one, and paths it must not touch."""
import os,struct,subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import ROOT  # noqa: E402

CID="UP9000-PPSA99051_00-PS5LIBRARYHOMETE"

def cnt(cid):
 """A PS4 package's start: \\x7FCNT, and its content ID at 0x40."""
 head=bytearray(0x1000);head[0:4]=b"\x7fCNT";head[0x40:0x40+36]=cid.encode();return bytes(head)

def fih(cid,offset=0x2000):
 """A PS5 package: \\x7FFIH, the offset of the CNT header it carries at 0x58 (little-endian), that header there."""
 head=bytearray(offset);head[0:4]=b"\x7fFIH";head[6:8]=struct.pack("<H",3);head[0x58:0x60]=struct.pack("<Q",offset)
 return bytes(head)+cnt(cid)

def main():
 with tempfile.TemporaryDirectory(prefix="ps5-react-pkg-") as tmp:
  root=Path(tmp);binary=root/"pkg-installer"
  # Both compilers must take it; the binary that runs is the last.
  for compiler in ("gcc","clang"):
   subprocess.run([compiler,"-std=gnu11","-O2","-Wall","-Wextra","-Werror","-DPKG_INSTALLER_HOST_TEST",str(ROOT/"native/ps5/payloads/pkg_installer.c"),"-o",str(binary)],check=True)
  (root/"data/downloads").mkdir(parents=True)
  def run(path,data=None,**env):
   """The payload's lines for one request, and what the install service was handed (None: not called)."""
   if data is not None:(root/path.lstrip("/")).write_bytes(data)
   (root/"install.txt").unlink(missing_ok=True)
   done=subprocess.run([str(binary)],input=f"PKI1\n{path}\nTest App\n".encode(),capture_output=True,timeout=30,env={**os.environ,"PKG_TEST_ROOT":str(root),**env})
   handed=dict(line.split("=",1) for line in (root/"install.txt").read_text().splitlines()) if (root/"install.txt").exists() else None
   return done.stdout.decode().splitlines(),handed
  # A PS4 package: its content ID goes to the install service, and the install is followed until it plays.
  lines,handed=run("/data/downloads/ps4.pkg",cnt("EP0000-CUSA00000_00-PS4PACKAGE000000"))
  assert lines==["ready","started EP0000-CUSA00000_00-PS4PACKAGE000000","p 100 100 playable","ok"],lines
  assert handed=={"uri":"/user/data/downloads/ps4.pkg","content_id":"EP0000-CUSA00000_00-PS4PACKAGE000000","name":"Test App"},handed
  # A PS5 package: its ID comes from the CNT header inside it, and it goes in with none, as ezRemote's installer hands them.
  lines,handed=run("/data/downloads/ps5.pkg",fih(CID))
  assert lines==["ready",f"started {CID}","p 100 100 playable","ok"],lines
  assert handed=={"uri":"/user/data/downloads/ps5.pkg","content_id":"","name":"Test App"},handed
  # The ID the service reports is the one followed.
  lines,_=run("/data/downloads/ps5.pkg",PKG_TEST_CONTENT_ID="UP9000-PPSA99051_00-REPORTEDBYSONY00")
  assert lines[1]=="started UP9000-PPSA99051_00-REPORTEDBYSONY00",lines
  # Not packages: the 4-byte "soon", a web page, PS5 headers whose offset points past the file, into the header
  # itself, or at something that is not a CNT header.
  into=bytes(fih(CID)[:0x58])+struct.pack("<Q",0x10)+bytes(0x2000)
  for name,data in (("soon.pkg",b"soon"),("page.pkg",b"<!DOCTYPE html>"+b" "*200),("past.pkg",fih(CID)[:0x100]),
                    ("into.pkg",into),("nothing.pkg",fih(CID)[:0x2000]+bytes(0x1000))):
   lines,handed=run(f"/data/downloads/{name}",data)
   assert lines==["fail 00000000 The file is not a PS4 or PS5 package."],(name,lines)
   assert handed is None,name
  # Refused by the console: its code comes back with the reason.
  lines,_=run("/data/downloads/ps5.pkg",PKG_TEST_INSTALL="80B2116F")
  assert lines==["ready","fail 80b2116f The console refused the package."],lines
  # Only a .pkg or .fpkg named plainly under a drive's root.
  for path in ("/tmp/x.pkg","/data/../etc/x.pkg","/data/downloads/x.exe","/data//x.pkg"):
   lines,handed=run(path)
   assert lines==["fail 00000000 The package path is not allowed."] and handed is None,(path,lines)
  lines,_=run("/data/downloads/missing.pkg")
  assert lines==["fail 00000000 The package could not be opened."],lines
 print("PASS: PS4 and PS5 packages install with their content IDs; stand-ins, bad offsets and other paths are refused")

if __name__=="__main__":main()
