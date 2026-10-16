# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
"""FileSystem.copyAsync's worker (native/shared/copies.cpp) on real files."""
import os,struct,subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import ROOT,dependency  # noqa: E402

MIB=1<<20
CHUNK=32*MIB

def payload(size,seed):
 block=bytes((seed*31+i*7)%251 for i in range(4096))
 return (block*(size//4096+1))[:size]

def receipt(path,size=None,inode=None):
 st=os.stat(path)
 data=struct.pack("<8s65s65s6xQQQ",b"PS5DONE1",b"a"*64,b"",size if size is not None else st.st_size,st.st_dev,inode if inode is not None else st.st_ino)
 assert len(data)==168
 Path(str(path)+".complete").write_bytes(data)

def main():
 quickjs=dependency("quickjsSource")
 with tempfile.TemporaryDirectory(prefix="ps5-react-copies-") as tmp:
  root=Path(tmp);binary=root/"copy-client"
  subprocess.run(["clang++","-std=c++20","-O2","-Wall","-Wextra","-Werror","-pthread","-I",str(ROOT/"native/shared"),"-I",str(quickjs),
   str(ROOT/"tools/tests/copy_client.cpp"),str(ROOT/"native/shared/copies.cpp"),str(ROOT/"native/shared/removals.cpp"),"-o",str(binary)],check=True)
  def copy(mode,source,target,*flags):
   out=subprocess.check_output([str(binary),mode,str(source),str(target),*flags],text=True,timeout=120).splitlines()
   state,error,written,verified,total,files,seen=(out[1].split("\t")+[""]*7)[:7]
   return int(out[0]),state,error,int(written),int(verified),int(total),int(files),seen
  usb=root/"usb";usb.mkdir()
  # A file: copied whole, read back, renamed into place; the partial name is gone.
  image=root/"Game.exfat";image.write_bytes(payload(70*MIB+123,1))
  queued,state,error,written,verified,total,files,_=copy("copy",image,usb/"Game.exfat")
  assert (state,error,written,verified,total,files)==("completed","",image.stat().st_size,image.stat().st_size,image.stat().st_size,1),(state,error)
  assert queued<50 and (usb/"Game.exfat").read_bytes()==image.read_bytes() and not (usb/"Game.exfat.partial").exists()
  # The destination must not exist; a source that does not, fails; the destination may not lie inside the source.
  assert copy("copy",image,usb/"Game.exfat")[1:3]==("failed","the destination already exists")
  assert copy("copy",root/"missing",usb/"x")[1:3]==("failed","read the source: No such file or directory")
  game=root/"PPSA01234";(game/"sce_sys").mkdir(parents=True)
  assert copy("copy",game,game/"inside")[1:3]==("failed","the destination is inside the source")
  # A tree: folders, files, an empty folder and a symbolic link (copied as a link, never followed).
  (game/"eboot.bin").write_bytes(payload(3*MIB,2));(game/"sce_sys/param.json").write_text('{"titleId":"PPSA01234"}')
  (game/"empty").mkdir();(game/"data").mkdir();(game/"data/big.bin").write_bytes(payload(40*MIB,3))
  (game/"link").symlink_to("eboot.bin")
  state,error,written,verified,total,files=copy("copy",game,usb/"PPSA01234")[1:7]
  assert (state,error,files,total)==("completed","",3,3*MIB+40*MIB+len('{"titleId":"PPSA01234"}')),(state,error,files,total)
  copied=usb/"PPSA01234"
  assert (copied/"data/big.bin").read_bytes()==(game/"data/big.bin").read_bytes() and (copied/"empty").is_dir()
  assert os.readlink(copied/"link")=="eboot.bin" and (copied/"sce_sys/param.json").read_text()=='{"titleId":"PPSA01234"}'
  assert oct((copied/"empty").stat().st_mode&0o777)=="0o777"
  # Cut off part-way (a torn tail past the last whole chunk): the resume keeps the whole chunk, copies on
  # from there, and reads the kept chunk back against the source.
  big=root/"Big.exfat";big.write_bytes(payload(100*MIB+7,4))
  partial=usb/"Big.exfat.partial";partial.write_bytes(big.read_bytes()[:CHUNK+5*MIB]+b"torn")
  state,error,written,verified,total=copy("copy",big,usb/"Big.exfat")[1:6]
  assert (state,error,verified,total)==("completed","",big.stat().st_size,big.stat().st_size),(state,error)
  assert (usb/"Big.exfat").read_bytes()==big.read_bytes() and not partial.exists()
  # A kept chunk that differs from its source fails the copy, is cut off, and the next run copies it again.
  (usb/"Big.exfat").unlink()
  bad=bytearray(big.read_bytes()[:2*CHUNK]);bad[CHUNK+9]^=0xff;partial.write_bytes(bytes(bad))
  state,error=copy("copy",big,usb/"Big.exfat")[1:3]
  assert (state,error)==("failed",f"the copy differs from its source at byte {CHUNK}"),(state,error)
  assert partial.stat().st_size==CHUNK and not (usb/"Big.exfat").exists()
  assert copy("copy",big,usb/"Big.exfat")[1]=="completed" and (usb/"Big.exfat").read_bytes()==big.read_bytes()
  # Without resume, whatever a previous copy left goes first.
  (usb/"Big.exfat").unlink();partial.write_bytes(b"x"*(CHUNK+1))
  assert copy("copy",big,usb/"Big.exfat","noresume")[1]=="completed" and (usb/"Big.exfat").read_bytes()==big.read_bytes()
  # A download receipt: copied when it names this very file; refused when it names another; noted when absent.
  (usb/"Game.exfat").unlink();receipt(image)
  assert copy("copy",image,usb/"Game.exfat","receipt")[1::6]==("completed","matched")
  (usb/"Game.exfat").unlink();receipt(image,inode=image.stat().st_ino+1)
  assert copy("copy",image,usb/"Game.exfat","receipt")[1:3]==("failed","the source does not match its download receipt")
  os.unlink(str(image)+".complete")
  result=copy("copy",image,usb/"Game.exfat","receipt");assert (result[1],result[7])==("completed","none"),result
  # A system error names what failed; the partial copy stays for a resume.
  locked=usb/"locked";locked.mkdir();os.chmod(locked,0o555)
  try:
   state,error=copy("copy",image,locked/"Game.exfat")[1:3]
   assert (state,error)==("failed","write the copy: Permission denied"),(state,error)
  finally:os.chmod(locked,0o755)
  # Cancelled or stopped while copying: cancelled, the destination absent, the partial copy kept; then resumed.
  huge=root/"Huge.exfat";huge.write_bytes(payload(400*MIB,5))
  for mode in ("cancel","stop"):
   target=usb/f"{mode}.exfat"
   state,error=copy(mode,huge,target)[1:3]
   assert state=="cancelled" and error=="copy: Operation canceled" and not target.exists(),(mode,state,error)
   assert Path(str(target)+".partial").exists()
   assert copy("copy",huge,target)[1]=="completed" and target.read_bytes()==huge.read_bytes()
  print("PASS: copies off the render thread; files, trees, links, resume from the last whole chunk, verification, receipts, system errors, cancel and stop")

if __name__=="__main__":main()
