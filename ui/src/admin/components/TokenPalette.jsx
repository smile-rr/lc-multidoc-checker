import React, { useMemo, useState } from 'react';
import { useStore } from '../store';

const KIND_STYLE = {
  rule:   { label: 'Rule context', chip: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' },
  ref:    { label: 'Citation',     chip: 'bg-blue-100 text-blue-800 border-blue-300',    dot: 'bg-blue-500' },
  lc:     { label: 'LC field',     chip: 'bg-teal-1/15 text-teal-1 border-teal-1/40',    dot: 'bg-teal-1' },
  doc:    { label: 'Doc field',    chip: 'bg-purple-100 text-purple-800 border-purple-300', dot: 'bg-purple-500' },
  system: { label: 'System',       chip: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-500' },
};

const RULE_TOKENS = [
  { token: '{{rule.id}}',          desc: 'Rule ID, e.g. AMT-01' },
  { token: '{{rule.name}}',        desc: 'Display name' },
  { token: '{{rule.severity}}',    desc: 'CRITICAL / MAJOR / MINOR' },
  { token: '{{rule.polarity}}',    desc: 'POSITIVE / NEGATIVE' },
  { token: '{{rule.ucp_excerpt}}', desc: 'UCP/ISBP excerpt block from catalog' },
  { token: '{{rule.field_keys}}',  desc: 'Comma-list of bound field keys' },
];

const SYSTEM_TOKENS = [
  { token: '{{system.presentationDate}}', desc: 'Presentation date passed at runtime' },
  { token: '{{system.today}}',            desc: 'Today (issuing-bank time)' },
  { token: '{{system.outputSchema}}',     desc: 'Required JSON output schema' },
];

const fieldDesc = (f) => {
  const tags = (f.source_tags || []).filter(Boolean).join(', ');
  return tags ? `${f.name_en} ← :${tags}:` : f.name_en;
};

export function TokenPalette({ rule, onInsert }) {
  const refs = useStore((s) => s.refs);
  const fields = useStore((s) => s.fields);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const ruleCitations = useMemo(() => {
    if (!rule) return [];
    const ids = [...(rule.ucp_refs || []), ...(rule.isbp_refs || [])];
    const all = [...refs.ucp600, ...refs.isbp821];
    return ids.map((id) => ({
      token: `{{ref.${id}}}`,
      desc: all.find((r) => r.id === id)?.heading || id,
    }));
  }, [rule, refs]);

  const ruleFields = useMemo(() => {
    if (!rule || !rule.field_keys) return [];
    return rule.field_keys.map((k) => {
      const f = fields.find((x) => x.key === k);
      const lcOnly = f?.applies_to?.length === 1 && f.applies_to[0] === 'LC';
      return {
        token: lcOnly ? `{{lc.${k}}}` : `{{doc.${(rule.applies_to || []).find((d) => d !== 'LC') || 'INV'}.${k}}}`,
        desc: f ? fieldDesc(f) : k,
      };
    });
  }, [rule, fields]);

  const wholeContent = useMemo(() => {
    const items = [
      { token: '{{lc.fullText}}', desc: 'Full MT700 message (raw, length-bounded)' },
    ];
    const docTypes = (rule?.applies_to || []).filter((d) => d !== 'LC');
    const types = docTypes.length ? docTypes : ['INV', 'BOL', 'PKL', 'BOE', 'BC', 'WC'];
    for (const dt of types) {
      items.push({ token: `{{doc.${dt}.fullText}}`, desc: `Entire extracted ${dt} text` });
    }
    return items;
  }, [rule]);

  const rawTags = useMemo(() => {
    const tagSet = new Set();
    for (const f of fields) {
      for (const t of f.source_tags || []) if (t) tagSet.add(t);
    }
    return [...tagSet].sort().map((t) => ({
      token: `{{lc.raw.${t}}}`,
      desc: `Raw :${t}: tag content (escape hatch — prefer parsed field above)`,
    }));
  }, [fields]);

  const allLc = useMemo(
    () => fields.filter((f) => (f.applies_to || []).includes('LC')).map((f) => ({
      token: `{{lc.${f.key}}}`, desc: fieldDesc(f),
    })),
    [fields]
  );

  const allDoc = useMemo(() => {
    const out = {};
    for (const f of fields) {
      for (const dt of f.applies_to || []) {
        if (dt === 'LC') continue;
        (out[dt] ||= []).push({ token: `{{doc.${dt}.${f.key}}}`, desc: fieldDesc(f) });
      }
    }
    return out;
  }, [fields]);

  const filter = (xs) =>
    !q ? xs : xs.filter((x) => `${x.token} ${x.desc}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="bg-paper border border-line rounded">
      <div className="px-3 py-2 border-b border-line">
        <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Insert reference</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tokens…"
          className="w-full text-xs px-2 py-1 border border-line rounded focus:outline-none focus:border-teal-1"
        />
        <Legend />
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {rule && (
          <Section title="From this rule" subtitle={rule.rule_id} accent>
            <Group title="Rule context" kind="rule" items={filter(RULE_TOKENS)} onInsert={onInsert} />
            {ruleCitations.length > 0 && (
              <Group title="Citations" kind="ref" items={filter(ruleCitations)} onInsert={onInsert} />
            )}
            {ruleFields.length > 0 && (
              <Group title="Bound parsed fields" kind="lc" items={filter(ruleFields)} onInsert={onInsert} />
            )}
          </Section>
        )}

        <Section title="Whole content" subtitle="when extraction may be unreliable">
          <Group title="Full text" kind="doc" items={filter(wholeContent)} onInsert={onInsert} />
        </Section>

        <Section
          title="Browse all parsed fields"
          subtitle={`${allLc.length} LC + ${Object.values(allDoc).reduce((n, x) => n + x.length, 0)} doc · prefer these over raw tags`}
          collapsible
          collapsed={!showAll}
          onToggle={() => setShowAll((v) => !v)}
        >
          {showAll && (
            <>
              <Group title="LC fields" kind="lc" items={filter(allLc)} onInsert={onInsert} />
              {Object.entries(allDoc).map(([dt, items]) => (
                <Group key={dt} title={`${dt} doc fields`} kind="doc" items={filter(items)} onInsert={onInsert} />
              ))}
              <Group title="UCP 600" kind="ref" items={filter(refs.ucp600.map((r) => ({
                token: `{{ref.${r.id}}}`, desc: r.heading,
              })))} onInsert={onInsert} />
              <Group title="ISBP 821" kind="ref" items={filter(refs.isbp821.map((r) => ({
                token: `{{ref.${r.id}}}`, desc: r.heading,
              })))} onInsert={onInsert} />
              <Group title="System" kind="system" items={filter(SYSTEM_TOKENS)} onInsert={onInsert} />
            </>
          )}
        </Section>

        <Section
          title="Raw SWIFT tags"
          subtitle="escape hatch — only when parsed value is ambiguous"
          collapsible
          collapsed={!showRaw}
          onToggle={() => setShowRaw((v) => !v)}
        >
          {showRaw && (
            <Group title="Raw tag content" kind="system" items={filter(rawTags)} onInsert={onInsert} />
          )}
        </Section>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {Object.entries(KIND_STYLE).map(([k, s]) => (
        <span key={k} className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Section({ title, subtitle, accent, collapsible, collapsed, onToggle, children }) {
  return (
    <div className={accent ? 'bg-amber-50/30' : ''}>
      <button
        type="button"
        onClick={collapsible ? onToggle : undefined}
        className={`w-full px-3 py-2 flex items-center justify-between border-b border-line ${
          collapsible ? 'hover:bg-slate2 cursor-pointer' : 'cursor-default'
        }`}
      >
        <div className="text-left">
          <div className="text-[11px] font-medium">{title}</div>
          {subtitle && <div className="text-[10px] text-muted font-mono">{subtitle}</div>}
        </div>
        {collapsible && (
          <span className="text-muted text-xs">{collapsed ? '▸' : '▾'}</span>
        )}
      </button>
      {children}
    </div>
  );
}

function Group({ title, kind, items, onInsert }) {
  if (!items || items.length === 0) return null;
  const s = KIND_STYLE[kind];
  return (
    <div className="px-3 py-2 border-b border-line/60 last:border-b-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        <span className="text-[10px] uppercase tracking-wider text-muted">{title}</span>
        <span className="text-[10px] text-muted font-mono ml-auto">{items.length}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((it) => (
          <button
            key={it.token}
            type="button"
            onClick={() => onInsert(it.token)}
            title={it.desc}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${s.chip} hover:brightness-95 transition`}
          >
            {it.token.replace(/^\{\{|\}\}$/g, '')}
          </button>
        ))}
      </div>
    </div>
  );
}
