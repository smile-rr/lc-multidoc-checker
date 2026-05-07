import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import { respond } from './assistantEngine';

const Ctx = createContext(null);

const OPEN_KEY = 'lc.assistant.open';
const readOpen = () => {
  try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
};

const initial = {
  open: false,
  scope: 'all',
  turns: [],
  patches: [],
  pinnedCitations: [],
  resolving: false,
  reasoning: [],
  lastFocus: null,
  flashCitationId: null,
};

const reducer = (s, a) => {
  switch (a.type) {
    case 'set_open': return { ...s, open: a.open };
    case 'toggle_open': return { ...s, open: !s.open };
    case 'set_scope': return { ...s, scope: a.scope };
    case 'submit': {
      const officerTurn = { id: 't' + Date.now(), role: 'officer', text: a.text };
      return { ...s, turns: [...s.turns, officerTurn], resolving: true, reasoning: [] };
    }
    case 'reasoning': return { ...s, reasoning: a.steps };
    case 'reply': {
      const assistantTurn = {
        id: 't' + Date.now() + '_r',
        role: 'assistant',
        paragraphs: a.reply.paragraphs,
        citations: a.reply.citations,
        intent: a.reply.intent,
        scope: s.scope,
      };
      const newPinned = [...s.pinnedCitations];
      for (const c of a.reply.citations || []) if (!newPinned.find((x) => x.id === c.id)) newPinned.push(c);
      const focus = a.reply.contextArtifacts && a.reply.contextArtifacts[0]
        ? a.reply.contextArtifacts[0]
        : s.lastFocus;
      return {
        ...s,
        resolving: false,
        reasoning: [],
        turns: [...s.turns, assistantTurn],
        patches: [...s.patches, ...(a.reply.patches || [])],
        pinnedCitations: newPinned,
        lastFocus: focus,
      };
    }
    case 'apply_patch': return {
      ...s,
      patches: s.patches.map((p) => p.id === a.id ? { ...p, applied: true, appliedAt: new Date().toISOString(), appliedBy: a.actor } : p),
    };
    case 'reject_patch': return { ...s, patches: s.patches.filter((p) => p.id !== a.id) };
    case 'flash_citation': return { ...s, flashCitationId: a.id };
    case 'pin_citation': {
      if (s.pinnedCitations.find((c) => c.id === a.citation.id)) return s;
      return { ...s, pinnedCitations: [...s.pinnedCitations, a.citation] };
    }
    case 'set_focus': return { ...s, lastFocus: a.focus };
    case 'reset': return initial;
    default: return s;
  }
};

export function AssistantProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial, (s) => ({ ...s, open: readOpen() }));

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, state.open ? '1' : '0'); } catch {}
  }, [state.open]);

  const submit = useCallback((text) => {
    if (!text || !text.trim()) return;
    dispatch({ type: 'submit', text });
    // simulate streaming reasoning, then reply
    const reply = respond(text, { scope: state.scope });
    const steps = reply.reasoning || [];
    let i = 0;
    const tick = () => {
      if (i < steps.length) {
        dispatch({ type: 'reasoning', steps: steps.slice(0, i + 1) });
        i += 1;
        setTimeout(tick, 320);
      } else {
        dispatch({ type: 'reply', reply });
      }
    };
    setTimeout(tick, 220);
  }, [state.scope]);

  const value = useMemo(() => ({
    state, dispatch,
    submit,
    open: state.open,
    setOpen: (open) => dispatch({ type: 'set_open', open }),
    toggleOpen: () => dispatch({ type: 'toggle_open' }),
    setScope: (scope) => dispatch({ type: 'set_scope', scope }),
    applyPatch: (id, actor) => dispatch({ type: 'apply_patch', id, actor }),
    rejectPatch: (id) => dispatch({ type: 'reject_patch', id }),
    flashCitation: (id) => {
      dispatch({ type: 'flash_citation', id });
      setTimeout(() => dispatch({ type: 'flash_citation', id: null }), 700);
    },
    pinCitation: (citation) => dispatch({ type: 'pin_citation', citation }),
    setFocus: (focus) => dispatch({ type: 'set_focus', focus }),
    reset: () => dispatch({ type: 'reset' }),
  }), [state, submit]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAssistant = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAssistant outside provider');
  return v;
};
