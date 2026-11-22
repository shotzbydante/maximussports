#!/usr/bin/env python3
"""Builds the avatar layers from the canonical 2D mascots.

Run from the repo root:  python3 scripts/brand/build-avatar-layers.py

Reads   public/brand/mascots/{sport}-2d.webp
Writes  public/brand/avatar/, 480px tall, per sport:
  {sport}-m.webp      the mascot as drawn (M on the chest)
  {sport}-blank.webp  the same with the chest letter removed, for a number
  {sport}-mask.webp   alpha = how much each pixel is robot skin
  {sport}-shade.webp  black, alpha = how much darker than the lit skin tone
Prints the layout (chest box for the number, bust crop for small sizes);
paste it into src/brand/avatar.js when the art changes.

The avatar is drawn in the browser as: the mascot, a flat skin colour shown
through the mask, the shade layer on top, then the number. See
src/components/profile/MaximusAvatar.jsx.

Needs: pillow, numpy, scipy.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = 'public/brand/mascots'
OUT = 'public/brand/avatar'
OUT_H = 480
SPORTS = ['football', 'basketball', 'baseball', 'hockey', 'soccer']
V_REF = 0.90  # value of the lit skin tone

# Chest letter in source pixels (x0, y0, x1, y1). Found by looking for the
# largest letter-sized blob on the chest; baseball was set by eye because the
# pinstripes split the detected letter.
BOX = {"football": [195, 423, 266, 481], "basketball": [243, 437, 312, 498], "baseball": [280, 432, 352, 484], "hockey": [235, 418, 296, 464], "soccer": [190, 388, 246, 434]}


def hsv(im):
    r, g, b = [im[..., i] for i in range(3)]
    mx = im[..., :3].max(-1); mn = im[..., :3].min(-1); d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, (60 * (g - b) / d) % 360, np.where(mx == g, 120 + 60 * (b - r) / d, 240 + 60 * (r - g) / d))
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def ramp(x, a, b):
    return np.clip((x - a) / (b - a), 0, 1)


def skin_membership(im):
    """Robot skin is the bright, saturated blue. Navy cloth and outlines are darker; cyan glows are a different hue."""
    h, s, v = hsv(im)
    m = ramp(v, 0.56, 0.66) * ramp(s, 0.40, 0.55) * ramp(h, 197, 203) * (1 - ramp(h, 222, 230))
    return m * im[..., 3]

def erase_letter(im, box, navy_letter):
    x0, y0, x1, y1 = box
    pad = 6
    X0, Y0, X1, Y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    h, s, v = hsv(im)
    reg = np.zeros(im.shape[:2], bool); reg[Y0:Y1, X0:X1] = True
    if navy_letter:
        thick = ndi.binary_opening((v < 0.55) & reg, iterations=2)       # letter strokes, not pinstripes
        letter = ndi.binary_dilation(thick, iterations=3) & reg
    else:
        cloth_v = np.median(v[Y0:Y1, X0:X1][(s[Y0:Y1, X0:X1] > 0.5)])
        letter = ndi.binary_dilation((v > cloth_v + 0.12) & reg, iterations=2) & reg
    out = im.copy()
    top, bot = Y0 - 2, Y1 + 2
    for x in range(X0, X1):
        col = letter[:, x]
        if not col.any(): continue
        a, b = im[top, x, :3], im[bot, x, :3]
        for y in np.where(col)[0]:
            t = (y - top) / (bot - top)
            out[y, x, :3] = a * (1 - t) + b * t
    soft = ndi.gaussian_filter(letter.astype(float), 1.2)[..., None]
    blurred = np.stack([ndi.gaussian_filter(out[..., c], 1.0) for c in range(3)], -1)
    out[..., :3] = out[..., :3] * (1 - soft) + blurred * soft
    return out

def save(arr, path, lossless=False):
    Image.fromarray((np.clip(arr, 0, 1) * 255).round().astype('uint8'), 'RGBA').save(path, 'WEBP', quality=80, method=6, lossless=lossless)

def resize(arr):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).round().astype('uint8'), 'RGBA')
    w = round(im.width * OUT_H / im.height)
    return np.array(im.resize((w, OUT_H), Image.LANCZOS)).astype(float) / 255

def main():
    layout = {}
    for n in SPORTS:
        im = np.array(Image.open(f'{SRC}/{n}-2d.webp').convert('RGBA')).astype(float) / 255
        H, W = im.shape[:2]
        blank = erase_letter(im, BOX[n], navy_letter=(n == 'baseball'))
        m = skin_membership(im)
        _, _, v = hsv(im)
        shade = np.clip(1 - v / V_REF, 0, 1) * m
        z = np.zeros_like(m)
        save(resize(im), f'{OUT}/{n}-m.webp')
        save(resize(blank), f'{OUT}/{n}-blank.webp')
        save(resize(np.stack([z + 1, z + 1, z + 1, m], -1)), f'{OUT}/{n}-mask.webp')
        save(resize(np.stack([z, z, z, shade], -1)), f'{OUT}/{n}-shade.webp')

        x0, y0, x1, y1 = BOX[n]
        alpha = im[..., 3]
        rows = np.where(alpha.max(1) > 0.5)[0]
        top = rows[0]
        head = alpha[top:int(H * 0.45)]
        cx = (head.sum(0) * np.arange(W)).sum() / head.sum()
        bottom = y1 + 0.03 * H
        layout[n] = {
            'w': round(W * OUT_H / H), 'h': OUT_H,
            'chest': {'x': round((x0 + x1) / 2 / W, 4), 'y': round((y0 + y1) / 2 / H, 4), 'w': round((x1 - x0) / W, 4), 'h': round((y1 - y0) / H, 4)},
            # Head-and-shoulders square for small sizes, as fractions of the image height.
            'bust': {'cx': round(cx / H, 4), 'top': round(top / H, 4), 'side': round((bottom - top) / H, 4)},
            'ink': 'navy' if n == 'baseball' else 'white',
        }
    print(json.dumps(layout, indent=2))


if __name__ == '__main__':
    main()
