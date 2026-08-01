# Document layout → markdown

Read every page of this document and transcribe it as **markdown that preserves
layout**.

This is not the structured field extraction. It is the full reading an examiner
falls back on when a named field was missed or mis-read — headings, tables,
stamps, and printed text in reading order.

## Rules

- Keep the visual order: top to bottom, left to right within a region.
- Use markdown headings for document titles and section titles.
- Tables as GitHub-flavoured markdown tables when the grid is clear; otherwise
  keep rows as aligned lines.
- Copy values **exactly** as printed — do not normalise dates, amounts, or names.
- Note stamps, signatures, and handwritten marks in *italics* where they sit.
- Separate pages with a line `---` and a page marker like `<!-- page 3 -->`
  using the page numbers given with the images.
- If a region is illegible, write `[illegible]` rather than guessing.

## Output

Return **only** a JSON object with one string field:

```json
{ "markdown": "# …\n\n…" }
```

No commentary outside that object.
