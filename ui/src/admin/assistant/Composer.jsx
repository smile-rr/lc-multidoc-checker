import React, { useState, useRef, useEffect } from 'react';
import { useAssistant } from './AssistantContext';
import { SlashMenu } from './SlashMenu';

export function Composer() {
  const { submit, state } = useAssistant();
  const [text, setText] = useState('');
  const [slash, setSlash] = useState(null);
  const ref = useRef();

  // expose imperative submit for QuickPrompts via window event
  useEffect(() => {
    const handler = (e) => {
      const v = e.detail;
      setText(v);
      submit(v);
      setText('');
    };
    window.addEventListener('assistant:submit', handler);
    return () => window.removeEventListener('assistant:submit', handler);
  }, [submit]);

  // recover focus after each turn
  useEffect(() => {
    if (!state.resolving) ref.current?.focus();
  }, [state.resolving]);

  const lastOfficer = [...state.turns].reverse().find((t) => t.role === 'officer');

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!text.trim() || state.resolving) return;
      submit(text);
      setText('');
      setSlash(null);
      return;
    }
    if (e.key === 'Escape') { setSlash(null); return; }
    if (e.key === 'ArrowUp' && !text && lastOfficer) {
      e.preventDefault();
      setText(lastOfficer.text);
      return;
    }
    if (e.key === '/' && !text) {
      setSlash('');
      return;
    }
  };

  const onChange = (e) => {
    const v = e.target.value;
    setText(v);
    if (v.startsWith('/')) setSlash(v.slice(1).split(/\s/)[0]);
    else setSlash(null);
  };

  return (
    <div className="composer-wrap">
      <textarea
        ref={ref}
        className="composer-input"
        rows={2}
        placeholder="ask, or paste a paragraph…"
        value={text}
        disabled={state.resolving}
        aria-busy={state.resolving}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <div className="composer-hint">
        <kbd>⌘</kbd><kbd>↵</kbd> send
        <span style={{ margin: '0 12px' }}>·</span>
        <kbd>/</kbd> reference
        <span style={{ margin: '0 12px' }}>·</span>
        <kbd>?</kbd> shortcuts
      </div>
      {slash !== null ? (
        <SlashMenu
          filter={slash}
          onPick={(prefix) => { setText(prefix); setSlash(null); ref.current?.focus(); }}
        />
      ) : null}
    </div>
  );
}
