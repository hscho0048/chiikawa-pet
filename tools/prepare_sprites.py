"""Convert raw Chiikawa GIFs into trimmed, transparent animated WebP sprites.

Usage: python tools/prepare_sprites.py [--only 12,41] [--sheet out.png]

- Transparent sticker GIFs are cropped to the union bounding box of all frames.
- Opaque anime-clip GIFs get their background keyed out frame by frame:
  pixels close to the border colour that are connected to the frame edge are
  removed, holes inside the character are filled, and only the largest blob
  (the character) is kept.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "assets", "raw")
OUT = os.path.join(ROOT, "ui", "sprites")

# raw index -> sprite name, which behaviours may use it, keying tolerance (None = already transparent)
SPRITES = {
    61: ("walk_lollipop", ["walk"], None),
    52: ("run_torch", ["run"], None),
    47: ("spin", ["turn", "idle"], None),
    63: ("spin_peek", ["turn", "idle"], None),
    2: ("dance_heart", ["happy", "idle"], None),
    62: ("wiggle_doll", ["idle", "pet"], None),
    54: ("flowers", ["happy", "pet"], None),
    4: ("cheer", ["happy"], None),
    58: ("party", ["happy"], None),
    51: ("hat_toss", ["play"], None),
    49: ("sleepy", ["sleep"], None),
    56: ("squish", ["drag", "land"], None),
    1: ("blush_clover", ["idle", "pet"], None),
    41: ("walk_bounce", ["walk"], 38),
    24: ("bounce_head", ["idle", "happy"], 30),
    8: ("sit_wiggle", ["idle"], 40),
    30: ("eat_cookie", ["eat"], 30),
}

DARK = 140  # luminance below this counts as outline; background never passes through it


def frames_of(path):
    im = Image.open(path)
    frames, durations = [], []
    for i in range(getattr(im, "n_frames", 1)):
        im.seek(i)
        frames.append(np.array(im.convert("RGBA")))
        durations.append(max(20, im.info.get("duration", 100)))
    return frames, durations


def key_frame(rgba, tol):
    rgb = rgba[..., :3].astype(np.int32)
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[:, -1], rgb[-1][::-1], rgb[:, 0][::-1]])
    # backgrounds are rarely one flat colour (wall + floor), so use one reference per border segment
    refs = np.array([np.median(seg, axis=0) for seg in np.array_split(border, 24)])
    dist = np.sqrt(((rgb[:, :, None, :] - refs[None, None]) ** 2).sum(-1)).min(-1)
    lum = rgb @ np.array([299, 587, 114]) // 1000
    like_bg = (dist < tol) & (lum > DARK)
    # thicken the outline so the flood cannot leak into the body through tiny gaps
    barrier = ndimage.binary_dilation(lum <= DARK, iterations=3)
    labels, _ = ndimage.label(like_bg & ~barrier)
    edge_ids = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, edge_ids[edge_ids > 0])
    for _ in range(4):  # peel back the background ring hidden under the thickened barrier
        bg |= like_bg & ndimage.binary_dilation(bg)
    # close small gaps in the outline ring so the body interior counts as a hole to fill
    fg = ndimage.binary_fill_holes(ndimage.binary_closing(~bg, iterations=5))
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        keep = np.flatnonzero(sizes >= sizes.max() * 0.25) + 1
        fg = np.isin(lab, keep)
    fg = ndimage.binary_opening(fg, iterations=1)
    # soften the outermost ring so edges blend onto any wallpaper
    inner = ndimage.binary_erosion(fg)
    alpha = np.where(inner, 255, np.where(fg, 150, 0)).astype(np.uint8)
    out = rgba.copy()
    out[..., 3] = np.minimum(rgba[..., 3], alpha)
    return out


def process(idx, name, tol):
    raw = sorted(os.listdir(RAW))[idx - 1]
    frames, durations = frames_of(os.path.join(RAW, raw))
    if tol is not None:
        frames = [key_frame(f, tol) for f in frames]
    alpha = np.max([f[..., 3] for f in frames], axis=0)
    ys, xs = np.nonzero(alpha > 20)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    imgs = [Image.fromarray(f[y0:y1, x0:x1]) for f in frames]
    dst = os.path.join(OUT, name + ".webp")
    imgs[0].save(dst, save_all=True, append_images=imgs[1:], duration=durations,
                 loop=0, quality=88, method=5, minimize_size=False)
    return {"w": int(x1 - x0), "h": int(y1 - y0), "ms": int(sum(durations))}, imgs


def contact_sheet(rows, path):
    T, cols = 140, 5
    sheet = Image.new("RGB", (T * cols, T * len(rows)), (90, 160, 220))
    for r, imgs in enumerate(rows):
        for c in range(cols):
            fr = imgs[int(c * len(imgs) / cols)].copy()
            fr.thumbnail((T - 6, T - 6))
            sheet.paste(fr, (c * T + 3, r * T + 3), fr)
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--sheet")
    args = ap.parse_args()
    only = {int(x) for x in args.only.split(",")} if args.only else None
    os.makedirs(OUT, exist_ok=True)
    manifest, rows = {}, []
    for idx, (name, tags, tol) in SPRITES.items():
        if only and idx not in only:
            continue
        meta, imgs = process(idx, name, tol)
        manifest[name] = {**meta, "tags": tags}
        rows.append(imgs)
        print(f"{name:14s} {meta}", file=sys.stderr)
    if not only:
        with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fp:
            json.dump(manifest, fp, indent=1)
    if args.sheet:
        contact_sheet(rows, args.sheet)


if __name__ == "__main__":
    main()
