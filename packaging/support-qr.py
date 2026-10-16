"""Makes app/assets/support-qr.png, the QR code on Settings → About → Support development, and checks it.

The code is the project's Buy Me a Coffee page, black on white (the contrast every phone camera reads),
with the standard four-module quiet zone, at error correction M. It is made at exactly the size Settings
draws it (MODULE_PX screen pixels per module, 1080p render): every module edge lands on a pixel, which a
camera reads best, and the app bakes images as raw pixels, so a larger image would only cost memory and be
scaled down (blurring those edges) anyway. Run it again only when the address changes:

    pip install segno zxing-cpp pillow
    python3 packaging/support-qr.py

It decodes the image it wrote and fails unless it reads back as exactly that address.
"""
from pathlib import Path
import sys

import segno
from PIL import Image

URL = "https://buymeacoffee.com/jvk3r"
OUT = Path(__file__).resolve().parent.parent / "app" / "assets" / "support-qr.png"
# Settings → About draws the image at 222 x 222 (app/ui/Settings.jsx SupportPanel): 37 modules x 6.
MODULE_PX = 6


def main():
    code = segno.make_qr(URL, error="m", boost_error=False)
    modules = code.symbol_size(border=4)[0]
    scale = MODULE_PX
    OUT.parent.mkdir(parents=True, exist_ok=True)
    code.save(str(OUT), kind="png", scale=scale, border=4, dark="#000000", light="#ffffff")
    with Image.open(OUT) as image:
        print(f"{OUT.name}: version {code.version}, {modules} modules with the quiet zone, {image.size[0]} px")
        try:
            import zxingcpp
        except ImportError:
            print("zxing-cpp not installed: not read back", file=sys.stderr)
            return 1
        found = [result.text for result in zxingcpp.read_barcodes(image.convert("L"))]
    if found != [URL]:
        print(f"read back {found!r}, expected {URL!r}", file=sys.stderr)
        return 1
    print(f"read back: {URL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
