import React, { useState, useRef, useEffect } from 'react';
import { useAssistant } from './AssistantContext';
import { lookupRef } from './retrievers/ucpIsbpRetriever';

export function CitationChip({ id, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const { pinCitation, flashCitation } = useAssistant();
  const data = lookupRef(id);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const onClick = () => {
    if (data) { pinCitation(data); flashCitation(data.id); }
  };

  return (
    <span
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={onClick}
      style={{
        position: 'relative',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '11px',
        letterSpacing: '0.04em',
        color: 'var(--marginalia)',
        cursor: 'help',
        margin: '0 1px',
      }}
    >
      [{children || id}]
      {open && data ? (
        <span
          className="citation-popover"
          style={{ left: 0, top: '140%' }}
          role="tooltip"
        >
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, color: 'var(--marginalia)', display: 'block', marginBottom: 4 }}>
            {data.id}
          </span>
          <span style={{ fontStyle: 'italic', display: 'block', marginBottom: 6 }}>{data.heading}</span>
          <span style={{ color: 'var(--ink-muted)', fontSize: 12.5, lineHeight: 1.5 }}>{data.text}</span>
        </span>
      ) : null}
    </span>
  );
}
