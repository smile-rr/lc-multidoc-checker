import React from 'react';
import { useAssistant } from './AssistantContext';

export function CitationDrawer() {
  const { state } = useAssistant();
  if (!state.pinnedCitations.length) {
    return <div className="rail-empty">no paragraphs cited yet — assistant footnotes will land here.</div>;
  }
  return (
    <ol className="citation-list">
      {state.pinnedCitations.map((c, i) => (
        <li
          key={c.id}
          id={`cite-${c.id}`}
          className={state.flashCitationId === c.id ? 'flash' : ''}
        >
          <span className="citation-id">{c.id}</span>
          <span className="citation-heading">{c.heading}</span>
          <span className="citation-text">{c.text}</span>
        </li>
      ))}
    </ol>
  );
}
