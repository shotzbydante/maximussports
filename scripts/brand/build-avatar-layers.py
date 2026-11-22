#!/usr/bin/env python3
"""Builds the avatar layers from the canonical 2D mascots.

Run from the repo root:  python3 scripts/brand/build-avatar-layers.py

Reads   public/brand/mascots/{sport}-2d.webp
Writes  public/brand/avatar/, 480px tall, per sport:
  {sport}-m.webp      the mascot as drawn (M on the chest)
  {sport}-blank.webp  the same with the chest letter removed, for a number
  {sport}-mask.webp   alpha = how much each pixel is robot skin
  {sport}-shade.webp  black, alpha = how much darker than the lit skin tone
  {sport}-umask.webp  alpha = how much each pixel is uniform (the navy cloth)
  {sport}-ushade.webp black, alpha = how much darker than the lit cloth
Prints the layout (chest box for the number, bust crop for small sizes);
paste it into src/brand/avatar.js when the art changes.

The avatar is drawn in the browser as: the mascot, a flat skin colour shown
through the skin mask with its shade layer, a flat uniform colour shown
through the uniform mask with its shade layer, then the number. See
src/components/profile/MaximusAvatar.jsx.

Skin and uniform are both blue in the art, so brightness alone cannot tell a
cap highlight from a cheek. The black outlines can: they fence the drawing
into regions, and each region is one or the other. A region that is mostly
dark navy is uniform; one that is mostly bright blue is skin.

Needs: pillow, numpy, scipy.
"""
import json
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = 'public/brand/mascots'
OUT = 'public/brand/avatar'
OUT_H = 480
SPORTS = ['football', 'basketball', 'baseball', 'hockey', 'soccer']
V_REF = 0.90  # value of the lit skin tone
V_OUTLINE = 0.22  # outlines and the darkest folds stay as drawn

# Regions the brightness vote gets wrong, by a point inside them (source
# pixels). The hockey helmet's dome is navy with a large highlight.
FORCE_UNIFORM = {"hockey": [(214, 90)]}

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


def blue_regions(im):
    """Label the areas of blue that the outlines fence off, and say which are uniform."""
    h, s, v = hsv(im)
    region = (im[..., 3] > 0.5) & (v > V_OUTLINE) & (h > 197) & (h < 250) & (s > 0.4)
    lab, n = ndi.label(region)
    idx = np.arange(1, n + 1)
    cloth = ndi.sum((v < 0.52) & region, lab, idx)
    skin = ndi.sum((v > 0.60) & region, lab, idx)
    is_uniform = np.zeros(n + 1, bool)
    is_uniform[1:] = cloth > skin
    return lab, is_uniform


def memberships(im, sport):
    """(skin, uniform) alpha maps. Skin is the bright, saturated blue; cyan glows are a different hue."""
    h, s, v = hsv(im)
    a = im[..., 3]
    lab, is_uniform = blue_regions(im)
    for x, y in FORCE_UNIFORM.get(sport, []):
        assert lab[y, x] > 0, f'{sport}: no blue region at {(x, y)}'
        is_uniform[lab[y, x]] = True
    in_uniform = is_uniform[lab]
    in_skin = (lab > 0) & ~in_uniform

    skin = ramp(v, 0.56, 0.66) * ramp(s, 0.40, 0.55) * ramp(h, 197, 203) * (1 - ramp(h, 222, 230)) * a
    skin = skin * ~in_uniform

    # Soft edge: reach two pixels past the region into its anti-aliased rim,
    # never into a skin region.
    near = ndi.binary_dilation(in_uniform, iterations=2) & ~in_skin
    blue = ramp(h, 198, 206) * (1 - ramp(h, 242, 250)) * ramp(s, 0.40, 0.55)
    uniform = blue * ramp(v, V_OUTLINE - 0.02, V_OUTLINE + 0.08) * near * a
    return skin, uniform

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
        m, u = memberships(im, n)
        _, _, v = hsv(im)
        shade = np.clip(1 - v / V_REF, 0, 1) * m
        # The lit cloth tone: brighter than most of the cloth, below its highlights.
        u_ref = float(np.clip(np.percentile(v[u > 0.9], 80), 0.42, 0.56))
        ushade = np.clip(1 - v / u_ref, 0, 1) * u
        z = np.zeros_like(m)
        save(resize(im), f'{OUT}/{n}-m.webp')
        save(resize(blank), f'{OUT}/{n}-blank.webp')
        save(resize(np.stack([z + 1, z + 1, z + 1, m], -1)), f'{OUT}/{n}-mask.webp')
        save(resize(np.stack([z, z, z, shade], -1)), f'{OUT}/{n}-shade.webp')
        save(resize(np.stack([z + 1, z + 1, z + 1, u], -1)), f'{OUT}/{n}-umask.webp')
        save(resize(np.stack([z, z, z, ushade], -1)), f'{OUT}/{n}-ushade.webp')
        cloth = im[..., :3][u > 0.9]
        navy = np.median(cloth[hsv(im)[2][u > 0.9] > u_ref * 0.85], 0)
        print(f'# {n}: cloth reference value {u_ref:.2f}, lit navy #' + ''.join(f'{round(c * 255):02x}' for c in navy), file=sys.stderr)

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
