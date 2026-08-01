Below are page images of a documentary credit (typically an MT700 / MT707 print or
scan). Transcribe them into plain SWIFT text.

Rules:

- Reproduce every SWIFT tag and its body faithfully: `:20:`, `:31D:`, `:46A:`, and so on.
- Keep message order and tag order. Do not invent tags the pages do not show.
- Preserve line breaks inside multi-line fields (`:45A:`, `:46A:`, `:47A:`) as they appear.
- If several messages are on the pages (issue then amendment), transcribe each in full,
  one after another, separated by a blank line.
- Do not summarise, translate, or fill gaps. Characters you cannot read become `?`.
- Ignore stamps, signatures and bank letterhead that are not part of the message body.

Return only a JSON object of this exact shape:

{"text":"<the full transcription>"}
