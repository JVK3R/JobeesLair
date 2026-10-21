"""Draws Jobee'sLair's PS5 home-screen backgrounds and writes them as the console reads them.

    python3 packaging/brand/make_home_art.py          (from the repository root, with Pillow and numpy)

Hovering an app on the PS5 home screen shows sce_sys/pic0.dds behind it (pic1.dds is the splash); ProsperoStore and
PS5SX2 ship the same pair: a 3840x2160 BC7 texture in a DDS file with a DX10 header, one mip level. This writes
app/sce_sys/pic0.dds and pic1.dds, and 1920x1080 PNG copies (pic0.png, pic1.png) for everything that wants a PNG.

The pictures are drawn from the "JL" monogram in make_brand_art.py: a graphite night with a red ember glow, a lit
floor grid running to the horizon, light streaks, floating sparks, the mark and the wordmark. Nothing is a photo or
anyone else's art. BC7 is written by encode_bc7() below (mode 6: one subset, 7-bit endpoints with a p-bit, 4-bit
indices, a least-squares refit of the endpoints); Pillow cannot write BC7.
"""
import math
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_brand_art as brand  # noqa: E402

W, H = 3840, 2160
SEED = 20261020


def glow_layer(size, draw_fn, blur):
    layer = Image.new("L", size, 0)
    draw_fn(ImageDraw.Draw(layer))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def tint(mask, color, strength=1.0):
    a = np.asarray(mask, dtype=np.float32)[..., None] / 255.0 * strength
    return a * np.array(brand.rgb(color), dtype=np.float32)


def screen(base, add):
    """Adds light to a float RGB array (0-255) without clipping hard."""
    return 255.0 - (255.0 - base) * (255.0 - np.clip(add, 0, 255)) / 255.0


def scene(splash=False):
    rng = np.random.default_rng(SEED + (1 if splash else 0))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # Night: graphite toward the top left, deeper toward the bottom right, with a cool lift near the top.
    t = (xx / W * 0.55 + yy / H * 0.45)
    base = np.zeros((H, W, 3), np.float32)
    for c, (a, b, d) in enumerate(zip(brand.rgb("#18202f"), brand.rgb("#0a0e17"), brand.rgb("#04060b"))):
        base[..., c] = np.where(t < 0.5, a + (b - a) * (t / 0.5), b + (d - b) * ((t - 0.5) / 0.5))
    cx, cy = (W * 0.5, H * 0.46) if splash else (W * 0.73, H * 0.40)

    # Ember glow behind the mark: a wide deep red bloom and a tight hot core.
    wide = glow_layer((W, H), lambda d: d.ellipse((cx - 1100, cy - 800, cx + 1100, cy + 800), fill=170), 420)
    core = glow_layer((W, H), lambda d: d.ellipse((cx - 420, cy - 300, cx + 420, cy + 300), fill=150), 220)
    base = screen(base, tint(wide, "#4a0a12", 1.0) + tint(core, "#a3121c", 0.85))

    # The horizon: a thin hot line with a haze above and below it.
    hy = int(H * 0.70)
    haze = glow_layer((W, H), lambda d: d.rectangle((0, hy - 14, W, hy + 14), fill=255), 70)
    base = screen(base, tint(haze, "#6a0e18", 0.8))

    # Floor grid in perspective, lit red near the horizon and fading toward the viewer.
    vx = cx
    grid = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grid)
    for i in range(-40, 41):  # lines running to the vanishing point
        x_bottom = vx + i * 330
        gd.line((vx + i * 14, hy, x_bottom * 1.0 + (x_bottom - vx) * 1.2, H), fill=200, width=3)
    for k in range(1, 22):  # lines across, spaced wider toward the viewer
        y = hy + (H - hy) * (k / 21.0) ** 2.1
        gd.line((0, y, W, y), fill=int(120 + 90 * k / 21), width=max(2, int(2 + k * 0.22)))
    grid = grid.filter(ImageFilter.GaussianBlur(1.2))
    fade = np.clip((yy - hy) / (H - hy), 0, 1)
    near_glow = (1.0 - np.abs((xx - vx) / (W * 0.9))).clip(0.15, 1.0)
    floor_mask = (np.asarray(grid, np.float32) / 255.0) * (0.95 - 0.55 * fade) * near_glow * (yy > hy)
    base = screen(base, floor_mask[..., None] * np.array(brand.rgb("#ff2a34"), np.float32) * 0.55)
    # The floor's own dark under the grid, so the lines read against it.
    base *= np.where(yy > hy, 1.0 - 0.35 * fade, 1.0)[..., None]

    # Anamorphic streaks through the mark, and two soft beams from the upper left.
    streak = glow_layer((W, H), lambda d: d.rectangle((0, cy - 5, W, cy + 5), fill=255), 26)
    base = screen(base, tint(streak, "#7a1018", 0.55))
    beams = Image.new("L", (W, H), 0)
    bd = ImageDraw.Draw(beams)
    for x0, spread, level in ((-300, 520, 70), (500, 360, 45)):
        bd.polygon([(x0, -50), (x0 + spread, -50), (cx - 380, hy), (cx - 900, hy)], fill=level)
    beams = beams.filter(ImageFilter.GaussianBlur(120))
    base = screen(base, tint(beams, "#a3121c", 0.22))

    # Sparks drifting up out of the glow: small bright points and a few soft bokeh discs.
    sparks = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(sparks)
    for _ in range(420):
        x = rng.normal(cx, 900)
        y = rng.uniform(80, hy + 40)
        near = 1.0 - min(1.0, math.hypot(x - cx, (y - cy) * 1.3) / 1700)
        if rng.random() > 0.25 + 0.75 * near:
            continue
        r = rng.choice([2, 2, 3, 3, 4, 5])
        sd.ellipse((x - r, y - r, x + r, y + r), fill=int(rng.uniform(140, 255)))
    small = sparks.filter(ImageFilter.GaussianBlur(1.4))
    base = screen(base, tint(small, "#ff5a4a", 1.0) + tint(sparks.filter(ImageFilter.GaussianBlur(9)), "#ff2a34", 0.9))
    bokeh = Image.new("L", (W, H), 0)
    bk = ImageDraw.Draw(bokeh)
    for _ in range(26):
        x, y, r = rng.uniform(0, W), rng.uniform(100, hy), rng.uniform(26, 78)
        bk.ellipse((x - r, y - r, x + r, y + r), fill=int(rng.uniform(26, 60)))
    base = screen(base, tint(bokeh.filter(ImageFilter.GaussianBlur(7)), "#c8202a", 0.5))

    # The mark: lifted off the scene by a dark drop shadow, with its red halo, over a faint reflection in the floor.
    size = 560 if not splash else 600
    mk = brand.mark(size, glow=True)
    mx, my = int(cx - mk.width / 2), int(cy - mk.height / 2)
    canvas = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    solid = Image.new("RGBA", mk.size, (0, 0, 0, 255))
    shadow.paste(solid, (mx + 26, my + 40), mk.getchannel("A").point(lambda v: v if v > 200 else 0))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(34)).point(lambda v: int(v * 0.7)) if False else shadow.filter(ImageFilter.GaussianBlur(34)))
    ref = mk.transpose(Image.FLIP_TOP_BOTTOM)
    ref_a = ref.getchannel("A").point(lambda v: int(v * 0.16))
    ref.putalpha(ref_a)
    ref_fade = Image.new("L", ref.size, 0)
    fd = ImageDraw.Draw(ref_fade)
    for row in range(ref.height):
        fd.line((0, row, ref.width, row), fill=int(255 * max(0.0, 1.0 - row / (ref.height * 0.55))))
    ref.putalpha(ImageChops.multiply(ref.getchannel("A"), ref_fade))
    ref_y = hy + int((hy - (my + mk.height * 0.8)) * 0.0) + 10
    if ref_y + ref.height < H + 400:
        canvas.alpha_composite(ref.filter(ImageFilter.GaussianBlur(5)), (mx, ref_y), ) if ref_y + ref.height <= H else None
    canvas.alpha_composite(mk, (mx, my))

    # The wordmark.
    d = ImageDraw.Draw(canvas)
    name = ImageFont.truetype(str(brand.EXO2), 250 if not splash else 230)
    tag = ImageFont.truetype(str(brand.EXO2), 82)
    word = "Jobee'sLair"
    tw = d.textlength(word, font=name)
    tx = int(cx - tw / 2)
    ty = int(cy + mk.height * 0.5 + (30 if not splash else 60))
    glow = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(glow).text((tx, ty), word, font=name, fill=255)
    gl = np.asarray(glow.filter(ImageFilter.GaussianBlur(36)), np.float32) / 255.0
    arr = np.asarray(canvas.convert("RGB"), np.float32)
    arr = screen(arr, gl[..., None] * np.array(brand.rgb("#a3121c"), np.float32) * 0.9)
    canvas = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    d = ImageDraw.Draw(canvas)
    d.text((tx, ty), word, font=name, fill=brand.rgb(brand.FG))
    bar_y = ty + 300 if not splash else ty + 280
    d.rectangle((int(cx - 330), bar_y, int(cx + 330), bar_y + 8), fill=brand.rgb(brand.J_RED))
    if not splash:
        line = "GAMES  ·  HOMEBREW  ·  ONE LAIR"
        lw = d.textlength(line, font=tag)
        # letter-spaced tagline
        space = 14
        total = sum(d.textlength(ch, font=tag) + space for ch in line) - space
        x = cx - total / 2
        for ch in line:
            d.text((x, bar_y + 40), ch, font=tag, fill=brand.rgb(brand.MUTED))
            x += d.textlength(ch, font=tag) + space

    arr = np.asarray(canvas.convert("RGB"), np.float32)
    # Vignette, then dither noise so the dark gradients do not band after compression.
    v = ((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.66)) ** 2
    arr *= (1.0 - 0.42 * np.clip(v, 0, 1.4) ** 1.4)[..., None]
    arr += rng.normal(0, 1.1, size=(H, W, 1)).astype(np.float32)
    return Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), "RGB")


# ---- BC7, mode 6 ----------------------------------------------------------------------------------------------------

WEIGHTS = np.array([0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64], np.float32) / 64.0


def blocks_of(rgb):
    h, w, _ = rgb.shape
    b = rgb.reshape(h // 4, 4, w // 4, 4, 3).transpose(0, 2, 1, 3, 4).reshape(-1, 16, 3)
    return b.astype(np.float32)


def best_indices(px, e0, e1):
    """Index (0-15) of the nearest of the 16 colors between the endpoints, for every pixel of every block."""
    pal = e0[:, None, :] * (1 - WEIGHTS)[None, :, None] + e1[:, None, :] * WEIGHTS[None, :, None]  # n,16,3
    out = np.empty(px.shape[:2], np.uint8)
    for lo in range(0, len(px), 65536):
        sl = slice(lo, lo + 65536)
        d = ((px[sl, :, None, :] - pal[sl, None, :, :]) ** 2).sum(-1)  # n,16 pixels,16 palette
        out[sl] = d.argmin(-1)
    return out


def quantize(e):
    """Nearest 8-bit endpoint values a 7-bit field plus a p-bit can hold, choosing the p-bit that fits best.
    Returns (7-bit values n,3; p-bit n; reconstructed 8-bit values n,3)."""
    best = None
    for p in (0, 1):
        v7 = np.clip(np.rint((e - p) / 2.0), 0, 127)
        rec = v7 * 2 + p
        err = ((rec - e) ** 2).sum(-1)
        if best is None:
            best = (v7, np.full(len(e), p), rec, err)
        else:
            use = err < best[3]
            best = (np.where(use[:, None], v7, best[0]), np.where(use, p, best[1]), np.where(use[:, None], rec, best[2]),
                    np.minimum(err, best[3]))
    return best[0].astype(np.uint8), best[1].astype(np.uint8), best[2].astype(np.float32)


def encode_bc7(rgb):
    px = blocks_of(rgb)
    n = len(px)
    mean = px.mean(1, keepdims=True)
    cen = px - mean
    cov = np.einsum("nki,nkj->nij", cen, cen)
    # The principal axis: a few rounds of power iteration are plenty for 3x3.
    axis = np.tile(np.array([0.58, 0.58, 0.58], np.float32), (n, 1))
    for _ in range(6):
        axis = np.einsum("nij,nj->ni", cov, axis)
        axis /= np.linalg.norm(axis, axis=1, keepdims=True) + 1e-9
    proj = np.einsum("nki,ni->nk", cen, axis)
    e0 = mean[:, 0] + axis * proj.min(1, keepdims=True)
    e1 = mean[:, 0] + axis * proj.max(1, keepdims=True)
    for _ in range(3):  # quantise, index, then refit the endpoints to the indices by least squares
        q0, p0, r0 = quantize(np.clip(e0, 0, 255))
        q1, p1, r1 = quantize(np.clip(e1, 0, 255))
        idx = best_indices(px, r0, r1)
        w = WEIGHTS[idx]  # n,16
        a = ((1 - w) ** 2).sum(1)
        b = ((1 - w) * w).sum(1)
        c = (w ** 2).sum(1)
        det = a * c - b * b
        ok = np.abs(det) > 1e-6
        r_a = np.einsum("nk,nkc->nc", 1 - w, px)
        r_b = np.einsum("nk,nkc->nc", w, px)
        s0 = (c[:, None] * r_a - b[:, None] * r_b) / np.where(ok, det, 1)[:, None]
        s1 = (a[:, None] * r_b - b[:, None] * r_a) / np.where(ok, det, 1)[:, None]
        e0 = np.where(ok[:, None], s0, e0)
        e1 = np.where(ok[:, None], s1, e1)
    q0, p0, r0 = quantize(np.clip(e0, 0, 255))
    q1, p1, r1 = quantize(np.clip(e1, 0, 255))
    idx = best_indices(px, r0, r1)
    # The first pixel's index keeps its top bit clear; when it is 8 or more, swap the endpoints and mirror the indices.
    swap = idx[:, 0] >= 8
    q0, q1 = np.where(swap[:, None], q1, q0), np.where(swap[:, None], q0, q1)
    p0, p1 = np.where(swap, p1, p0), np.where(swap, p0, p1)
    idx = np.where(swap[:, None], 15 - idx, idx).astype(np.uint64)

    lo = np.zeros(n, np.uint64)
    hi = np.zeros(n, np.uint64)
    pos = 0

    def put(value, bits):
        nonlocal pos
        value = value.astype(np.uint64) if isinstance(value, np.ndarray) else np.uint64(value)
        if pos < 64:
            lo[:] |= value << np.uint64(pos)
            spill = pos + bits - 64
            if spill > 0:
                hi[:] |= value >> np.uint64(bits - spill)
        else:
            hi[:] |= value << np.uint64(pos - 64)
        pos += bits

    put(64, 7)  # mode 6: six zero bits then a one
    for c in range(3):
        put(q0[:, c], 7)
        put(q1[:, c], 7)
    put(np.full(n, 127, np.uint8), 7)  # alpha endpoints: 255 with the p-bits both set
    put(np.full(n, 127, np.uint8), 7)
    put(np.where(True, 1, 0) * np.ones(n, np.uint8), 1)
    put(np.ones(n, np.uint8), 1)
    for k in range(16):
        put(idx[:, k], 3 if k == 0 else 4)
    assert pos == 128, pos
    # Colour p-bits are what the alpha p-bits above stand for: mode 6 has one p-bit per endpoint, shared by all four
    # channels, so the colour endpoints must be reconstructed with p = 1.
    return lo, hi, (p0, p1)


def encode_forced(rgb):
    """Mode 6 needs one p-bit per endpoint for colour and alpha together. Alpha is always 255, which needs both p-bits
    set, so the colour endpoints are fitted with p = 1 (odd 8-bit values: 7 bits of precision per channel)."""
    global quantize
    saved = quantize

    def odd_only(e):
        v7 = np.clip(np.rint((e - 1) / 2.0), 0, 127)
        return v7.astype(np.uint8), np.ones(len(e), np.uint8), (v7 * 2 + 1).astype(np.float32)

    quantize = odd_only
    try:
        lo, hi, _ = encode_bc7(rgb)
    finally:
        quantize = saved
    return lo, hi


def dds_header(template):
    return template


HEADER = bytes.fromhex(
    "444453207c000000071" "00a0070080000000f000090" "7e0001000000010000000000000000000000000000000000000000000000"
    "0000000000000000000000000000000000000020000000040000004458313000000000000000000000000000000000000000000010"
    "00000000000000000000000000000000000000006200000003000000000000000100000001000000")


def write_dds(path, rgb):
    lo, hi = encode_forced(rgb)
    data = np.empty((len(lo), 2), "<u8")
    data[:, 0], data[:, 1] = lo, hi
    # The same 148 bytes PS5SX2 and ProsperoStore carry: DDS + DX10 header, BC7_UNORM, 3840x2160, one mip.
    header = bytearray(148)
    header[0:4] = b"DDS "
    struct.pack_into("<7I", header, 4, 124, 0x000A1007, H, W, W * H, 1, 1)
    struct.pack_into("<2I", header, 76, 32, 4)
    header[84:88] = b"DX10"
    struct.pack_into("<I", header, 108, 0x1000)
    struct.pack_into("<5I", header, 128, 98, 3, 0, 1, 1)
    Path(path).write_bytes(bytes(header) + data.tobytes())


def main():
    sce = brand.APP / "sce_sys"
    for name, splash in (("pic0", False), ("pic1", True)):
        image = scene(splash)
        arr = np.asarray(image)
        write_dds(sce / f"{name}.dds", arr)
        image.resize((1920, 1080), Image.LANCZOS).save(sce / f"{name}.png", optimize=True)
        print("wrote", f"app/sce_sys/{name}.dds", f"app/sce_sys/{name}.png")


if __name__ == "__main__":
    main()
