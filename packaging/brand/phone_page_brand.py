"""Puts the JL monogram (from make_brand_art.svg_mark, the one geometry) and Exo 2 into the phone page:

    python3 packaging/brand/phone_page_brand.py        (from the repository root, after make_fonts.py)

Rewrites the page's two logo SVGs (header and sign-in card) in app/companion/page.js and makes sure the
page embeds Exo 2 from app/companion/fonts.js. Safe to run again.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_brand_art import svg_mark  # noqa: E402

PAGE = Path(__file__).resolve().parents[2] / "app/companion/page.js"
text = PAGE.read_text(encoding="utf-8")
mark = svg_mark()
assert "`" not in mark and "${" not in mark

# The header's logo, then the sign-in card's: each is the first <svg> after its marker. The mark is 3:2.
for marker, height in (("<header>\n", 28), ('<form class="card panel" id="loginForm" autocomplete="off">\n', 60)):
    at = text.index(marker) + len(marker)
    end = text.index("</svg>", at) + len("</svg>")
    assert text[at:at + 4] == "<svg", text[at:at + 40]
    text = text[:at] + f'<svg class="emblem" width="{height * 3 // 2}" height="{height}" viewBox="0 0 96 64" aria-hidden="true">{mark}</svg>' + text[end:]

# Exo 2 rides in the page as data: the template holds placeholders, filled from fonts.js as the module loads.
if "import { EXO2_500, EXO2_700 } from './fonts.js';" not in text:
    text = text.replace("  var PAGE = String.raw`", "import { EXO2_500, EXO2_700 } from './fonts.js';\n\n  var PAGE = String.raw`", 1)
    text = re.sub(r"</html>`;\n", "</html>`.replace(\"__EXO2_500__\", EXO2_500).replace(\"__EXO2_700__\", EXO2_700);\n", text, count=1)
PAGE.write_text(text, encoding="utf-8")
print("phone page: emblem and Exo 2 in place")
