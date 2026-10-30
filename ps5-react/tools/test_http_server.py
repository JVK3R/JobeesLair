# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
"""LocalServer's worker (native/shared/http_server.cpp) over real sockets on loopback: tools/tests/http_server_test.cpp
covers sign-in and its throttling, the API hand-off, limits, stalled clients, ports, stopping and event streams."""
import subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import ROOT  # noqa: E402

def main():
 with tempfile.TemporaryDirectory(prefix="ps5-react-http-") as tmp:
  binary=Path(tmp)/"http-server-test"
  # macOS keeps OpenSSL in Homebrew's keg; Linux has it on the default paths.
  ssl=[] if sys.platform!="darwin" else (lambda prefix:["-I",prefix+"/include","-L",prefix+"/lib"])(
   subprocess.check_output(["brew","--prefix","openssl@3"],text=True).strip())
  subprocess.run(["clang++","-std=c++20","-O2","-Wall","-Wextra","-Werror","-pthread","-I",str(ROOT/"native/shared"),*ssl,
   str(ROOT/"tools/tests/http_server_test.cpp"),str(ROOT/"native/shared/http_server.cpp"),"-lcrypto","-o",str(binary)],check=True)
  subprocess.run([str(binary)],check=True,timeout=300)

if __name__=="__main__": main()
