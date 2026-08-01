-- What is on the page that is not text.
--
-- A signature, a company chop, a "CERTIFIED TRUE COPY" stamp, a struck-through clause, a
-- ticked box, an initialled correction. Extraction reads characters; none of these are
-- characters, and several of them are the whole question:
--
--   UCP 600 art. 20(a)(i)   a bill of lading must be SIGNED, and the signature must show
--                           capacity — "as agent for XYZ Lines, the carrier"
--   UCP 600 art. 17         an apparently original signature, mark, stamp or label is what
--                           makes a document an original
--   UCP 600 art. 27         a clause declaring defective condition makes it unclean — and
--                           an ADDED clause is a discrepancy where identical pre-printed
--                           boilerplate is not
--   ISBP 821 §A             a correction on a document not issued by the beneficiary must
--                           appear authenticated
--
-- Why this is not lc_fact. A fact is one value under one dictionary key, uniquely keyed by
-- (case, document, label). A document carries several marks of the same kind — three
-- stamps, two signatures on different pages — so the same shape would collide on its own
-- key. The attestation VALUES do go to lc_fact under dictionary keys, because that is what
-- an exact rule joins on. This table is the evidence behind them: what the officer looks at
-- when the rule says "unsigned" and they need to see why.
--
-- Rewritten per document rather than upserted. There is no stable natural key for a mark —
-- placement is model-authored prose and moves between runs — so re-reading a document
-- deletes its marks and writes the new set. Marks belong entirely to the pass that produced
-- them; nothing else writes here.

CREATE TABLE helix_check.lc_mark (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id    UUID        NOT NULL REFERENCES helix_check.lc_case(id) ON DELETE CASCADE,
    -- Not a FK, for the same reason lc_fact.doc_code is not: a mark can sit on the covering
    -- schedule, which is a page rather than a document.
    doc_code   TEXT        NOT NULL,

    kind       TEXT        NOT NULL
               CHECK (kind IN ('signature', 'seal', 'stamp', 'handwriting',
                               'correction', 'tick', 'strikethrough', 'label')),
    page       INT,
    -- Where it sits, in words. There are no character coordinates on a scan, so the viewer
    -- turns to the page and this tells a human where to look.
    placement  TEXT,
    -- What it reads, verbatim. NULL rather than a guess when the mark cannot be read: a
    -- signature that is present but illegible is a different statement from an unsigned
    -- document, and only one of them is a discrepancy.
    reads_as   TEXT,
    party      TEXT,       -- whose mark it appears to be
    -- 'as agent for XYZ Lines, the carrier'. The single most load-bearing string here:
    -- UCP 600 art. 20(a)(i) is not satisfied by a signature alone.
    capacity   TEXT,
    -- handwritten | facsimile | rubber stamp | embossed | perforated | electronic | printed.
    -- UCP 600 art. 3 accepts all of them, so this is evidence rather than a test — but an
    -- officer asking "is this a wet signature or pre-printed?" has no other way to know.
    medium     TEXT,
    -- What this mark authenticates, when it exists to authenticate something else: an
    -- initialled correction, a signed on-board notation. NULL for a mark standing alone.
    authenticates TEXT,
    -- FALSE when the mark is there and cannot be read. See reads_as.
    legible    BOOLEAN     NOT NULL DEFAULT TRUE,
    confidence TEXT        CHECK (confidence IN ('HIGH', 'MED', 'LOW')),
    ordinal    INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_mark_case_doc ON helix_check.lc_mark (case_id, doc_code, ordinal);
