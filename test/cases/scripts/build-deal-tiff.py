#!/usr/bin/env python3
"""
Build deal bundle fixtures: lc.txt + deal-NN.tiff + deal.manifest.yml

Merges per-case PDFs (default sequence) into one multi-page TIFF.
Optional merge order: test/archive/cases/<case-id>/deal-order.yml

Requires: pip install pypdfium2 pillow pyyaml

Usage:
  python test/cases/scripts/build-deal-tiff.py              # cases 01-03
  python test/cases/scripts/build-deal-tiff.py 01-widgets-singapore
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_CASES = ROOT.parent / "archive" / "cases"
DEFAULT_CASES = ["01-widgets-singapore", "02-apparel-acme", "03-painting-artfinder"]

MERGE_SEQUENCE = [
    "invoice.pdf",
    "bill-of-lading.pdf",
    "packing-list.pdf",
    "bill-of-exchange.pdf",
    "beneficiary-cert.pdf",
    "warranty-cert.pdf",
]

DOC_TYPE_BY_FILE = {
    "invoice.pdf": "INV",
    "bill-of-lading.pdf": "BOL",
    "packing-list.pdf": "PKL",
    "bill-of-exchange.pdf": "BOE",
    "beneficiary-cert.pdf": "BC",
    "warranty-cert.pdf": "WC",
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


def pdf_pages_to_images(pdf_path: Path, scale: float = 2.0):
    import pypdfium2 as pdfium
    from PIL import Image

    doc = pdfium.PdfDocument(str(pdf_path))
    images = []
    for i in range(len(doc)):
        page = doc[i]
        bitmap = page.render(scale=scale)
        pil = bitmap.to_pil()
        images.append(pil.convert("RGB"))
    return images


def resolve_pdf(case_dir: Path, pdf_name: str) -> Path:
    """Source PDFs live in the case dir or test/archive/cases/<case-id>/."""
    local = case_dir / pdf_name
    if local.exists():
        return local
    archived = ARCHIVE_CASES / case_dir.name / pdf_name
    if archived.exists():
        return archived
    raise FileNotFoundError(
        f"Missing {pdf_name} — expected {local} or {archived}"
    )


def load_merge_sequence(case_dir: Path) -> tuple[str, list[str]]:
    """deal_no + PDF merge order (archive deal-order.yml optional)."""
    deal_no = case_deal_no(case_dir.name)
    order_file = ARCHIVE_CASES / case_dir.name / "deal-order.yml"
    if order_file.exists():
        order = yaml.safe_load(order_file.read_text(encoding="utf-8")) or {}
        sequence = order.get("merge_sequence", MERGE_SEQUENCE)
        deal_no = str(order.get("deal_no", deal_no))
        return deal_no, sequence
    return deal_no, MERGE_SEQUENCE


def write_deal(case_dir: Path) -> None:
    case_id = case_dir.name
    deal_no, sequence = load_merge_sequence(case_dir)

    lc_path = case_dir / "lc.txt"
    if not lc_path.exists():
        archived_mt700 = ARCHIVE_CASES / case_dir.name / "mt700.txt"
        if archived_mt700.exists():
            lc_path.write_bytes(archived_mt700.read_bytes())
            print(f"  lc.txt ← archive/mt700.txt")
        else:
            raise FileNotFoundError(f"{case_dir}: need lc.txt (deal bundle LC source)")

    from PIL import Image

    all_pages: list[Image.Image] = []
    segments = []
    page = 1
    for pdf_name in sequence:
        pdf_path = resolve_pdf(case_dir, pdf_name)
        imgs = pdf_pages_to_images(pdf_path)
        page_nums = list(range(page, page + len(imgs)))
        all_pages.extend(imgs)
        page += len(imgs)
        doc_type = DOC_TYPE_BY_FILE.get(pdf_name, "UNKNOWN")
        segments.append({
            "doc_type": doc_type,
            "pages": InlineList(page_nums),
            "source": pdf_name,
            "desc": DOC_TYPE_DESC.get(doc_type),
        })
        print(f"  {pdf_name}: pages {page_nums} ({len(imgs)} page(s))")

    tiff_name = f"deal-{deal_no}.tiff"
    tiff_path = case_dir / tiff_name
    all_pages[0].save(
        tiff_path,
        save_all=True,
        append_images=all_pages[1:],
        compression="tiff_lzw",
    )
    print(f"  {tiff_name}: {len(all_pages)} pages total")

    manifest = {
        "deal_no": deal_no,
        "case_id": case_id,
        "tiff": tiff_name,
        "lc": "lc.txt",
        "total_pages": len(all_pages),
        "segments": segments,
    }
    manifest_path = case_dir / "deal.manifest.yml"
    manifest_path.write_text(yaml.dump(manifest, sort_keys=False, allow_unicode=True), encoding="utf-8")
    print(f"  deal.manifest.yml")


def main(argv: list[str]) -> int:
    cases = argv if argv else DEFAULT_CASES
    for case_id in cases:
        case_dir = ROOT / case_id
        if not case_dir.is_dir():
            print(f"skip {case_id}: not found", file=sys.stderr)
            continue
        print(f"→ {case_id}")
        write_deal(case_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
