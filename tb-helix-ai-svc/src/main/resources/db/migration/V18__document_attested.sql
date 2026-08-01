-- When this document was last looked at for signatures, seals and corrections.
--
-- Not derivable from lc_mark. A genuinely unsigned, unstamped, uncorrected document
-- attests to zero marks, so "no rows" is the answer for both a document that was examined
-- and found clean and one that was never examined at all. Those are different statements
-- and the workbench has to say which it is: the first is a finding an officer can act on,
-- the second is a gap in the dictionary.
--
-- Nor derivable from the facts, for the same reason in a subtler form — a document whose
-- every presence answer came back absent would look unexamined.
--
-- NULL means never attested. Set by the attest pass on each successful look, cleared when
-- the reading is undone.

ALTER TABLE helix_check.lc_document
    ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ;
