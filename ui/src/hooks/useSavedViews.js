import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'lc-v2.examineSavedViews';

const BUILTIN = [
  { id: 'default',        name: 'All rules',             builtin: true, filter: {}, navMode: 'article', sort: { col: null, dir: null } },
  { id: 'discrepancies',  name: 'All discrepancies',     builtin: true, filter: { status: ['FAIL'] },                navMode: 'article', sort: { col: 'severity', dir: 'desc' } },
  { id: 'agent-disagree', name: 'Agent disagreements',   builtin: true, filter: { attention: ['AGENT-DISAGREE'] },    navMode: 'article', sort: { col: 'reliab',   dir: 'asc' } },
  { id: 'majors',         name: 'Majors only',           builtin: true, filter: { severity: ['MAJOR'] },              navMode: 'article', sort: { col: 'status',   dir: 'asc' } },
  { id: 'low-conf',       name: 'Low-confidence passes', builtin: true, filter: { attention: ['LOW-CONF-PASS'] },     navMode: 'article', sort: { col: 'reliab',   dir: 'asc' } },
];

export function useSavedViews() {
  const [userViews, setUserViews] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userViews)); } catch {}
  }, [userViews]);

  const all = [...BUILTIN, ...userViews];

  const save = useCallback((name, state) => {
    const id = 'u-' + Date.now();
    const view = { id, name, builtin: false, ...state };
    setUserViews(v => [...v, view]);
    return view;
  }, []);

  const remove = useCallback((id) => {
    setUserViews(v => v.filter(x => x.id !== id));
  }, []);

  return { views: all, save, remove };
}
