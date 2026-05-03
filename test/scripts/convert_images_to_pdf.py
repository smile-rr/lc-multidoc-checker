from PIL import Image
from pathlib import Path

# (src_rel, dst_case, dst_name)
CONVERSIONS = [
    # ── Case 01: Widgets, Singapore ──────────────────────────────────────────
    ("bill-of-lading/bill of lading-3.jpg",
        "01-widgets-singapore", "bill-of-lading.pdf"),
    ("beneficiary-certificate/1-benificiary certificate.pdf",
        "01-widgets-singapore", "beneficiary-cert.pdf"),
    ("warranty-certificate/3-shipping-container-warranty-certificate-used.jpg",
        "01-widgets-singapore", "warranty-cert.pdf"),
    ("packing-list/1-Mau-invoice-packing-list.jpg",
        "01-widgets-singapore", "packing-list.pdf"),

    # ── Case 02: Apparel, ACME ────────────────────────────────────────────────
    ("bill-of-lading/bill of lading-04.jpg",
        "02-apparel-acme", "bill-of-lading.pdf"),
    ("bill-of-exchange/bill-of-exchange-format-under-letter-of-credit-4.png",
        "02-apparel-acme", "bill-of-exchange.pdf"),
    ("beneficiary-certificate/2-bc.pdf",
        "02-apparel-acme", "beneficiary-cert.pdf"),
    ("warranty-certificate/5-small_212_Warranty_simple_brown_landscape_3aee88aa90.jpg",
        "02-apparel-acme", "warranty-cert.pdf"),
    ("packing-list/2-Mau-invoice-packing-list-2.jpg",
        "02-apparel-acme", "packing-list.pdf"),

    # ── Case 03: Painting, ArtFinder ─────────────────────────────────────────
    ("bill-of-lading/Ocean-bill-of-lading-5.png",
        "03-painting-artfinder", "bill-of-lading.pdf"),
    ("bill-of-exchange/bill-of-exchange-format-3.jpg",
        "03-painting-artfinder", "bill-of-exchange.pdf"),
    ("warranty-certificate/8-small_214_Warranty_simple_blue_landscape_977759407a.webp",
        "03-painting-artfinder", "warranty-cert.pdf"),
    ("packing-list/3-packig-list-sample-mbaknol.jpg.webp",
        "03-painting-artfinder", "packing-list.pdf"),

    # ── Case 04: Boots, Baton Rouge ──────────────────────────────────────────
    ("bill-of-lading/bol-basic-info-904x1.webp",
        "04-boots-baton-rouge", "bill-of-lading.pdf"),
    ("bill-of-exchange/bill-of-exchange-2.png",
        "04-boots-baton-rouge", "bill-of-exchange.pdf"),
    ("warranty-certificate/11-217_Warranty_professional_blue_landscape_4cb52aaab5.jpg",
        "04-boots-baton-rouge", "warranty-cert.pdf"),
    ("packing-list/4-packing-list.jpg",
        "04-boots-baton-rouge", "packing-list.pdf"),
]

BASE = Path(__file__).parent.parent  # test/

for src_rel, case, dst_name in CONVERSIONS:
    src = BASE / "archive" / src_rel
    dst = BASE / "cases" / case / dst_name
    dst.parent.mkdir(parents=True, exist_ok=True)

    if src.suffix.lower() == ".pdf":
        import shutil
        shutil.copy2(src, dst)
        print(f"  copy   {src.name}  →  {case}/{dst_name}")
    else:
        img = Image.open(src)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(dst, "PDF", resolution=150)
        print(f"  convert {src.name}  →  {case}/{dst_name}  ({src.suffix})")

print("\nDone.")
