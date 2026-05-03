from PIL import Image
from pathlib import Path

CONVERSIONS = [
    ("Bill of Lading/bill of lading-3.jpg",            "cases/01-widgets-singapore/bill-of-lading.pdf"),
    ("Packing List/6-2-detailed-Packing-List-1.jpg",  "cases/01-widgets-singapore/packing-list.pdf"),
    ("Bill of Exchange/9.-Detailed-International-Bill-of-Exchange-1.png",
                                                       "cases/01-widgets-singapore/bill-of-exchange.pdf"),
    ("warranty certificate/3-shipping-container-warranty-certificate-used.jpg",
                                                       "cases/01-widgets-singapore/warranty-cert.pdf"),
]

BASE = Path(__file__).parent.parent  # test/

for src_rel, dst_rel in CONVERSIONS:
    src = BASE / src_rel
    dst = BASE / dst_rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(src)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.save(dst, "PDF", resolution=150)
    print(f"  {src.name}  →  {dst.name}")

print("Done.")
