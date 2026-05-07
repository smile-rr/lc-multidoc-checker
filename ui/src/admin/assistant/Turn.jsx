import React from 'react';
import { useAssistant } from './AssistantContext';
import { CitationChip } from './CitationChip';

const time = (id) => {
  const d = new Date(parseInt(id.replace(/[^\d]/g, '').slice(0, 13), 10));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

const renderInline = (text) => {
  // turn [UCP-14-h] / [ISBP-A19] tokens into chips, keep the rest as text
  const re = /\b(UCP-\d+[a-z]?(?:-[a-z])?|ISBP-[A-Z]\d+)\b/g;
  const out = [];
  let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<CitationChip key={m.index} id={m[0]} />);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

export function Turn({ turn }) {
  const { flashCitation, pinCitation } = useAssistant();

  if (turn.role === 'officer') {
    return (
      <div className="turn turn-officer">
        <div className="turn-meta">{time(turn.id)} · officer</div>
        <div className="turn-body">{turn.text}</div>
      </div>
    );
  }

  return (
    <div className="turn turn-assistant" tabIndex={0}>
      <div className="turn-meta">{time(turn.id)} · assistant</div>
      <div className="turn-body">
        {turn.paragraphs.map((p, i) => (
          <p key={i}>{renderInline(p)}</p>
        ))}
      </div>
      {turn.citations && turn.citations.length ? (
        <div className="turn-citations">
          {turn.citations.map((c, i) => (
            <a key={c.id} href={`#cite-${c.id}`} onClick={(e) => { e.preventDefault(); pinCitation(c); flashCitation(c.id); }}>
              <sup>{i + 1}</sup> {c.id} — {c.heading}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
