#!/usr/bin/env python3
"""
Generate the TB Helix AI icon set.

WHY A HELIX
-----------
A helix is two strands running in parallel, bound at intervals, that together
carry information neither strand holds on its own. That is exactly what this
product does, and it reads on two levels:

  · the documents — the *credit* and the *presentation* are the two strands, and
    the *checks* are the rungs binding them. An examination is only meaningful as
    the comparison between the two; neither read alone tells you anything.

  · the work — the *machine* and the *officer* are the two strands. The engine
    extracts and proposes, the human decides, and the record is valid precisely
    because the two are bound together at every stage.

So the mark is two strands crossing, with three rungs. Not decoration: the rungs
are the checks, and the crossing is the comparison.

DESIGN NOTES
------------
Drawn from one geometry so the SVG and the raster sizes cannot drift. Two cosine
strands in antiphase over a 32-unit grid: apart, crossing twice, apart again.

The strands are **depth-ordered**: x is the cosine, and the sine of the same angle
is treated as depth, so each strand is split into the half that passes in front
and the half that passes behind, drawn back-to-front. Without that you get two
crossing lines; with it you get a helix. It is the whole difference.

Rungs are dropped below 24px. At 16px — the size that actually decides whether a
favicon works — three extra strokes turn the mark into a smudge, and the crossing
already carries the meaning.

Ink background rather than transparent: a browser tab may be light or dark, and a
filled badge reads on both. Blue and green are the two brand solids, one per
strand, which is the point — they are peers.

Run:  python3 scripts/makeFavicon.py
"""

import math
import struct
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public"

GRID = 32           # design grid
CX = 16.0           # strand centre line
AMP = 7.0           # how far each strand swings from centre
TOP, BOT = 5.6, 26.4
RADIUS = 7.0        # background corner radius
STRAND_W = 3.6
RUNG_W = 1.7
SAMPLES = 96

INK = (27, 28, 30)          # --me-ink
BLUE = (4, 115, 234)        # --me-blue
GREEN = (56, 210, 0)        # --me-green
RUNG = (134, 135, 136)      # --me-grey-70


def strand(sign):
    """One strand, sampled top to bottom. `sign` flips it into antiphase."""
    pts = []
    for i in range(SAMPLES + 1):
        t = i / SAMPLES
        y = TOP + t * (BOT - TOP)
        x = CX + sign * AMP * math.cos(2 * math.pi * t)
        pts.append((x, y))
    return pts


def strand_segments(sign):
    """
    The strand split by depth into (in_front, points) runs.

    Depth is the sine of the same angle that gives x its cosine — the standard
    side-on projection of a helix. Drawing the behind-runs of both strands first
    and the in-front runs last is what makes it read as one twisting form rather
    than an X.
    """
    runs, cur, cur_front = [], [], None
    for i in range(SAMPLES + 1):
        t = i / SAMPLES
        y = TOP + t * (BOT - TOP)
        ang = 2 * math.pi * t
        x = CX + sign * AMP * math.cos(ang)
        front = (sign * math.sin(ang)) < 0
        if cur_front is None:
            cur_front = front
        if front != cur_front:
            cur.append((x, y))          # overlap by a point so runs meet
            runs.append((cur_front, cur))
            cur, cur_front = [(x, y)], front
        cur.append((x, y))
    if cur:
        runs.append((cur_front, cur))
    return runs


def rungs():
    """Where the strands are farthest apart — one rung per binding point."""
    out = []
    for t in (0.0, 0.5, 1.0):
        y = TOP + t * (BOT - TOP)
        dx = AMP * math.cos(2 * math.pi * t)
        out.append(((CX + dx, y), (CX - dx, y)))
    return out


# ---------------------------------------------------------------- SVG ---------

def write_svg(path):
    def poly(pts):
        return " ".join(f"{x:.2f},{y:.2f}" for x, y in pts)

    rung_lines = "\n".join(
        f'    <line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}" />'
        for a, b in rungs()
    )

    def runs_svg(want_front):
        out = []
        for sign, colour in ((1, BLUE), (-1, GREEN)):
            for front, pts in strand_segments(sign):
                if front is want_front:
                    out.append(
                        f'  <polyline points="{poly(pts)}" fill="none" stroke="rgb{colour}"'
                        f' stroke-width="{STRAND_W}" stroke-linecap="round"/>'
                    )
        return "\n".join(out)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {GRID} {GRID}" role="img" aria-label="Helix">
  <title>Helix</title>
  <rect width="{GRID}" height="{GRID}" rx="{RADIUS}" fill="rgb{INK}"/>
{runs_svg(False)}
  <g stroke="rgb{RUNG}" stroke-width="{RUNG_W}" stroke-linecap="round" opacity="0.6">
{rung_lines}
  </g>
{runs_svg(True)}
</svg>
"""
    path.write_text(svg, encoding="utf-8")
    return path


# ------------------------------------------------------------- raster --------

SS = 16  # supersample factor; downsampled for antialiasing


def render(size):
    s = size * SS
    k = s / GRID
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=RADIUS * k, fill=INK + (255,))

    w = max(1, int(STRAND_W * k))
    r = STRAND_W * k / 2

    def draw_runs(want_front):
        for sign, colour in ((1, BLUE), (-1, GREEN)):
            for front, pts in strand_segments(sign):
                if front is not want_front:
                    continue
                sc = [(x * k, y * k) for x, y in pts]
                d.line(sc, fill=colour + (255,), width=w, joint="curve")
                # Round the caps, which ImageDraw.line does not do itself.
                for x, y in (sc[0], sc[-1]):
                    d.ellipse([x - r, y - r, x + r, y + r], fill=colour + (255,))

    draw_runs(False)

    # Below this size the rungs stop being three strokes and become a smudge.
    if size >= 24:
        for a, b in rungs():
            d.line([a[0] * k, a[1] * k, b[0] * k, b[1] * k],
                   fill=RUNG + (150,), width=max(1, int(RUNG_W * k)), joint="curve")

    draw_runs(True)

    return img.resize((size, size), Image.LANCZOS)


def write_ico(path, sizes=(16, 32, 48)):
    """Hand-rolled ICO wrapping one PNG per size (PIL's writer drops the alpha
    edges we spent the supersampling on)."""
    pngs = []
    for size in sizes:
        buf = _png_bytes(render(size))
        pngs.append((size, buf))

    header = struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries, blobs = b"", b""
    for size, buf in pngs:
        entries += struct.pack(
            "<BBBBHHII", size if size < 256 else 0, size if size < 256 else 0,
            0, 0, 1, 32, len(buf), offset,
        )
        blobs += buf
        offset += len(buf)

    path.write_bytes(header + entries + blobs)
    return path


def _png_bytes(img):
    from io import BytesIO
    b = BytesIO()
    img.save(b, format="PNG", optimize=True)
    return b.getvalue()


def write_png(path, size):
    render(size).save(path, format="PNG", optimize=True)
    return path


# ------------------------------------------------- in-app mark (generated) ----

def write_component(path):
    """
    Emit the same mark as a React component for use inside the app.

    Generated rather than hand-drawn so the sidebar wordmark and the browser tab
    can never drift apart — there is one geometry, in this file.
    """
    def poly(pts):
        return " ".join(f"{x:.2f},{y:.2f}" for x, y in pts)

    def runs(want_front, indent):
        out = []
        for sign, name in ((1, "BLUE"), (-1, "GREEN")):
            for front, pts in strand_segments(sign):
                if front is want_front:
                    out.append(
                        f'{indent}<polyline points="{poly(pts)}" fill="none" stroke={{{name}}}'
                        f' strokeWidth={{STRAND_W}} strokeLinecap="round" />'
                    )
        return "\n".join(out)

    rung_lines = "\n".join(
        f'        <line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}" />'
        for a, b in rungs()
    )

    src = f"""// GENERATED by scripts/makeFavicon.py — do not edit by hand.
//
// The Helix mark: two strands, depth-ordered so they weave, bound by three rungs.
// A helix is two strands that together carry what neither holds alone — here the
// credit and the presentation, bound by the checks; and the machine and the
// officer, bound at every stage.
//
// Same geometry as the favicon, emitted from the same script so the tab and the
// sidebar can never disagree.
const BLUE = 'rgb{BLUE}'
const GREEN = 'rgb{GREEN}'
const RUNG = 'rgb{RUNG}'
const STRAND_W = {STRAND_W}

export default function HelixMark({{ size = 20, showRungs = true }}) {{
  return (
    <svg width={{size}} height={{size}} viewBox="0 0 {GRID} {GRID}" role="img" aria-label="Helix">
{runs(False, "      ")}
      {{showRungs ? (
        <g stroke={{RUNG}} strokeWidth={{{RUNG_W}}} strokeLinecap="round" opacity={{0.5}}>
{rung_lines}
        </g>
      ) : null}}
{runs(True, "      ")}
    </svg>
  )
}}
"""
    path.write_text(src, encoding="utf-8")
    return path


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    made = [
        write_svg(OUT / "favicon.svg"),
        write_ico(OUT / "favicon.ico"),
        write_png(OUT / "apple-touch-icon.png", 180),
        write_png(OUT / "icon-192.png", 192),
        write_png(OUT / "icon-512.png", 512),
        write_component(OUT.parent / "src" / "shared" / "ds" / "HelixMark.jsx"),
    ]
    for p in made:
        print(f"{p.relative_to(OUT.parent)}  {p.stat().st_size:,} bytes")
