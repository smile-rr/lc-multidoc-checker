import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, matchPath } from 'react-router-dom';

import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/inter-tight/400.css';
import '@fontsource/inter-tight/500.css';
import '@fontsource/jetbrains-mono/400.css';

import './styles.css';
import { useAssistant } from './AssistantContext';
import { TopicChips } from './TopicChips';
import { Turn } from './Turn';
import { Epigraph } from './Epigraph';
import { QuickPrompts } from './QuickPrompts';
import { ReasoningRibbon } from './ReasoningRibbon';
import { Composer } from './Composer';
import { PatchSlip } from './PatchSlip';
import { ActiveArtifactCard } from './ActiveArtifactCard';
import { CitationDrawer } from './CitationDrawer';
import { KeyboardOverlay } from './KeyboardOverlay';
import { getState } from '../store';

function useAutoBindFocus() {
  const { setFocus } = useAssistant();
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    const ruleMatch = matchPath('/admin/rules/:ruleId', path);
    if (ruleMatch) {
      const r = getState().rules.find((x) => x.rule_id === ruleMatch.params.ruleId);
      if (r) setFocus({ kind: 'rule', payload: r });
      return;
    }
    const fieldMatch = matchPath('/admin/fields/:key', path);
    if (fieldMatch) {
      const f = getState().fields.find((x) => x.key === fieldMatch.params.key);
      if (f) setFocus({ kind: 'field', payload: f });
    }
  }, [location.pathname, setFocus]);
}

export function AssistantDrawer() {
  const { state, setScope, toggleOpen, setOpen, reset, submit } = useAssistant();
  const [showKbd, setShowKbd] = useState(false);
  const navigate = useNavigate();
  const bodyRef = useRef();
  useAutoBindFocus();

  // keyboard chords + global toggles
  useEffect(() => {
    let buffer = ''; let bufferTimer = null;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (e.key === '?' && !inField) { e.preventDefault(); setShowKbd(true); return; }
      if (e.key === 'Escape') {
        if (showKbd) { setShowKbd(false); return; }
        if (state.open) { setOpen(false); return; }
      }
      if (inField) return;
      if (e.key === 'g') {
        buffer = 'g';
        clearTimeout(bufferTimer);
        bufferTimer = setTimeout(() => { buffer = ''; }, 800);
        return;
      }
      if (buffer === 'g') {
        if (e.key === 'a') { e.preventDefault(); toggleOpen(); buffer = ''; return; }
        const map = { r: '/admin/rules', p: '/admin/prompts', f: '/admin/fields' };
        if (map[e.key]) { e.preventDefault(); navigate(map[e.key]); }
        buffer = '';
        return;
      }
      if (e.key === 'n' && state.open) {
        e.preventDefault();
        if (state.patches.some((p) => !p.applied)) {
          if (!window.confirm('Discard pending patches and start a new thread?')) return;
        }
        reset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(bufferTimer); };
  }, [state.open, state.patches, showKbd, toggleOpen, setOpen, reset, navigate]);

  // scroll to bottom on new turn
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.turns.length, state.resolving, state.patches.length]);

  const pendingPatches = state.patches.filter((p) => !p.applied);
  const appliedPatches = state.patches.filter((p) => p.applied);
  const hasContent = state.turns.length > 0 || state.resolving;

  return (
    <>
      <aside className="assistant-drawer" data-open={state.open} aria-hidden={!state.open}>
        <div className="assistant-drawer-header">
          <span className="assistant-drawer-eyebrow">Governance · Assistant</span>
          {state.turns.length > 0 ? (
            <button
              onClick={() => {
                if (state.patches.some((p) => !p.applied) && !window.confirm('Discard pending patches and start a new thread?')) return;
                reset();
              }}
              style={{ background: 'none', border: 0, color: '#8a8a8f', cursor: 'pointer', fontFamily: '"Source Serif 4", Georgia, serif', fontStyle: 'italic', fontSize: 12 }}
            >new thread →</button>
          ) : null}
          <button
            onClick={() => setShowKbd(true)}
            title="Keyboard shortcuts (?)"
            style={{ background: 'none', border: 0, color: '#8a8a8f', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}
          >?</button>
          <button
            onClick={() => setOpen(false)}
            className="assistant-drawer-close"
            aria-label="Close assistant"
          >×</button>
        </div>

        <div style={{ padding: '10px 22px 0' }}>
          <TopicChips scope={state.scope} onChange={setScope} />
        </div>

        <div className="assistant-drawer-body" ref={bodyRef}>
          {/* Active artifact strip — only when something is bound */}
          {state.lastFocus ? (
            <div style={{ paddingBottom: 14, borderBottom: '1px solid #ece9df', marginBottom: 6 }}>
              <div className="drawer-section-head" style={{ marginTop: 0 }}>Context</div>
              <ActiveArtifactCard />
            </div>
          ) : null}

          {!hasContent ? (
            <>
              <Epigraph />
              <QuickPrompts onPick={(p) => submit(p)} />
            </>
          ) : (
            <>
              {state.turns.map((t) => <Turn key={t.id} turn={t} />)}
              {state.resolving ? <ReasoningRibbon steps={state.reasoning} /> : null}
            </>
          )}

          {pendingPatches.length ? (
            <>
              <div className="drawer-section-head">
                Pending patches <span className="count">{pendingPatches.length}</span>
              </div>
              {pendingPatches.map((p, i) => <PatchSlip key={p.id} patch={p} index={i} total={pendingPatches.length} />)}
            </>
          ) : null}

          {appliedPatches.length ? (
            <>
              <div className="drawer-section-head">
                Applied <span className="count">{appliedPatches.length}</span>
              </div>
              {appliedPatches.map((p, i) => <PatchSlip key={p.id} patch={p} index={i} total={appliedPatches.length} />)}
            </>
          ) : null}

          {state.pinnedCitations.length ? (
            <>
              <div className="drawer-section-head">
                Citations <span className="count">{state.pinnedCitations.length}</span>
              </div>
              <CitationDrawer />
            </>
          ) : null}
        </div>

        <div className="assistant-drawer-footer">
          <Composer />
        </div>
      </aside>
      {showKbd ? <KeyboardOverlay onClose={() => setShowKbd(false)} /> : null}
    </>
  );
}
