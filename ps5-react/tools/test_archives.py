"""Real local archive extraction with the same native worker used on PS5."""
from pathlib import Path
import binascii,hashlib,io,json,lzma,os,random,struct,subprocess,sys,tarfile,tempfile,time,zipfile
from rar_worker import build_host
ROOT=Path(__file__).resolve().parents[1]
DATA=bytes(range(256))*1024
TOO_BIG="This archive needs more memory to extract than the console app can use."
NO_LAST="Incomplete RAR archive or missing volume."
NO_FIRST="Missing first RAR volume."

def number7z(v):
 for n in range(8):
  if v<1<<(8*n+7-n):return bytes([(0xFF00>>n)&0xFF|v>>(8*n)])+(v&((1<<8*n)-1)).to_bytes(n,"little")
 return b"\xff"+v.to_bytes(8,"little")

def encode_7z_header(plain):
 """Rewrites a bsdtar 7z with the LZMA-compressed header 7-Zip writes by default."""
 offset,size=struct.unpack("<QQ",plain[12:28]);header=plain[32+offset:32+offset+size]
 packed=lzma.compress(header,format=lzma.FORMAT_RAW,filters=[{"id":lzma.FILTER_LZMA1,"dict_size":1<<16}])
 coder=b"\x23\x03\x01\x01"+number7z(5)+b"\x5d"+(1<<16).to_bytes(4,"little")
 encoded=(b"\x17\x06"+number7z(offset)+number7z(1)+b"\x09"+number7z(len(packed))+b"\x00"
  +b"\x07\x0b"+number7z(1)+b"\x00"+number7z(1)+coder+b"\x0c"+number7z(len(header))+b"\x00\x00")
 start=struct.pack("<QQI",offset+len(packed),len(encoded),binascii.crc32(encoded))
 return plain[:8]+struct.pack("<I",binascii.crc32(start))+start+plain[32:32+offset]+packed+encoded

def seven_dictionary(plain,bits):
 """A bsdtar LZMA2 7z whose coder declares dictionary property `bits` instead (30: 128 MiB), its CRCs redone."""
 offset,size=struct.unpack("<QQ",plain[12:28]);at=32+offset;header=bytearray(plain[at:at+size])
 header[header.index(b"\x21\x21\x01")+3]=bits
 start=struct.pack("<QQI",offset,size,binascii.crc32(header))
 return plain[:8]+struct.pack("<I",binascii.crc32(start))+start+plain[32:at]+bytes(header)

def vint(v):
 out=b""
 while v>=0x80:out+=bytes([v&0x7f|0x80]);v>>=7
 return out+bytes([v])

def rar5_block(header,data=b""):
 size=bytes([len(header)])
 return struct.pack("<I",binascii.crc32(size+header))+size+header+data

def rar5_with_window(*shifts):
 """A RAR5 archive whose files, in order, declare 128 KiB << shift dictionaries."""
 data=bytes(64)
 files=b"".join(rar5_block(bytes([2,2,len(data),0,len(data),0])+vint(3<<7|shift<<10)+bytes([0,1])+b"a",data) for shift in shifts)
 return b"Rar!\x1a\x07\x01\x00"+rar5_block(bytes([1,0,0]))+files+rar5_block(bytes([5,0,0]))

def plain_rar5(name,data,link=None):
 """An unencrypted RAR5 archive storing one file, or a symbolic link to `link`."""
 extra=b""
 if link is not None:
  record=vint(5)+vint(1)+vint(0)+vint(len(link))+link.encode();extra=vint(len(record))+record
 fields=vint(4)+vint(len(data))+vint(0)+struct.pack("<I",binascii.crc32(data))+vint(0)+vint(1)+vint(len(name.encode()))+name.encode()
 file=vint(2)+vint(3 if extra else 2)+(vint(len(extra)) if extra else b"")+vint(len(data))+fields+extra
 return b"Rar!\x1a\x07\x01\x00"+rar5_block(bytes([1,0,0]))+rar5_block(file,data)+rar5_block(bytes([5,0,0]))

def plain_rar4(name,data,end=True):
 """A RAR 1.5-4 archive storing one file, with or without the end block RAR 2.x and "-en" leave out."""
 def block(kind,flags,fields=b"",data=b""):
  body=bytes([kind])+struct.pack("<HH",flags,7+len(fields))+fields
  return struct.pack("<H",binascii.crc32(body)&0xffff)+body+data
 fields=struct.pack("<IIBIIBBHI",len(data),len(data),3,binascii.crc32(data),0,29,0x30,len(name),0o100644)+name.encode()
 return b"Rar!\x1a\x07\x00"+block(0x73,0,bytes(6))+block(0x74,0x8000,fields,data)+(block(0x7b,0x4000) if end else b"")

def encrypted_rar5(data,password="DLPSGAME.COM",name="nested/game.ffpfsc",headers=True,volumes=1,compression=0,crypto_flags=1,quick_open=False):
 """Independent RAR5 fixture with AES-CBC data/headers and spec password checks."""
 salt=bytes(range(16));power=15;iterations=1<<power
 key=hashlib.pbkdf2_hmac("sha256",password.encode(),salt,iterations)
 check=hashlib.pbkdf2_hmac("sha256",password.encode(),salt,iterations+32)
 folded=bytes(check[i]^check[i+8]^check[i+16]^check[i+24] for i in range(8))
 password_check=folded+hashlib.sha256(folded).digest()[:4]
 def aes(plain,iv):
  plain+=bytes((-len(plain))%16)
  return subprocess.check_output(["openssl","enc","-aes-256-cbc","-nopad","-K",key.hex(),"-iv",iv.hex()],input=plain)
 def block(body):
  size=vint(len(body));return struct.pack("<I",binascii.crc32(size+body))+size+body
 def framed(body):
  plain=block(body);iv=bytes(range(16,32))
  return iv+aes(plain,iv) if headers else plain
 out=[]
 # Like RAR, encrypt the file once and split the AES-CBC stream at unaligned volume offsets.
 iv=bytes(range(32,48));stream=aes(data or bytes(16),iv)
 cuts=[0]+[i*len(stream)//volumes+5 for i in range(1,volumes)]+[len(stream)]
 assert all(cut%16 for cut in cuts[1:-1])
 for i in range(volumes):
  packed=stream[cuts[i]:cuts[i+1]]
  encryption=vint(1)+vint(0)+vint(crypto_flags)+bytes([power])+salt+iv+password_check
  extra=vint(len(encryption))+encryption
  common=3|(8 if i else 0)|(16 if i+1<volumes else 0)
  body=vint(2)+vint(common)+vint(len(extra))+vint(len(packed))+vint(4)+vint(len(data))+vint(0)
  body+=struct.pack("<I",binascii.crc32(data))+vint(compression)+vint(0)+vint(len(name.encode()))+name.encode()+extra
  prefix=b"Rar!\x1a\x07\x01\x00"
  if headers:prefix+=block(vint(4)+vint(0)+vint(0)+vint(1)+bytes([power])+salt+password_check)
  main=vint(1)+vint(0)+(vint(3)+vint(i) if volumes>1 else vint(0))
  service=b""
  if quick_open and i+1==volumes:
   # A quick-open index can carry a valid check-field checksum for a different password.
   # It is optional cached metadata, not a file to extract or authenticate.
   other=hashlib.pbkdf2_hmac("sha256",b"index-password",salt,iterations+32)
   check=bytes(other[j]^other[j+8]^other[j+16]^other[j+24] for j in range(8))
   encryption=vint(1)+vint(0)+vint(1)+bytes([power])+salt+iv+check+hashlib.sha256(check).digest()[:4]
   extra=vint(len(encryption))+encryption
   index=aes(bytes(2*128*1024+16),iv)
   header=vint(3)+vint(3)+vint(len(extra))+vint(len(index))+vint(0)+vint(len(index))+vint(0)
   header+=vint(0)+vint(0)+vint(2)+b"QO"+extra
   service=framed(header)+index
  # A volume may end with filler after its end header; UnRAR opens the next volume regardless.
  filler=bytes(56) if i+1<volumes else b""
  out.append(prefix+framed(main)+framed(body)+packed+service+framed(vint(5)+vint(0)+vint(int(i+1<volumes)))+filler)
 return out

def words():
 """The game.bin inside rar5_encrypted_volumes.part*.rar.uu."""
 r=random.Random(5)
 vocabulary=[bytes(r.choice(b"abcdefghijklmnopqrstuvwxyz") for _ in range(r.randint(2,9))) for _ in range(4000)]
 return b" ".join(r.choice(vocabulary) for _ in range(24000))

def uudecode(source,destination):
 lines=source.read_bytes().splitlines();at=next(i for i,line in enumerate(lines) if line.startswith(b"begin "))
 destination.write_bytes(b"".join(binascii.a2b_uu(line) for line in lines[at+1:] if line not in (b"end",b"`",b" ",b"")))
 return destination

def main():
 with tempfile.TemporaryDirectory(prefix="ps5-react-archives-") as tmp:
  root=Path(tmp);binary=root/"archive-client"
  # Homebrew's keg-only formulae on macOS; the system's own libraries on Linux.
  brew=lambda formula:subprocess.check_output(["brew","--prefix",formula],text=True).strip() if sys.platform=="darwin" else "/usr"
  prefix=brew("libarchive");xz=brew("xz");crypto=brew("openssl@3")
  sources=[ROOT/"tools/tests/archive_client.cpp",ROOT/"native/shared/archives.cpp",ROOT/"native/shared/archive_preflight.cpp",ROOT/"native/shared/rar5_password.cpp",ROOT/"native/shared/archive_writer.cpp",ROOT/"native/desktop/rar_worker_process.cpp"]
  # RAR volumes go to rar-extract, as in the app; the other formats stay with libarchive.
  os.environ["PS5_REACT_RAR_WORKER"]=str(build_host(root/"rar-extract"))
  subprocess.run(["clang++","-std=c++20","-O2","-Wall","-Wextra","-Werror","-pthread","-I",str(ROOT/"native/shared"),"-I",prefix+"/include","-I",xz+"/include","-I",crypto+"/include",*map(str,sources),"-L",prefix+"/lib","-L",xz+"/lib","-L",crypto+"/lib","-larchive","-llzma","-lcrypto","-lz","-o",str(binary)],check=True)
  def run(name,parts,limit=1024*1024,password=None):
   args=[] if password is None else ["--password",password]
   out=subprocess.check_output([str(binary),str(root/name),str(limit),*map(str,parts),*args],text=True,timeout=20).splitlines()
   return out
  zip=root/"fixture.zip"
  with zipfile.ZipFile(zip,"w",compression=zipfile.ZIP_DEFLATED) as z:z.writestr("nested/game.ffpfsc",DATA)
  assert run("zip",[zip])[0]=="completed"
  assert (root/"zip/game.ffpfsc").read_bytes()==DATA
  # The game runs as another user than the app: an extracted tree only its owner reads freezes the console
  # at launch. Every folder and file is open to everyone, the extraction root included.
  def open_to_all(tree):
   for p in [tree,*tree.rglob("*")]:
    if p.name.startswith(".ps5-react-"):continue
    mode=p.stat().st_mode&0o777
    assert mode==0o777,(p,oct(mode))  # 0.5.1: files too, so a game's eboot.bin can be executed
  app=root/"app.zip"
  with zipfile.ZipFile(app,"w") as z:z.writestr("PPSA01473-app/sce_sys/param.json","{}");z.writestr("PPSA01473-app/eboot.bin",DATA)
  assert run("zip-app",[app])[0]=="completed"
  open_to_all(root/"zip-app")
  # A heap without room for an in-process extraction fails it cleanly, with nothing written.
  os.environ["ARCHIVE_NO_MEMORY"]="1"
  try:out=run("zip-no-memory",[zip])
  finally:del os.environ["ARCHIVE_NO_MEMORY"]
  assert out[0]=="failed" and out[2]=="Not enough memory to extract.",out
  assert not (root/"zip-no-memory").exists() and not (root/"zip-no-memory.extracting").exists()
  # Real password-protected ZIP: correct password, incorrect/missing password, and ordered volumes.
  protected=root/"protected.zip";payload=root/"protected.bin";payload.write_bytes(DATA)
  subprocess.run(["/usr/bin/zip","-q","-P","DLPSGAME.COM",str(protected),payload.name],cwd=root,check=True)
  assert run("zip-password",[protected],password="DLPSGAME.COM")[0]=="completed"
  assert (root/"zip-password/protected.bin").read_bytes()==DATA
  for name,password in [("wrong-password","wrong"),("missing-password",None)]:
   assert run(name,[protected],password=password)[0]=="failed"
   assert protected.exists() and not (root/name).exists() and not (root/(name+".extracting")).exists()
  blob=protected.read_bytes();protected_parts=[]
  for i in range(3):
   volume=root/f"protected-part{i}";volume.write_bytes(blob[i*len(blob)//3:(i+1)*len(blob)//3]);protected_parts.append(volume)
  assert run("zip-password-volumes",protected_parts,password="DLPSGAME.COM")[0]=="completed"
  assert (root/"zip-password-volumes/protected.bin").read_bytes()==DATA
  for headers in [True,False]:
   name="rar5-encrypted-headers" if headers else "rar5-encrypted-data"
   rar=root/(name+".rar");rar.write_bytes(encrypted_rar5(DATA,headers=headers)[0])
   result=run(name,[rar],password="DLPSGAME.COM")
   assert result[0]=="completed",result
   assert (root/name/"game.ffpfsc").read_bytes()==DATA
   result=run(name+"-wrong",[rar],password="wrong")
   assert result[0]=="failed" and "password" in result[-1].lower(),result
   assert rar.exists() and not (root/(name+"-wrong")).exists()
  for headers in [True,False]:
   name="rar5-quick-open-headers" if headers else "rar5-quick-open-data"
   rar=root/(name+".rar");blob=encrypted_rar5(DATA,headers=headers,quick_open=True)[0];rar.write_bytes(blob)
   result=run(name,[rar],password="DLPSGAME.COM")
   assert result[0]=="completed",result
   assert (root/name/"game.ffpfsc").read_bytes()==DATA
   assert not any(p.name=="QO" for p in (root/name).rglob("*"))
   if headers:
    parts=[]
    for i in range(3):
     part=root/f"{name}-part-{i}";part.write_bytes(blob[i*len(blob)//3:(i+1)*len(blob)//3]);parts.append(part)
    result=run(name+"-volumes",parts,password="DLPSGAME.COM")
    assert result[0]=="completed",result
    assert (root/(name+"-volumes")/"game.ffpfsc").read_bytes()==DATA
   # The ignored service payload must still be complete; never accept a truncated input.
   truncated=root/(name+"-truncated.rar");truncated.write_bytes(blob[:-100])
   result=run(name+"-truncated",[truncated],password="DLPSGAME.COM")
   assert result[0]=="failed" and not (root/(name+"-truncated")).exists(),result
  # A real file called QO must retain password authentication.
  rar=root/"qo-file.rar";rar.write_bytes(encrypted_rar5(DATA,name="QO",password="other",headers=False)[0])
  assert run("qo-file",[rar],password="DLPSGAME.COM")[0]=="failed"
  rar_parts=[]
  for i,blob in enumerate(encrypted_rar5(DATA,volumes=2)):
   volume=root/f"encrypted-volume-{i}.rar";volume.write_bytes(blob);rar_parts.append(volume)
  result=run("rar5-password-volumes",rar_parts,password="DLPSGAME.COM")
  assert result[0]=="completed",result
  assert (root/"rar5-password-volumes/game.ffpfsc").read_bytes()==DATA
  # Real `rar a -ma5 -m3 -hp -v20k` output: compressed blocks and the one AES-CBC stream of the file
  # cross volumes at unaligned offsets.
  real=[uudecode(source,root/source.stem) for source in sorted((ROOT/"tools/tests/archives").glob("rar5_encrypted_volumes.part*.rar.uu"))]
  result=run("rar5-real-volumes",real,password="fixture-password")
  assert result[0]=="completed",result
  assert (root/"rar5-real-volumes/game.bin").read_bytes()==words()
  corrupt=root/"corrupt-encrypted.rar"
  damaged=bytearray(encrypted_rar5(DATA)[0]);damaged[-64]^=1
  corrupt.write_bytes(damaged)
  result=run("rar5-corrupt",[corrupt],password="DLPSGAME.COM")
  assert result[0]=="failed" and "checksum" in result[-1].lower(),result
  assert corrupt.exists() and not (root/"rar5-corrupt").exists()
  empty=root/"empty-encrypted.rar";empty.write_bytes(encrypted_rar5(b"",compression=4<<7|8<<10)[0])
  result=run("rar5-empty",[empty],password="DLPSGAME.COM");assert result[0]=="completed",result
  assert (root/"rar5-empty/game.ffpfsc").read_bytes()==b""
  for name,kwargs in [("rar5-encrypted-window",{"compression":3<<7|9<<10}),
                       ("rar5-encrypted-traversal",{"name":"../escape"}),
                       ("rar5-keyed-checksum",{"crypto_flags":3})]:
   rar=root/(name+".rar");rar.write_bytes(encrypted_rar5(DATA,**kwargs)[0])
   result=run(name,[rar],password="DLPSGAME.COM")
   assert result[0]=="failed",result
   assert not (root/name).exists() and rar.exists()
  # A non-ASCII name in a process left in the C locale, as on the console (the Teardown backport).
  named=root/"named.zip"
  with zipfile.ZipFile(named,"w") as z:z.writestr("PPSA15246 \u2013 USA/eboot.bin",DATA)
  out=subprocess.check_output([str(binary),str(root/"named"),str(1024*1024),str(named)],text=True,timeout=20,env={"LC_ALL":"C"}).splitlines()
  assert out[0]=="completed",out
  assert (root/"named/PPSA15246 \u2013 USA/eboot.bin").read_bytes()==DATA
  tar=root/"fixture.tar"
  with tarfile.open(tar,"w") as t:
   entry=tarfile.TarInfo("nested/file.bin");entry.size=len(DATA);t.addfile(entry,io.BytesIO(DATA))
  assert run("tar",[tar])[0]=="completed"
  # rar-extract: images published at the set root, unsafe names and links refused, a missing middle
  # volume named as such.
  p=root/"plain.rar";p.write_bytes(plain_rar5("nested/deeper/game.ffpfsc",DATA))
  assert run("rar-plain",[p])[0]=="completed"
  assert (root/"rar-plain/game.ffpfsc").read_bytes()==DATA
  # The phase goes from extracting to finishing once every entry is decoded, and a completed task ends in it:
  # through the write ring (files synced of the total), inline writes, rar-extract's "s" line, and an older
  # rar-extract without that line.
  def phases(name,parts,password=None,**env):
   done=subprocess.run([str(binary),str(root/name),str(1024*1024),*map(str,parts),*([] if password is None else ["--password",password])],capture_output=True,text=True,timeout=20,env={**os.environ,"ARCHIVE_PHASES":"1","ARCHIVE_TRACE":"1",**env})
   seen=[line[6:] for line in done.stderr.splitlines() if line.startswith("phase ")]
   assert done.stdout.splitlines()[0]=="completed" and seen[-1]=="finishing" and seen[0] in ("extracting","finishing"),(done.stdout,seen)
   return done.stderr
  several=root/"several.zip"
  with zipfile.ZipFile(several,"w") as z:
   for i in range(5):z.writestr(f"dir/file{i}.bin",DATA[i:i+100000])
  assert "synced 5/5" in phases("phase-ring",[several])
  assert "synced 0/0" in phases("phase-inline",[several],ARCHIVE_PIPELINE_BYTES="0")
  rar_phases=phases("phase-rar",[root/"plain.rar"])
  # rar-extract reads what the set unpacks to from its headers before extracting; a ZIP's central directory
  # and a 7z's header say it too, and the preflight reads them first.
  assert "rar worker finishing" in rar_phases and f"total {len(DATA)}" in rar_phases
  assert "total 500000" in phases("phase-total-zip",[several])
  assert "total 0" in phases("phase-total-tar",[tar])
  older=root/"older-worker";older.write_text(f"#!/bin/sh\n'{os.environ['PS5_REACT_RAR_WORKER']}' | grep --line-buffered -vx s\n");older.chmod(0o755)
  assert "rar worker finishing" not in phases("phase-older-rar",[root/"plain.rar"],PS5_REACT_RAR_WORKER=str(older))
  assert (root/"phase-older-rar/game.ffpfsc").read_bytes()==DATA
  for name,entry,link in [("rar-traversal","../escape",None),("rar-absolute","/escape",None),("rar-backslash","a\\..\\..\\escape",None),
                          ("rar-dotdot-inner","a/../../escape",None),("rar-reserved","x/.ps5-react-extraction",None),("rar-symlink","link","../escape")]:
   p=root/(name+".rar");p.write_bytes(plain_rar5(entry,DATA,link))
   result=run(name,[p])
   assert result[0]=="failed" and "unsafe" in result[-1],result
   assert not (root/name).exists() and not (root/(name+".extracting")).exists() and not (root/"escape").exists()
  real=sorted(root.glob("rar5_encrypted_volumes.part*.rar"))
  result=run("rar-missing-volume",[real[0],real[1],real[3]],password="fixture-password")
  assert result[0]=="failed" and "missing volume" in result[-1],result
  result=run("rar-no-password",real)
  assert result[0]=="failed" and "password" in result[-1],result
  # Headers encrypted, one file across four volumes: counted once, its whole size.
  assert f"total {len(words())}" in phases("rar-real-total",real,password="fixture-password")
  # A volume cut short is named, so the app downloads that one again.
  cut=[root/f"cut-{i}.rar" for i in range(len(real))]
  for i,copy in enumerate(cut):copy.write_bytes(real[i].read_bytes())
  cut[1].write_bytes(cut[1].read_bytes()[:-3000])
  result=run("rar-cut-volume",cut,password="fixture-password")
  assert result[0]=="failed" and result[-1].endswith("Volume 2 of 4 looks incomplete."),result
  assert "Volume 3 of 3 looks incomplete." in run("rar-missing-volume-named",[real[0],real[1],real[3]],password="fixture-password")[-1]
  # A volume that is a copy of an earlier one (a link captured for the wrong part) is named, so the app
  # downloads that one again (Jobee'sLair 0.5.0 Pre Release 3).
  result=run("rar-duplicate-volume",[real[0],real[1],real[1],real[3]],password="fixture-password")
  assert result[0]=="failed" and result[-1].endswith("Volume 3 of 4 is a copy of part 2."),result
  # A set without its last or first volume fails before anything is decoded, with exactly these reasons
  # (the app maps them): RAR5 and RAR4, headers encrypted or not, .partN.rar or .rar/.r00 volumes.
  def worker(parts,password=None):
   """rar-extract's own report lines, without progress and timings."""
   dest=Path(tempfile.mkdtemp(dir=root))
   request="RARX1\nwindow 33554432\nlimit 1048576\n"+("" if password is None else f"password {password.encode().hex()}\n")
   request+=f"dest {dest}\n"+"".join(f"source {p}\n" for p in parts)+"end\n"
   # Its input stays open: the worker reads a closed one as the engine gone.
   process=subprocess.Popen([os.environ["PS5_REACT_RAR_WORKER"]],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
   process.stdin.write(request);process.stdin.flush()
   out=process.stdout.read();process.stdin.close();process.wait(timeout=20)
   return [line for line in out.splitlines() if line[:2] not in ("p ","t ") and line!="k"]
  rar4=[uudecode(ROOT/f"tools/tests/archives/rar4_encrypted_volumes.{ext}.uu",root/f"rar4_encrypted_volumes.{ext}") for ext in ("rar","r00","r01","r02")]
  rar5_open=[]
  for i,blob in enumerate(encrypted_rar5(DATA,headers=False,volumes=4)):
   volume=root/f"rar5-open-headers.part{i+1}.rar";volume.write_bytes(blob);rar5_open.append(volume)
  sets=[("rar5-encrypted",real,"fixture-password",words()),("rar4-encrypted",rar4,"fixture-password",words()),
        ("rar5-open-headers",rar5_open,"DLPSGAME.COM",DATA)]
  sets.append(("rar4-open",[uudecode(source,root/source.stem) for source in sorted((ROOT/"tools/tests/archives").glob("test_rar_multivolume_single_file.part*.rar.uu"))],None,None))
  for name,parts,password,content in sets:
   result=run(name+"-complete",parts,password=password)
   assert result[0]=="completed",(name,result)
   if content is not None:assert next((root/(name+"-complete")).rglob("game.*")).read_bytes()==content
   assert worker(parts[:-1],password)==["ready","fail "+NO_LAST],(name,worker(parts[:-1],password))
   assert run(name+"-no-last",parts[:-1],password=password)[-1]==NO_LAST
   assert worker(parts[1:],password)==["ready","fail "+NO_FIRST],(name,worker(parts[1:],password))
   assert run(name+"-no-first",parts[1:],password=password)[-1]==NO_FIRST
   assert not (root/(name+"-no-last")).exists() and not (root/(name+"-no-first")).exists()
  # Headers it cannot read leave the reason to the extraction: a wrong or missing password stays one. RAR4
  # has no password check, so a wrong one reads as damaged headers, as before.
  for password in ["wrong",None]:
   for parts,rar5 in [(real[:-1],True),(rar4[:-1],False)]:
    result=run("rar-check-password",parts,password=password)
    expected="checksum" if password and not rar5 else "password"
    assert result[0]=="failed" and expected in result[-1].lower(),result
  # Single volumes: RAR4 with and without an end block, and one cut short.
  for name,blob in [("rar4-single",plain_rar4("game.bin",DATA)),("rar4-single-no-end",plain_rar4("game.bin",DATA,end=False))]:
   single=root/(name+".rar");single.write_bytes(blob)
   assert run(name,[single])[0]=="completed"
   assert (root/name/"game.bin").read_bytes()==DATA
  # A whole RAR5 volume without an end block was not the last one; an archive that is no volume set is.
  last=root/"rar5-open-no-end.rar";last.write_bytes(rar5_open[-1].read_bytes()[:-8])
  assert worker([*rar5_open[:-1],last],"DLPSGAME.COM")==["ready","fail "+NO_LAST]
  single=root/"rar5-single-no-end.rar";single.write_bytes(encrypted_rar5(DATA,headers=False)[0][:-8])
  assert run("rar5-single-no-end",[single],password="DLPSGAME.COM")[0]=="completed"
  assert (root/"rar5-single-no-end/game.ffpfsc").read_bytes()==DATA
  # A header damaged within the last volume is not a cut: the shorter volume 2 is still the one named.
  damaged=[root/f"rar5-junk-{i}.rar" for i in range(4)]
  for i,copy in enumerate(damaged):copy.write_bytes(rar5_open[i].read_bytes())
  last=damaged[3].read_bytes();damaged[3].write_bytes(last[:-8]+bytes(4)+bytes([3,9,0,0])+last[-8:])
  damaged[1].write_bytes(damaged[1].read_bytes()[:-3000])
  result=run("rar5-junk",damaged,password="DLPSGAME.COM")
  assert result[0]=="failed" and result[-1].endswith("Volume 2 of 4 looks incomplete."),result
  # A last volume cut short (a download stopped early) is not a missing one: it fails as before, named, so
  # the app downloads that volume again. Cut in its data, in a header, and in the end block.
  for name,parts,password in [("rar5-encrypted",real,"fixture-password"),("rar4-encrypted",rar4,"fixture-password"),("rar5-open-headers",rar5_open,"DLPSGAME.COM")]:
   for cut in (len(parts[-1].read_bytes())//2,40,3):
    copy=root/f"{name}-cut-{cut}";copy.write_bytes(parts[-1].read_bytes()[:-cut])
    result=run(f"{name}-cut-last-{cut}",[*parts[:-1],copy],password=password)
    # Losing only the end block may still leave every file whole, its checksum verified.
    named=result[0]=="failed" and result[-1].endswith(f"Volume {len(parts)} of {len(parts)} looks incomplete.")
    assert named or (result[0]=="completed" and cut<64),(name,cut,result)
  single=root/"rar4-single-cut.rar";single.write_bytes(plain_rar4("game.bin",DATA,end=False)[:-100])
  result=run("rar4-single-cut",[single]);assert result[0]=="failed" and result[-1]!=NO_LAST,result
  single=root/"rar5-single-cut.rar";single.write_bytes(encrypted_rar5(DATA)[0][:-100])
  result=run("rar5-single-cut",[single],password="DLPSGAME.COM");assert result[0]=="failed" and result[-1]!=NO_LAST,result
  # Real archive split byte stream: ordered volumes, no temporary joined copy.
  blob=tar.read_bytes();parts=[]
  for i in range(3):
   p=root/f"tar-part{i}";p.write_bytes(blob[i*len(blob)//3:(i+1)*len(blob)//3]);parts.append(p)
  assert run("split-tar",parts)[0]=="completed"
  assert (root/"split-tar/nested/file.bin").read_bytes()==DATA
  plain=root/"payload.bin";plain.write_bytes(DATA)
  seven=root/"fixture.7z"
  subprocess.run([prefix+"/bin/bsdtar","--format=7zip","-cf",str(seven),"-C",str(root),"payload.bin"],check=True)
  assert run("7zip",[seven])[0]=="completed"
  assert (root/"7zip/payload.bin").read_bytes()==DATA
  assert f"total {len(DATA)}" in phases("phase-total-7z",[seven])
  blob=seven.read_bytes();seven_parts=[]
  for i in range(3):
   p=root/f"seven-part{i}";p.write_bytes(blob[i*len(blob)//3:(i+1)*len(blob)//3]);seven_parts.append(p)
  result=run("split-7zip",seven_parts)
  assert result[0]=="completed",result
  assert (root/"split-7zip/payload.bin").read_bytes()==DATA
  # Decoder windows above the console budget are refused before libarchive allocates them.
  big=root/"big.7z"
  subprocess.run([prefix+"/bin/bsdtar","--format=7zip","--options=7zip:compression=lzma2,7zip:compression-level=9","-cf",str(big),"-C",str(root),"payload.bin"],check=True)
  # 7-Zip ultra's 64 MiB dictionary is the budget itself.
  assert run("big-7zip",[big])[0]=="completed"
  encoded=root/"encoded.7z";encoded.write_bytes(encode_7z_header(seven.read_bytes()))
  result=run("encoded-7zip",[encoded])
  assert result[0]=="completed",result
  assert (root/"encoded-7zip/payload.bin").read_bytes()==DATA
  encoded_big=root/"encoded-big.7z";encoded_big.write_bytes(encode_7z_header(big.read_bytes()))
  assert run("encoded-big-7zip",[encoded_big])[0]=="completed"
  huge=root/"huge.7z";huge.write_bytes(seven_dictionary(big.read_bytes(),30))
  assert run("huge-7zip",[huge])[1:]==["0",TOO_BIG]
  encoded_huge=root/"encoded-huge.7z";encoded_huge.write_bytes(encode_7z_header(huge.read_bytes()))
  assert run("encoded-huge-7zip",[encoded_huge])[1:]==["0",TOO_BIG]
  # The same refusal before a download, from the ranges a server would send: the start header, the directory,
  # and for a compressed directory its packed bytes.
  def ranges(path):
   return subprocess.check_output([str(binary),"ranges",str(path)],text=True,timeout=20).split("\n")[:4]
  for path,refusal,count in [(seven,"",2),(big,"",2),(encoded_big,"",3),(huge,TOO_BIG,2),(encoded_huge,TOO_BIG,3)]:
   assert ranges(path)==["7z",refusal,str(path.stat().st_size),str(count)],(path.name,ranges(path))
  assert ranges(zip)==["","","0","1"],ranges(zip)
  p=root/"preset9.tar.xz";p.write_bytes(lzma.compress(tar.read_bytes(),preset=9))
  assert run("xz9",[p])[0]=="completed"
  p=root/"huge.tar.xz"
  p.write_bytes(lzma.compress(tar.read_bytes(),format=lzma.FORMAT_XZ,filters=[{"id":lzma.FILTER_LZMA2,"dict_size":128<<20}]))
  assert run("xz-huge",[p])[1:]==["0",TOO_BIG]
  assert not (root/"xz-huge").exists() and not (root/"xz-huge.extracting").exists()
  p=root/"lzma.zip"
  with zipfile.ZipFile(p,"w",compression=zipfile.ZIP_LZMA) as z:z.writestr("file.bin",DATA)
  assert run("zip-lzma",[p])[0]=="completed"
  p=root/"window.rar";p.write_bytes(rar5_with_window(9))
  assert run("rar5-window",[p])[1:]==["0",TOO_BIG]
  # WinRAR 7's default 32 MB dictionary, which libarchive doubles to the 64 MiB budget.
  p=root/"small-window.rar";p.write_bytes(rar5_with_window(8))
  assert run("rar5-small-window",[p])[2]!=TOO_BIG
  # A sparse member arrives out of order, so its digest comes from reading the file back.
  sparse=root/"sparse.bin"
  with sparse.open("wb") as f:f.write(b"head"*1000);f.seek(8*1024*1024);f.write(b"tail"*1000)
  p=root/"sparse.tar";subprocess.run([prefix+"/bin/bsdtar","--read-sparse","-cf",str(p),"-C",str(root),"sparse.bin"],check=True)
  assert run("sparse",[p],16*1024*1024)[0]=="completed"
  assert (root/"sparse/.ps5-react-extraction").read_text().splitlines()[1]==hashlib.sha256(sparse.read_bytes()).hexdigest()+"|sparse.bin"
  assert run("missing-part",parts[:1])[0]=="failed"
  assert not (root/"missing-part").exists()
  rar_parts=[]
  for source in sorted((ROOT/"tools/tests/archives").glob("test_rar_multivolume_single_file.part*.rar.uu")):
   rar_parts.append(uudecode(source,root/source.stem))
  assert len(rar_parts)==3
  result=run("rar-multipart",rar_parts)
  assert result[0]=="completed",result
  assert any(p.is_file() and p.stat().st_size>0 for p in (root/"rar-multipart").rglob("*") if p.name!=".ps5-react-extraction")
  open_to_all(root/"rar-multipart")
  # A set extracted while it downloads: each later volume appears under its final name by a rename, over
  # the empty file that reserves the name on the console.
  def stream(name,blobs,gap,extra=()):
   names=[root/f"{name}-v{i}" for i in range(len(blobs))]
   names[0].write_bytes(blobs[0])
   process=subprocess.Popen([str(binary),str(root/name),str(1024*1024),*map(str,names),"--stream",*extra],stdout=subprocess.PIPE,text=True)
   for i,blob in enumerate(blobs[1:],1):
    if gap is None:break
    time.sleep(gap);partial=root/f"{name}-v{i}.part";partial.write_bytes(blob)
    names[i].touch();time.sleep(gap);os.rename(partial,names[i])
   return process.communicate(timeout=30)[0].splitlines(),names
  blobs=[p.read_bytes() for p in rar_parts]
  result,names=stream("rar-stream",blobs,0.6)
  assert result[0]=="completed",result
  tree=lambda d:{str(p.relative_to(d)):p.read_bytes() for p in d.rglob("*") if p.is_file() and not p.name.startswith(".ps5-react-")}
  assert tree(root/"rar-stream")==tree(root/"rar-multipart"),(sorted(tree(root/"rar-stream")),sorted(tree(root/"rar-multipart")))
  # Its receipt names every volume, as a run after the download writes it: a later run recovers it.
  assert run("rar-stream",names)[0]=="completed"
  started=time.monotonic();result,_=stream("rar-stream-cancel",blobs,None,["--cancel-after","700"])
  assert result[0]=="cancelled" and time.monotonic()-started<5,result
  assert not (root/"rar-stream-cancel").exists() and not (root/"rar-stream-cancel.extracting").exists()
  damaged=list(blobs);damaged[1]=damaged[1][:4000]+bytes(len(damaged[1])-4000)
  result,_=stream("rar-stream-damaged",damaged,0.3)
  assert result[0]=="failed",result
  assert not (root/"rar-stream-damaged").exists() and not (root/"rar-stream-damaged.extracting").exists()
  # Extracting while downloading: the first volume is checked at once, the last one as soon as it is there,
  # however far decoding is.
  waiting=[root/f"stream-no-last-v{i}" for i in range(4)];waiting[0].write_bytes(real[0].read_bytes())
  process=subprocess.Popen([str(binary),str(root/"stream-no-last"),str(1024*1024),*map(str,waiting),"--stream","--password","fixture-password"],stdout=subprocess.PIPE,text=True)
  time.sleep(1);partial=root/"stream-no-last.part";partial.write_bytes(real[2].read_bytes());os.rename(partial,waiting[3])
  started=time.monotonic();out=process.communicate(timeout=20)[0].splitlines()
  assert out[0]=="failed" and out[-1]==NO_LAST and time.monotonic()-started<3,out
  result,_=stream("stream-no-first",[p.read_bytes() for p in real[1:]],None,["--password","fixture-password"])
  assert result[0]=="failed" and result[-1]==NO_FIRST,result
  result,_=stream("zip-stream",[zip.read_bytes()],None)
  assert result[0]=="failed" and "RAR set" in result[-1],result
  # A worker that goes silent may still write into its staging: the next extraction stages beside it,
  # and a later launch removes what it left once the set is extracted.
  silent=root/"silent-worker";silent.write_text("#!/bin/sh\nexec sleep 60\n");silent.chmod(0o755)
  real=os.environ["PS5_REACT_RAR_WORKER"];os.environ["PS5_REACT_RAR_WORKER"]=str(silent)
  try:out=subprocess.check_output([str(binary),str(root/"rar-silent"),str(1024*1024),*map(str,rar_parts),"--cancel-after","100","--again",real],text=True,timeout=60).splitlines()
  finally:os.environ["PS5_REACT_RAR_WORKER"]=real
  assert out[0]=="cancelled" and out[3]=="completed",out
  assert (root/"rar-silent.extracting/.ps5-react-stage").exists() and not (root/"rar-silent.extracting-1").exists()
  assert tree(root/"rar-silent")==tree(root/"rar-multipart")
  assert run("rar-silent",rar_parts)[0]=="completed" and not (root/"rar-silent.extracting").exists()
  # A process interruption leaves owned staging; the next extraction restarts safely.
  st=zip.stat();identity=f"{zip}|{st.st_dev}|{st.st_ino}|{st.st_size}|{st.st_mtime_ns//10**9}|{st.st_mtime_ns%10**9}\n"
  staging=root/"interrupted.extracting";staging.mkdir();(staging/"unfinished").write_bytes(b"partial")
  (staging/".ps5-react-stage").write_text("P5ST001:"+hashlib.sha256(identity.encode()).hexdigest()+"\n")
  assert run("interrupted",[zip])[0]=="completed"
  assert (root/"interrupted/game.ffpfsc").read_bytes()==DATA
  # 0.5.1: the earlier run's staging is set aside (.discard) before it is cleared, and nothing of it stays.
  assert not (root/"interrupted.extracting").exists() and not (root/"interrupted.extracting.discard").exists()
  # A clear cut off (the app closed during it) leaves a .discard, never ownerless staging; the next run clears it.
  staging=root/"cutoff.extracting";staging.mkdir();(staging/"unfinished").write_bytes(b"partial")
  (staging/".ps5-react-stage").write_text("P5ST001:"+hashlib.sha256(identity.encode()).hexdigest()+"\n")
  left=root/"cutoff.extracting.discard";(left/"deep").mkdir(parents=True);(left/"deep/rest").write_bytes(b"x")
  assert run("cutoff",[zip])[0]=="completed"
  assert (root/"cutoff/game.ffpfsc").read_bytes()==DATA
  assert not left.exists() and not staging.exists()
  orphan=root/"orphan.extracting";orphan.mkdir();(orphan/"keep").write_bytes(b"unowned")
  assert run("orphan",[zip])[0]=="failed"
  assert (orphan/"keep").read_bytes()==b"unowned"
  # A crash before the ownership record leaves empty staging, which the next extraction takes over.
  (root/"abandoned.extracting").mkdir()
  assert run("abandoned",[zip])[0]=="completed"
  assert run("limit",[zip],100)[0]=="failed"
  assert not (root/"limit").exists()
  for name,path in [("traversal","../escape"),("absolute","/escape"),("drive","C:/escape")]:
   p=root/f"{name}.zip"
   with zipfile.ZipFile(p,"w") as z:z.writestr(path,b"bad")
   assert run(name,[p])[0]=="failed"
   assert not (root/name).exists()
  p=root/"symlink.tar"
  with tarfile.open(p,"w") as t:
   entry=tarfile.TarInfo("link");entry.type=tarfile.SYMTYPE;entry.linkname="../escape";t.addfile(entry)
  assert run("symlink",[p])[0]=="failed"
  assert not (root/"symlink").exists()
  assert run("zip",[zip])[0]=="completed" # Owned output is hash-verified on recovery.
  assert (root/"zip/game.ffpfsc").read_bytes()==DATA
  (root/"zip/game.ffpfsc").write_bytes(b"corrupt")
  assert run("zip",[zip])[0]=="failed"
  # Inspection names a file by its bytes and refuses a too-large window from a download's first bytes.
  def inspect(*paths,budget=None):
   args=[] if budget is None else ["--budget",str(budget)]
   return subprocess.check_output([str(binary),"inspect",*args,*map(str,paths)],text=True,timeout=20).split("\n")[:2]
  def partial(name,content,keep,hole=0):
   p=root/name;p.write_bytes(content[:keep]+bytes(hole));return p
  big_rar=rar5_with_window(9)
  assert inspect(partial("big.rar.part",big_rar,len(big_rar)-40,1<<20))==["rar",TOO_BIG]
  small_rar=rar5_with_window(8)
  assert inspect(partial("small.rar.part",small_rar,len(small_rar)-40,1<<20))==["rar",""]
  # The walk reads the first file header whatever its budget, and stops after it once the budget is spent;
  # within its budget it reaches a window declared thousands of files in.
  assert inspect(partial("big.rar.part",big_rar,len(big_rar)-40,1<<20),budget=0)==["rar",TOO_BIG]
  late=rar5_with_window(*[8]*5000,9);late_rar=partial("late.rar.part",late,len(late)-40,1<<20)
  assert inspect(late_rar,budget=0)==["rar",""]
  assert inspect(late_rar,budget=60000)==["rar",TOO_BIG]
  assert inspect(rar_parts[0])==["rar",""]
  assert inspect(partial("hole.part",big_rar,0,1<<20))==["",""]
  assert inspect(partial("zip.part",zip.read_bytes(),200))==["zip",""]
  assert inspect(partial("7z.part",seven.read_bytes(),40))==["7z",""]
  assert inspect(tar)==["tar",""]
  gz=root/"fixture.tar.gz";gz.write_bytes(__import__("gzip").compress(tar.read_bytes()))
  assert inspect(gz)==["tar.gz",""]
  assert inspect(partial("huge.tar.xz.part",(root/"huge.tar.xz").read_bytes(),4096))==["tar.xz",TOO_BIG]
  assert inspect(partial("game.pkg.part",b"\x7fCNT"+bytes(64),68))==["pkg",""]
  assert inspect(partial("game.exfat",b"\xeb\x76\x90EXFAT   "+bytes(500),512))==["exfat",""]
  ufs=bytearray(70000);ufs[65536+1372:65536+1376]=struct.pack("<I",0x19540119)
  assert inspect(partial("game.ffpkg",bytes(ufs),len(ufs)))==["ffpkg",""]
  assert inspect(partial("game.ffpfs",struct.pack("<QQ",1,0x20130315)+bytes(64),80))==["ffpfs",""]
  assert inspect(partial("game.ffpfsc",b"PFSC"+bytes(64),68))==["ffpfsc",""]
  print("PASS: header inspection of partial downloads; ZIP/TAR/7z/multivolume RAR, decoder memory refusal, interrupted staging, verified recovery, missing parts and unsafe archive rejection")
if __name__=="__main__":main()
