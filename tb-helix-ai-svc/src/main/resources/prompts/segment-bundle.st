You are sorting the pages of a trade-finance presentation.

There are {pages} page images in this batch. They are **bundle pages {pageFrom}
through {pageTo}** (inclusive), in order. For each image, say which kind of
document it is. Judge from headings, layout and the parties named — not from
what you expect the order to be.

Report each page under its **bundle page number** ({pageFrom}…{pageTo}), never
renumbered from 1 inside this batch.

Document types:
{docTypes}

A document may run over several pages. Give every page its own entry.

Continuation pages — blank backs, stamp/endorsement sheets, terms-and-conditions
backs, packing details that clearly belong with the document above — keep the
**same docType as the previous page**. Prefer attaching a page to the document it
continues over inventing a new one.

Use {unknown} only when a page is plainly a different instrument (or junk) and
you cannot tell which type, and it does not continue the page before it. Guessing
a wrong type sends the wrong rules at the document; leaving a continuation page
as {unknown} is almost always worse than keeping the previous type.
{continuation}
Return only JSON:
{"pages": [{"page": {pageFrom}, "docType": "INV", "why": "short reason"}, ...]}
