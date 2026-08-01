#!/usr/bin/env python3
"""
Rasterize a deal PDF into a multi-page, image-only TIFF fixture.

Every PDF page is sampled to a bitmap (no retained text layer). Optional blank
pages can be inserted so a single logical document spans multiple TIFF frames —
the shape scanned presentations often have.

Also rewrites deal-NN.pdf as the same image-only pages (UI/react-pdf), keeping
deal-NN.text.pdf as the original text source for idempotent re-runs.

Usage:
  python test/cases/scripts/sample-pdf-to-tiff.py 02-apparel-acme
  python test/cases/scripts/sample-pdf-to-tiff.py 02-apparel-acme --dpi 200
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]

# After each source PDF page index (0-based), insert this many blank frames.
# Case 02: INV / PKL / BC become multi-page (content + trailing blank).
BLANK_AFTER_PAGE: dict[str, dict[int, int]] = {
    "02-apparel-acme": {
        0: 1,  # INV → pages [1, 2]
        2: 1,  # PKL → pages [4, 5]
        4: 1,  # BC  → pages [7, 8]
    },
}

DOC_TYPE_DESC = {
    "INV": "Commercial Invoice",
    "BOL": "Bill of Lading",
    "PKL": "Packing List",
    "BOE": "Bill of Exchange",
    "BC": "Beneficiary Certificate",
    "WC": "Warranty Certificate",
}


class InlineList(list):
    """YAML flow-style list, e.g. pages: [1, 2]."""


def _inline_list_repr(dumper: yaml.Dumper, data: InlineList):
    return dumper.represent_sequence(
        "tag:yaml.org,2002:seq", data, flow_style=True
    )


yaml.add_representer(InlineList, _inline_list_repr)


def case_deal_no(case_id: str) -> str:
    m = re.match(r"(\d+)", case_id)
    return m.group(1) if m else case_id


def blank_page(size: tuple[int, int], mode: str = "RGB"):
    from PIL import Image

    return Image.new(mode, size, color=(255, 255, 255))


def render_pdf_pages(pdf_path: Path, dpi: int):
    """Return list of RGB PIL images — pure bitmaps, no text layer."""
    import pypdfium2 as pdfium

    scale = dpi / 72.0
    doc = pdfium.PdfDocument(str(pdf_path))
    images = []
    try:
        for i in range(len(doc)):
            page = doc[i]
            pil = page.render(scale=scale).to_pil()
            if pil.mode != "RGB":
                pil = pil.convert("RGB")
            images.append(pil)
            page.close()
    finally:
        doc.close()
    return images


def expand_with_blanks(source_images, blanks_after: dict[int, int]):
    """Insert white pages after selected source indices; track origin per frame."""
    frames = []
    origins = []  # (kind, source_index) — kind in {"content", "blank"}
    for i, img in enumerate(source_images):
        frames.append(img)
        origins.append(("content", i))
        for _ in range(blanks_after.get(i, 0)):
            frames.append(blank_page(img.size, img.mode))
            origins.append(("blank", i))
    return frames, origins


def base_segments_from_manifest(manifest: dict, n_source: int) -> list[dict]:
    """One segment per source page (doc order preserved; pages reset to 1..N)."""
    segs = list(manifest.get("segments") or [])
    if len(segs) != n_source:
        raise SystemExit(
            f"manifest has {len(segs)} segments but source PDF has {n_source} pages"
        )
    out = []
    for i, seg in enumerate(segs):
        out.append({
            "doc_type": seg["doc_type"],
            "pages": [i + 1],
            "source": seg.get("source"),
            "desc": seg.get("desc") or DOC_TYPE_DESC.get(seg["doc_type"]),
        })
    return out


def remap_segments(segments: list[dict], origins: list[tuple[str, int]]) -> list[dict]:
    """Map 1:1 source pages onto expanded TIFF frames (blanks stay with that doc)."""
    by_source: dict[int, list[int]] = {}
    for tiff_page, (_kind, src_i) in enumerate(origins, start=1):
        by_source.setdefault(src_i, []).append(tiff_page)

    remapped = []
    for seg in segments:
        new_pages: list[int] = []
        for p in seg.get("pages") or []:
            new_pages.extend(by_source.get(p - 1, []))
        remapped.append({
            "doc_type": seg["doc_type"],
            "pages": InlineList(new_pages),
            "source": seg.get("source"),
            "desc": seg.get("desc") or DOC_TYPE_DESC.get(seg["doc_type"]),
        })
    return remapped


def save_multipage_tiff(path: Path, frames, dpi: int) -> None:
    if not frames:
        raise ValueError("no frames to write")
    first, rest = frames[0], frames[1:]
    first.save(
        path,
        format="TIFF",
        save_all=True,
        append_images=rest,
        compression="jpeg",
        dpi=(dpi, dpi),
    )


def save_image_pdf(path: Path, frames, dpi: int) -> None:
    if not frames:
        raise ValueError("no frames to write")
    first, rest = frames[0], frames[1:]
    first.save(
        path,
        format="PDF",
        save_all=True,
        append_images=rest,
        resolution=float(dpi),
    )


def load_manifest(case_dir: Path) -> dict:
    path = case_dir / "deal.manifest.yml"
    if not path.exists():
        raise FileNotFoundError(path)
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def write_manifest(case_dir: Path, manifest: dict) -> None:
    path = case_dir / "deal.manifest.yml"
    path.write_text(
        yaml.dump(manifest, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def sample_case(case_id: str, dpi: int) -> None:
    case_dir = ROOT / case_id
    if not case_dir.is_dir():
        raise FileNotFoundError(case_dir)

    manifest = load_manifest(case_dir)
    deal_no = str(manifest.get("deal_no") or case_deal_no(case_id))
    pdf_name = manifest.get("pdf") or f"deal-{deal_no}.pdf"
    pdf_path = case_dir / pdf_name
    text_pdf_backup = case_dir / f"deal-{deal_no}.text.pdf"

    # Prefer original text PDF so re-runs stay idempotent.
    if text_pdf_backup.exists():
        source_pdf = text_pdf_backup
    elif pdf_path.exists():
        text_pdf_backup.write_bytes(pdf_path.read_bytes())
        source_pdf = text_pdf_backup
        print(f"  backed up text PDF → {text_pdf_backup.name}")
    else:
        raise FileNotFoundError(pdf_path)

    print(f"→ {case_id}")
    print(f"  source PDF: {source_pdf.name}")
    source_images = render_pdf_pages(source_pdf, dpi=dpi)
    print(f"  rendered {len(source_images)} image page(s) @ {dpi} dpi")

    base = base_segments_from_manifest(manifest, len(source_images))
    frames, origins = expand_with_blanks(source_images, BLANK_AFTER_PAGE.get(case_id, {}))
    n_blank = sum(1 for kind, _ in origins if kind == "blank")
    print(f"  inserted {n_blank} blank page(s) → {len(frames)} frame(s)")

    tiff_name = f"deal-{deal_no}.tiff"
    tiff_path = case_dir / tiff_name
    save_multipage_tiff(tiff_path, frames, dpi=dpi)
    print(f"  wrote {tiff_name} ({tiff_path.stat().st_size / (1024 * 1024):.2f} MiB)")

    save_image_pdf(pdf_path, frames, dpi=dpi)
    print(f"  rewrote {pdf_name} as image-only ({pdf_path.stat().st_size / (1024 * 1024):.2f} MiB)")

    segments = remap_segments(base, origins)
    for seg in segments:
        kinds = ["blank" if origins[p - 1][0] == "blank" else "image" for p in seg["pages"]]
        print(f"  {seg['doc_type']}: pages {list(seg['pages'])} ({'+'.join(kinds)})")

    write_manifest(case_dir, {
        "deal_no": deal_no,
        "case_id": case_id,
        "tiff": tiff_name,
        "pdf": pdf_name,
        "lc": manifest.get("lc") or "lc.txt",
        "total_pages": len(frames),
        "segments": segments,
        "notes": (
            "All pages are raster images (no text layer). "
            "Blank pages pad multi-page documents (INV/PKL/BC)."
        ),
    })
    print("  deal.manifest.yml updated")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "cases",
        nargs="*",
        default=["02-apparel-acme"],
        help="case directory name(s) under test/cases/",
    )
    parser.add_argument("--dpi", type=int, default=150, help="render DPI (default 150)")
    args = parser.parse_args(argv)
    for case_id in args.cases:
        sample_case(case_id, dpi=args.dpi)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
