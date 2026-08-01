Below are {count} SWIFT messages from one file, in the order they were sent.

They concern a single documentary credit. Read them together and report the terms
**as they now stand**.

How the messages relate:

- An issue (MT700, MT710, MT720) establishes the terms.
- A continuation (MT701, MT708, MT711) is not a message of its own — it is the
  overflow of the one before it. Join its text onto that field.
- An amendment (MT707) changes some of the terms and is silent about the rest.
  Silence means unchanged. Apply amendments in order; a later one beats an
  earlier one on the same field.
- An amendment may state a change in words rather than as a value — "expiry
  extended by 30 days", "amount increased by USD 10,000". Work out the resulting
  value from the term it changes, and report the result.
- Free format (MT799) is context. Take a term from it only if it plainly states
  one; never let prose about a credit override the credit.

---
{messages}
---

Report these fields, as they stand after everything above, under exactly these
names:

{fields}
Omit any field the messages do not carry. Do not guess, and do not carry a value
across from a similar tag.

Also report "_from": an object mapping each field you filled to the message that
last stated it, written as it appears in the heading — "#1 MT700", "#3 MT707".

Return only a JSON object: the fields at the top level, plus "_from".
