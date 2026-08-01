Below is a plan assembled for one presentation: the threshold checks that have already
run, the credit's terms and its own text, the standing rules selected for it, and the
requirements read out of fields 46A and 47A.

Answer with JSON and nothing else:

{
  "suppress": [
    {"checkId": "...", "because": "...", "quote": "..."}
  ],
  "gateOverride": {"checkId": "...", "to": "CONTINUE", "because": "...", "quote": "..."},
  "runRemaining": true,
  "why": "...",
  "humanReview": [
    {"requirement": "...", "because": "...", "source": ":47A:", "severity": "MAJOR"}
  ]
}


suppress

Standing rules this credit's own text answers, so running them would raise a
discrepancy the applicant has already excused. `checkId` must be one of the ids listed
below — nothing else exists. `quote` is the clause from 46A or 47A that does it, in
the credit's own words; `because` is one sentence saying what it does.

Each suppression raises a card for the officer to confirm, so this is never quiet and
never final. That is the reason it is safe to do at all — and not a reason to do it
more freely. Leave the list empty when the credit says nothing bearing on any rule,
which is the usual answer.


gateOverride

A threshold check failed, and something in this credit bears on the very ground it
failed on: 47A extends the presentation period, an amendment moved the expiry, the
credit names a different place of expiry from the one the check compared against, or
UCP 600 art. 29(a) applies because the last day fell on a day the bank was closed.

  "to": "CONTINUE"  the ground is answered or doubtful — keep examining
  "to": "STOP"      the ground stands, and the author's view was to keep going

Omit the field entirely when no threshold check failed, or when the credit says nothing
about the ground that did. Do not use it to express a general preference; it is about
one named check and one clause.


runRemaining

Whether the other checks on the plan should be run now.

Answer false only when a threshold check failed on a ground nothing in this credit
answers, and that ground alone means the presentation cannot comply however the
documents read — a credit that expired before presentation, with no clause extending
it, is the case this exists for. Under art. 6(d)(i) that presentation is outside the
credit, so the remaining checks are moot: not merely unnecessary, but incapable of
changing the answer. The officer is then offered a refusal on that ground.

Answer true in every other case, including when you are unsure, and including where
the ground is serious but curable — a discrepancy the beneficiary could re-present
against, or one the applicant may waive. In those the officer needs the complete
picture, because art. 16(c) allows one notice and it must state every ground.

Do not weigh how long the examination takes or what it costs to run. That is not a
question a documentary credit turns on, and it is not yours.

`why` is one or two sentences an officer will read on screen, naming the check and the
clause or article you relied on. It is shown whichever way you answer.


humanReview

Things this presentation turns on that nothing on the plan can settle: a condition in
47A no rule tests and no requirement card covers, a term whose meaning has to be
construed, an instruction addressed to the bank rather than to the documents. Each one
becomes a card an officer must clear before the case can be decided.

Do not repeat a requirement already listed below — it is already on the plan. This is
for what is missing from it.
