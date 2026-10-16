"""Renders Jobee'sLair's raster and vector art from the "JL" monogram geometry in app/ui/JLMark.jsx.

    python3 packaging/brand/make_brand_art.py          (from the repository root, with Pillow)

Writes the home-screen art (app/sce_sys/icon0.png 512x512, pic0.png and pic1.png 1920x1080) and the logos
(.github/readme/logo.svg: the monogram alone on a transparent background; logo-dark.svg and logo-light.svg:
the monogram with the wordmark, for the README). The raster art is drawn 4x and scaled down, so edges are
antialiased without an SVG renderer.

The mark is two flat polygons with chamfered corners: a bright red J (#FF1E27) and a deep dark red L
(#800000), on nothing. The home-screen tiles need a background, so they sit it on graphite.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"
EXO2 = APP / "assets/Exo2.ttf"
SS = 4  # supersampling factor

# app/ui/colors.js
CANVAS, DEEP, SURFACE = "#05070d", "#0a0e17", "#0f1520"
FG, MUTED = "#f3f6fb", "#a6b1c4"
BACKDROP = [("#161d2b", 0.0), (DEEP, 0.55), (CANVAS, 1.0)]

# app/ui/JLMark.jsx: the two polygons in their 96x64 box (the same points as its path data)
BOX = (96, 64)
J_RED, L_RED = "#FF1E27", "#800000"
J_POINTS = [(20, 4), (40, 4), (40, 46), (30, 60), (6, 60), (6, 40), (18, 40), (18, 48), (28, 48), (28, 16), (14, 16), (14, 10)]
L_POINTS = [(52, 4), (64, 4), (64, 48), (92, 48), (84, 60), (52, 60)]


def path_data(points):
    return "M" + "L".join(f"{x:g} {y:g}" for x, y in points) + "Z"


def rgb(color):
    color = color.lstrip("#")
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


def rgba(color, alpha):
    return rgb(color) + (round(alpha * 255),)


def ramp(stops, t):
    t = min(max(t, 0.0), 1.0)
    for (c0, o0), (c1, o1) in zip(stops, stops[1:]):
        if t <= o1:
            f = 0.0 if o1 == o0 else (t - o0) / (o1 - o0)
            a, b = rgb(c0), rgb(c1)
            return tuple(round(a[i] + (b[i] - a[i]) * f) for i in range(3))
    return rgb(stops[-1][0])


def linear(size, stops, start, end):
    """A linear gradient over `size`, from `start` to `end` in pixels: computed on a small grid, then scaled."""
    w, h = size
    gw, gh = max(2, w // 8), max(2, h // 8)
    grid = Image.new("RGB", (gw, gh))
    (ax, ay), (bx, by) = start, end
    dx, dy = bx - ax, by - ay
    length = dx * dx + dy * dy or 1.0
    px = grid.load()
    for y in range(gh):
        for x in range(gw):
            X, Y = (x + 0.5) * w / gw, (y + 0.5) * h / gh
            px[x, y] = ramp(stops, ((X - ax) * dx + (Y - ay) * dy) / length)
    return grid.resize(size, Image.BICUBIC)


def backdrop(size):
    return linear(size, BACKDROP, (0, 0), size)


def mark(height, glow=False):
    """The monogram, RGBA on transparency, `height` pixels tall (drawn at SS times and reduced). With `glow`,
    a soft red halo spreads past its edges (the canvas is padded for it)."""
    width = round(height * BOX[0] / BOX[1])
    pad = round(height * 0.25) if glow else 0
    big_w, big_h = (width + 2 * pad) * SS, (height + 2 * pad) * SS
    k = height * SS / BOX[1]
    shift = pad * SS

    def scaled(points):
        return [(shift + k * x, shift + k * y) for x, y in points]

    out = Image.new("RGBA", (big_w, big_h), (0, 0, 0, 0))
    if glow:
        halo = Image.new("RGBA", (big_w, big_h), (0, 0, 0, 0))
        ImageDraw.Draw(halo).polygon(scaled(J_POINTS), fill=rgba(J_RED, 0.55))
        out = Image.alpha_composite(out, halo.filter(ImageFilter.GaussianBlur(height * SS * 0.08)))
    draw = ImageDraw.Draw(out)
    draw.polygon(scaled(J_POINTS), fill=rgb(J_RED))
    draw.polygon(scaled(L_POINTS), fill=rgb(L_RED))
    return out.resize((big_w // SS, big_h // SS), Image.LANCZOS)


def center(image, mark_image, offset=(0, 0)):
    x = (image.width - mark_image.width) // 2 + offset[0]
    y = (image.height - mark_image.height) // 2 + offset[1]
    image.paste(mark_image, (x, y), mark_image)


def lighten(base, size, center_xy, radius, color, strength):
    layer_ = Image.new("L", size, 0)
    cx, cy = center_xy
    ImageDraw.Draw(layer_).ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=strength)
    layer_ = layer_.filter(ImageFilter.GaussianBlur(radius / 2.2))
    tint = Image.new("RGB", size, rgb(color))
    return Image.composite(ImageChops.screen(base, tint), base, layer_)


def icon0():
    size = (512, 512)
    image = backdrop(size)
    image = lighten(image, size, (256, 256), 230, "#3a0d12", 70)
    center(image, mark(276, glow=True))
    image.save(APP / "sce_sys/icon0.png", optimize=True)


def pic0():
    size = (1920, 1080)
    image = backdrop(size)
    name, tagline = ImageFont.truetype(str(EXO2), 104), ImageFont.truetype(str(EXO2), 40)
    draw = ImageDraw.Draw(image)
    text_w = round(draw.textlength("Jobee'sLair", font=name))
    tag_w = round(draw.textlength("Open-source homebrew manager.", font=tagline))
    left = 1920 - 130 - max(text_w, tag_w)
    image = lighten(image, size, (left + text_w // 2, 430), 360, "#3a0d12", 70)
    m = mark(190, glow=True)
    image = image.convert("RGBA")
    image.paste(m, (left + (text_w - m.width) // 2, 250), m)
    draw = ImageDraw.Draw(image)
    draw.text((left - 4, 630), "Jobee'sLair", font=name, fill=rgb(FG))
    draw.rectangle((left, 778, left + 300, 781), fill=rgb(J_RED))
    draw.text((left + 2, 800), "Open-source homebrew manager.", font=tagline, fill=rgb(MUTED))
    image.convert("RGB").save(APP / "sce_sys/pic0.png", optimize=True)


def pic1():
    size = (1920, 1080)
    image = backdrop(size)
    image = lighten(image, size, (960, 540), 260, "#3a0d12", 60)
    image = image.convert("RGBA")
    center(image, mark(180, glow=True))
    image.convert("RGB").save(APP / "sce_sys/pic1.png", optimize=True)


def svg_mark():
    """The monogram's SVG markup (two paths in its 96x64 box); no background, no filter, no gradient."""
    return f'<path d="{path_data(J_POINTS)}" fill="{J_RED}"/><path d="{path_data(L_POINTS)}" fill="{L_RED}"/>'


def logos():
    w, h = BOX
    readme = ROOT / ".github/readme"
    (readme / "logo.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w * 4}" height="{h * 4}" viewBox="0 0 {w} {h}" role="img" aria-label="Jobee\'sLair JL monogram">\n'
        f"  {svg_mark()}\n</svg>\n", encoding="utf-8")

    def with_wordmark(text_color):
        return f"""<svg xmlns="http://www.w3.org/2000/svg" width="420" height="72" viewBox="0 0 420 72" role="img" aria-label="Jobee'sLair">
  <g transform="translate(0 4) scale(1)">{svg_mark()}</g>
  <text x="112" y="48" font-family="'Exo 2', Exo2, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="34" font-weight="600" letter-spacing="1.2" fill="{text_color}">Jobee'sLair</text>
</svg>
"""
    (readme / "logo-dark.svg").write_text(with_wordmark(FG), encoding="utf-8")
    (readme / "logo-light.svg").write_text(with_wordmark(SURFACE), encoding="utf-8")


if __name__ == "__main__":
    icon0()
    pic0()
    pic1()
    logos()
    for old in ("assets/ascii-gauge.png", "assets/ascii-bean.png"):
        if (APP / old).exists():
            (APP / old).unlink()
    for path in ("app/sce_sys/icon0.png", "app/sce_sys/pic0.png", "app/sce_sys/pic1.png",
                 ".github/readme/logo.svg", ".github/readme/logo-dark.svg", ".github/readme/logo-light.svg"):
        print("wrote", path)
