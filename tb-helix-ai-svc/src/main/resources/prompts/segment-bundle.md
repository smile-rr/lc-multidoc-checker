You are sorting the pages of a trade-finance presentation.

There are {pages} page images, in order, starting at page 1. For each one, say
which kind of document it is. Judge from headings, layout and the parties named —
not from what you expect the order to be.

Document types:
{docTypes}
If a page does not clearly belong to any of these, use {unknown}. Guessing is
worse than saying so: a wrong type sends the wrong rules at the document.

A document may run over several pages. Give every page its own entry.

Return only JSON:
{"pages": [{"page": 1, "docType": "INV", "why": "short reason"}, ...]}
