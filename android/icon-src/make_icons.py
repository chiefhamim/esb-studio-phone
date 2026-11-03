"""Builds Android launcher icon layers from the PROTECTED ESB avatar (public/brand/esb-avatar.png).
The artwork is only scaled (Lanczos) and placed; never redrawn or recoloured.
Run from repo root: python android/icon-src/make_icons.py"""
import os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
av = Image.open(os.path.join(ROOT, 'public', 'brand', 'esb-avatar.png')).convert('RGBA')
bbox = av.getbbox()  # trim transparent margin only
av = av.crop(bbox)
side = max(av.size)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(av, ((side - av.width) // 2, (side - av.height) // 2))
av = sq

def scaled(img, px):
    return img.resize((px, px), Image.LANCZOS)

def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)

# adaptive layers: 108dp canvas; the artwork fills 76dp (the visible window is ~72dp), so the launcher mask never shows a margin.
# The background layer is the artwork's own edge green (gradient), so even a sliver at a corner is green, never white.
for name, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    canvas = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    a = scaled(av, round(px * 76 / 108))
    canvas.paste(a, ((px - a.width) // 2, (px - a.height) // 2), a)
    save(canvas, f'{RES}/mipmap-{name}/ic_launcher_foreground.png')
# legacy (API < 26) square + round
for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    save(scaled(av, px), f'{RES}/mipmap-{name}/ic_launcher.png')
    from PIL import ImageDraw
    c = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    m = Image.new('L', (px * 4, px * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, px * 4 - 1, px * 4 - 1), fill=255)
    m = m.resize((px, px), Image.LANCZOS)
    bg = Image.new('RGBA', (px, px), (0x1E, 0x9A, 0x50, 255))
    c.paste(bg, (0, 0), m)
    a = scaled(av, round(px * 0.92))
    c.paste(a, ((px - a.width) // 2, (px - a.height) // 2), a)
    save(c, f'{RES}/mipmap-{name}/ic_launcher_round.png')
# themed (monochrome) layer: the white "ESB" letters of the avatar as an alpha mask
big = scaled(av, round(432 * 76 / 108))
px = big.load()
mono = Image.new('RGBA', big.size, (0, 0, 0, 0))
mp = mono.load()
for y in range(big.height):
    for x in range(big.width):
        r, g, b, a = px[x, y]
        if a > 0 and min(r, g, b) > 170:
            k = min(255, int((min(r, g, b) - 170) / 60 * 255)) * a // 255
            mp[x, y] = (0, 0, 0, k)
canvas = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
canvas.paste(mono, ((432 - mono.width) // 2, (432 - mono.height) // 2), mono)
save(canvas, f'{RES}/drawable-nodpi/ic_launcher_monochrome.png')
print('ok', bbox)
