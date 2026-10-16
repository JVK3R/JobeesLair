# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
"""updater.elf (native/ps5/payloads/updater.c) on the desktop, against a stand-in for ShadowMount+'s API."""
import http.server,json,os,socket,subprocess,sys,tempfile,threading,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import ROOT  # noqa: E402

TITLE="PPSA99058"

class ShadowMount:
 """POST /api/v1/images answers each image's `mounted` from `mounted(path)`; every route is recorded."""
 def __init__(self):
  # Compact or spaced JSON ("key": value): the updater must read both.
  self.routes=[];self.mounted=lambda path:False;self.compact=True;owner=self
  class Handler(http.server.BaseHTTPRequestHandler):
   def log_message(self,*_):pass
   def do_POST(self):
    body=self.rfile.read(int(self.headers.get("Content-Length","0")))
    route=self.path.removeprefix("/api/v1/");owner.routes.append((route,json.loads(body or b"{}")))
    if route=="images":
     # Paths escaped as some JSON writers do ("\/"), which the updater must read as written.
     items=[{"path":path,"mount_point":"/mnt/sandbox/x","mounted":owner.mounted(path)} for path in owner.images]
     reply=json.dumps({"status":0,"count":len(items),"images":items},separators=(",",":") if owner.compact else None).replace("/","\\/")
    else:reply=json.dumps({"status":0})
    data=reply.encode();self.send_response(200);self.send_header("Content-Type","application/json")
    self.send_header("Content-Length",str(len(data)));self.end_headers();self.wfile.write(data)
  self.server=http.server.ThreadingHTTPServer(("127.0.0.1",0),Handler);self.port=self.server.server_address[1];self.images=[]
  threading.Thread(target=self.server.serve_forever,daemon=True).start()
 def asked(self,route):return [body for name,body in self.routes if name==route]
 def stop(self):self.server.shutdown();self.server.server_close()

def free_port():
 with socket.socket() as probe:
  probe.bind(("127.0.0.1",0));return probe.getsockname()[1]

def wait_for(test,seconds=20):
 end=time.time()+seconds
 while time.time()<end:
  if test():return True
  time.sleep(0.02)
 return False

def main():
 with tempfile.TemporaryDirectory(prefix="ps5-react-updater-") as tmp:
  root=Path(tmp);binary=root/"updater"
  # Both compilers must take it; the binary that runs is the last, with any UPDATER_CFLAGS (a sanitizer, say).
  for compiler in ("gcc","clang"):
   subprocess.run([compiler,"-std=gnu11","-O2","-Wall","-Wextra","-Werror","-DUPDATER_HOST_TEST",*os.environ.get("UPDATER_CFLAGS","").split(),str(ROOT/"native/ps5/payloads/updater.c"),"-o",str(binary)],check=True)
  shadow=ShadowMount();lock=free_port()
  env={**os.environ,"UPDATER_TIME_SCALE":"50","UPDATER_SM_PORT":str(shadow.port),"UPDATER_LOCK_PORT":str(lock)}
  def scene(name,relaunch=True,size=None,old=b"old image",new=b"new image v2"):
   """A console: the installed image, a staged one beside it, the app running and asking for the update."""
   base=root/name;control=base/"JobeesLair/update";homebrew=base/"homebrew";staging=base/"JobeesLair/update_staging/0.2.1"
   for folder in (control,homebrew,staging):folder.mkdir(parents=True)
   target=homebrew/"JobeesLair.exfat";staged=staging/"JobeesLair.exfat.staged"
   target.write_bytes(old);staged.write_bytes(new);(control/"test-running").touch()
   (control/"apply.txt").write_text(f"UPD1\nversion=0.2.1-beta.1\ntarget={target}\nstaged={staged}\nsize={size or len(new)}\nrelaunch={int(relaunch)}\n")
   shadow.images=[str(target)];shadow.routes.clear()
   return control,target,staged
  def arm(control):
   process=subprocess.Popen([str(binary)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,env=env)
   process.stdin.write(f"UPD1\n{TITLE}\n{control}\n".encode());process.stdin.flush()
   return process,process.stdout.readline().decode()
  def outcome(control):
   path=control/"result.txt"
   return dict(line.split("=",1) for line in path.read_text().splitlines()) if path.exists() else {}
  def finished(process):
   process.wait(timeout=30);return process.returncode
  launches=lambda control:len((control/"test-launches").read_text().splitlines()) if (control/"test-launches").exists() else 0

  # The update, relaunched: the image is held a moment after the app closes, then swapped in; the new build
  # says it started, so the old image goes.
  control,target,staged=scene("applied")
  held=[3];shadow.mounted=lambda path:held.__setitem__(0,held[0]-1) or held[0]>0
  process,answer=arm(control)
  assert answer=="ready\n",answer
  # One waits at a time: a second answers "armed" and leaves it to the first.
  second,answer=arm(control)
  assert answer=="armed\n" and finished(second)==0,answer
  time.sleep(0.2)
  assert target.read_bytes()==b"old image" and staged.exists(),"nothing changes while the app runs"
  (control/"test-running").unlink()
  assert wait_for(lambda:outcome(control).get("outcome")=="swapped"),outcome(control)
  assert target.read_bytes()==b"new image v2" and not staged.exists() and Path(f"{target}.previous").read_bytes()==b"old image"
  assert not (control/"apply.txt").exists() and shadow.asked("scan")==[{}]
  assert wait_for(lambda:launches(control)==1)
  (control/"booted.txt").write_text("0.2.1-beta.1\n")
  assert finished(process)==0 and outcome(control)=={"outcome":"applied","version":"0.2.1-beta.1","reason":""},outcome(control)
  assert not Path(f"{target}.previous").exists() and shadow.asked("games/unmount")==[]

  # The new build closes before it says it started: the old one comes back, the new one goes back to
  # staging, and the app opens again (as the old version).
  control,target,staged=scene("crashed");shadow.mounted=lambda path:False;shadow.compact=False
  process,_=arm(control);(control/"test-running").unlink()
  assert wait_for(lambda:launches(control)==1)
  (control/"test-running").unlink()
  assert finished(process)==1 and outcome(control)["outcome"]=="rolledback",outcome(control)
  assert outcome(control)["reason"]=="the new version closed before it finished starting"
  assert target.read_bytes()==b"old image" and staged.read_bytes()==b"new image v2" and not Path(f"{target}.previous").exists()
  assert launches(control)==2 and len(shadow.asked("scan"))==2

  # Relaunched, the new build never opens: rolled back the same way.
  control,target,staged=scene("no-start");(control/"test-no-start").touch()
  process,_=arm(control);(control/"test-running").unlink()
  assert finished(process)==1 and outcome(control)["reason"]=="the new version did not open",outcome(control)
  assert target.read_bytes()==b"old image" and staged.read_bytes()==b"new image v2"

  # ShadowMount+ keeps the image mounted even after it is asked to unmount the title: nothing is touched,
  # and the old version opens again.
  control,target,staged=scene("persistent");shadow.mounted=lambda path:True
  process,_=arm(control);(control/"test-running").unlink()
  assert finished(process)==1 and outcome(control)["outcome"]=="refused",outcome(control)
  assert "keeps the image mounted" in outcome(control)["reason"] and shadow.asked("games/unmount")==[{"title_id":TITLE}]
  assert target.read_bytes()==b"old image" and staged.read_bytes()==b"new image v2" and launches(control)==1

  # A staged image that is not the size the app checked is refused.
  control,target,staged=scene("short",size=999);shadow.mounted=lambda path:False
  process,_=arm(control);(control/"test-running").unlink()
  assert finished(process)==1 and outcome(control)["reason"]=="the staged image is not the size that was checked"
  assert target.read_bytes()==b"old image"

  # Withdrawn while the app ran (apply.txt deleted): the updater leaves.
  control,target,staged=scene("withdrawn")
  process,_=arm(control);(control/"apply.txt").unlink()
  assert finished(process)==0 and not (control/"result.txt").exists() and target.read_bytes()==b"old image"

  # Not relaunched (installed when the app is next closed): swapped once it closes; the gamer opens it later
  # and it confirms.
  control,target,staged=scene("on-close",relaunch=False)
  process,_=arm(control);(control/"test-running").unlink()
  assert wait_for(lambda:outcome(control).get("outcome")=="swapped")
  time.sleep(0.3)
  assert launches(control)==0 and process.poll() is None,"it waits for the gamer to open it"
  (control/"test-running").touch();(control/"booted.txt").write_text("0.2.1-beta.1")
  assert finished(process)==0 and outcome(control)["outcome"]=="applied" and target.read_bytes()==b"new image v2"

  # ShadowMount+ not answering: the image cannot be checked, so nothing is touched.
  shadow.stop()
  control,target,staged=scene("no-shadowmount")
  process,_=arm(control);(control/"test-running").unlink()
  assert finished(process)==1 and outcome(control)["reason"]=="ShadowMount+ did not answer, so the image could not be checked"
  assert target.read_bytes()==b"old image" and staged.exists()
 print("PASS: updater payload; waits for the app to close, swap after release, scan, relaunch, boot confirmation, rollback, "
       "persistent mounts, size checks, withdrawal, install on close, one updater at a time")

if __name__=="__main__":
 main()
