#!/usr/bin/env python3
"""
Build deal bundle fixtures: lc.txt + deal-NN.pdf + deal.manifest.yml

Merges per-case PDFs (default sequence) into one multi-page PDF.
Optional merge order: test/archive/cases/<case-id>/deal-order.yml

Requires: pip install pypdf pyyaml

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


def pdf_page_count(pdf_path: Path) -> int:
    from pypdf import PdfReader
    return len(PdfReader(str(pdf_path)).pages)


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

    total_pages = 0
    segments = []
    page = 1

    # Build merged PDF (source-of-truth for UI display when present).
    from pypdf import PdfWriter
    writer = PdfWriter()

    for pdf_name in sequence:
        pdf_path = resolve_pdf(case_dir, pdf_name)

        # Append pages to the merged deal PDF.
        writer.append(str(pdf_path))

        n_pages = pdf_page_count(pdf_path)
        page_nums = list(range(page, page + n_pages))
        page += n_pages
        total_pages += n_pages
        doc_type = DOC_TYPE_BY_FILE.get(pdf_name, "UNKNOWN")
        segments.append({
            "doc_type": doc_type,
            "pages": InlineList(page_nums),
            "source": pdf_name,
            "desc": DOC_TYPE_DESC.get(doc_type),
        })
        print(f"  {pdf_name}: pages {page_nums} ({n_pages} page(s))")

    pdf_name = f"deal-{deal_no}.pdf"
    pdf_path = case_dir / pdf_name
    with pdf_path.open("wb") as f:
        writer.write(f)
    print(f"  {pdf_name}: {total_pages} pages total")

    manifest = {
        "deal_no": deal_no,
        "case_id": case_id,
        "pdf": pdf_name,
        "lc": "lc.txt",
        "total_pages": total_pages,
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
