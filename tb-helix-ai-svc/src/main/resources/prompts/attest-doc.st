# What is on this {docType} that is not text

You have already been asked, separately, to read the words on this document. Do not do
that again. This pass is about the **marks**: signatures, seals and chops, stamps,
handwritten additions, corrections, ticked boxes, struck-through wording.

An examiner needs these because several UCP 600 requirements are about the page rather
than about anything printed on it, and a transcription cannot answer them.

## How to look

Look at the page as a page. Signatures sit at the foot or in a signature block; chops and
seals overlap printed text and are often red or purple; stamps sit wherever there was
room. Check the **reverse** of a page as well when one is present — endorsements live
there. Compare pre-printed wording against anything added on top of it: added wording is
the discrepancy, identical pre-printed wording usually is not.

## What counts as a signature

UCP 600 art. 3 is deliberately wide. **All** of these are signatures:

- handwriting, in ink
- a facsimile signature — a reproduced image of one, printed with the form
- a perforated signature
- a stamp bearing a name
- a symbol or chop
- any mechanical or electronic method of authentication

So a document carrying only a printed company chop **is signed**. Do not report it as
unsigned because nobody wrote on it.

## The distinction that matters most

"There is a signature and I cannot read whose it is" is **not** the same statement as
"this document is unsigned". Only the second is a discrepancy.

When a mark is present but illegible, report the mark with `legible: false` and
`readsAs: null`. Never omit a mark because you could not read it, and never guess a name
to fill the gap.

## Capacity

On a transport document, a signature alone does not satisfy UCP 600 art. 20(a)(i) — it
must also show **in what capacity** it was given, and for an agent, on whose behalf:

- `SIGNED: XYZ LINES, AS CARRIER` — capacity shown
- `SIGNED: ABC SHIPPING, AS AGENT FOR XYZ LINES, THE CARRIER` — capacity shown
- `SIGNED: ABC SHIPPING` — capacity **not** shown; record `capacity: null`

Record what is printed. Do not infer a capacity from a company's name or from a logo.

## Originals and copies

UCP 600 art. 17. A document is an original if it bears an apparently original signature,
mark, stamp or label of its issuer, or says it is one. Report what is actually on the page:
a stamped or printed `ORIGINAL`, `DUPLICATE`, `TRIPLICATE`, `COPY`, `NON-NEGOTIABLE`,
`CERTIFIED TRUE COPY`. Where the document states how many originals were issued — "3/3",
"full set of three originals" — report that too.

## Corrections

ISBP 821 §A. A correction, an overwrite or a struck-through value must appear
**authenticated** — initialled or stamped by whoever issued the document. Report the
correction as one mark and the initials that authenticate it as another, and set
`authenticates` on the second to say what it covers. A correction with nothing initialling
it is reported with no such mark, which is the finding.

## Clausing

UCP 600 art. 27. A clause **expressly declaring a defective condition** of the goods or
packaging makes a transport document unclean — "three cartons torn", "drums leaking". A
stamp or handwritten note is what to look for. Pre-printed exculpatory boilerplate
("said to contain", "shipper's load and count") is not adverse clausing; do not report it
as one.

## Ticked boxes and deletions

Where the form prints **alternatives** and one is selected — freight prepaid / freight
collect, on board / received for shipment — the words alone say nothing. Report which
one is marked, as a `tick`.

Report a `tick` **only** where the mark chooses between printed alternatives. A tick,
dash or check beside every item of a list is the form being completed, not a choice
being made; it tells an examiner nothing and there may be twenty of them. Do not report
those.

Report deleted or struck-through pre-printed wording as a `strikethrough` with the
wording that was removed.

## Do not report the same mark twice

One entry per distinct thing on the page. If the same stamp appears on three pages, that
is three marks with three page numbers; if one signature is described in two ways, that
is one mark. A list of near-identical entries buries the two or three that decide the
examination.

## Presence first, detail second

The first question about any mark is **whether it is there at all**. An examiner decides
what to do about a signature only after establishing that there is one, so the yes/no
answers below are the ones that matter most; the descriptions of individual marks are
what they consult afterwards.

So answer the presence questions for **every** document, including one where you find
nothing. `NO` is an answer. A field left blank is not.

Two of these are commonly got wrong, so be deliberate:

- `signed` is **YES** for a printed company chop, a facsimile signature or a name stamp —
  UCP 600 art. 3 accepts all of them. Do not answer NO merely because nothing was written
  by hand.
- `corrections_present: NO` and `corrections_authenticated: NA` go together. If there is
  nothing to authenticate, the answer is NA, never NO — NO means "there is a correction
  and nobody initialled it", which is a discrepancy you would be inventing.

Your answers must agree with the marks you list. If you report `signed: NO`, there must be
no signature in `marks`; if you list a seal, `seal_present` is YES.

## What to report

{asked}

Then, separately, every mark you found.

## Output

Return **only** JSON, in exactly this shape:

```json
{
  "fields": {
    "signed": "YES",
    "signed_capacity": "as agent for XYZ Lines, the carrier"
  },
  "marks": [
    {
      "kind": "signature",
      "page": 4,
      "placement": "foot of the page, right, under the carrier block",
      "readsAs": "ABC SHIPPING AGENCIES PTE LTD",
      "party": "ABC Shipping Agencies Pte Ltd",
      "capacity": "as agent for XYZ Lines, the carrier",
      "medium": "rubber stamp",
      "authenticates": null,
      "legible": true,
      "confidence": "HIGH"
    }
  ]
}
```

Rules for the output:

- `kind` is one of `signature`, `seal`, `stamp`, `handwriting`, `correction`, `tick`,
  `strikethrough`, `label`. Nothing else.
- `medium` is one of `handwritten`, `facsimile`, `rubber stamp`, `embossed`,
  `perforated`, `electronic`, `printed`.
- `page` is the bundle page number given with the images, not a position in the list.
- `confidence` is `HIGH`, `MED` or `LOW`.
- Use `null` for anything you cannot establish. Omitting a mark, or inventing a value to
  avoid a null, both produce a wrong examination — a null does not.
- Return `"marks": []` when the document genuinely carries none. An empty list is an
  answer; it is how an unsigned document is reported.

Inside `fields`, **answer every field you were asked for above**. A field left out is
not read as "nothing to report" — it is read as "not looked at", and the check that
needed it reports the presentation unsettled rather than clean. Three conventions matter,
because rules compare these values literally:

- A yes/no attestation is the **string** `"YES"` or `"NO"`. Not `true`, not `"Y"`.
- Where the field's note lists the values it may take and one of them means absence —
  `none`, `NA` — answer with that word. Do **not** omit the field and do not answer
  `null`. "There is no adverse clausing" is a finding an examiner acts on; a field that
  simply is not there reads as "we did not look", and the examination reports it as
  unsettled rather than clean.
