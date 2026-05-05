import React from 'react';
import { Link, useParams } from 'react-router-dom';
import fieldsData from '../fieldsData.json';

const TYPE_TONE = {
  STRING: 'text-slate-700 bg-slate-100',
  AMOUNT: 'text-status-green bg-status-greenSoft',
  DATE:   'text-status-blue bg-status-blueSoft',
  NUMBER: 'text-status-blue bg-status-blueSoft',
  ENUM:   'text-purple-700 bg-purple-50',
  BOOL:   'text-purple-700 bg-purple-50',
  TEXT:   'text-status-gold bg-status-goldSoft',
};

const TIER_TONE = {
  PROGRAMMATIC: 'text-slate-700 bg-slate-100',
  AGENT:        'text-teal-1 bg-teal-1/10',
  AGENT_TOOL:   'text-status-blue bg-status-blueSoft',
  AGENTIC:      'text-purple-700 bg-purple-50',
};
const TIER_SHORT = {
  PROGRAMMATIC: 'PROG', AGENT: 'AGENT', AGENT_TOOL: 'AGENT+TOOL', AGENTIC: 'AGENTIC',
};

export function FieldDetailPage() {
  const { key } = useParams();
  const field = fieldsData.fields.find((f) => f.key === key);

  if (!field) {
    return (
      <div className="px-6 py-5">
        <Link to="/admin/fields" className="text-xs text-muted hover:text-navy-1">← Fields</Link>
        <div className="mt-4 text-sm">Field not found: <span className="font-mono">{key}</span></div>
      </div>
    );
  }

  const tone = TYPE_TONE[field.type] || 'text-muted bg-slate-100';
  const usedRules   = field.used_by_rules || [];
  const usedPrompts = field.used_by_prompts || [];
  const usage       = usedRules.length + usedPrompts.length;
  const isLcField   = (field.applies_to || []).includes('LC');

  return (
    <div className="px-6 py-5 max-w-[1280px] mx-auto">
      {/* ── BREADCRUMB ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs">
        <Link to="/admin/fields" className="text-muted hover:text-navy-1">← Fields</Link>
        <span className="text-muted">/</span>
        <span className="font-mono text-navy-1/80">{field.key}</span>
        <span className="ml-auto flex items-center gap-3">
          {usage === 0 && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-status-gold">orphaned</span>
          )}
          {field.reconcile_canonical && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-teal-1">canonical</span>
          )}
        </span>
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="mt-4 bg-paper border border-line rounded-lg shadow-sm">
        <div className="px-6 pt-5 pb-4 border-b border-line/70">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-base text-teal-1 tracking-tight">{field.key}</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted">field definition</span>
          </div>
          <h1 className="mt-1.5 text-xl text-navy-1 font-serif"
              style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
            {field.name_en}
          </h1>
          {field.description && (
            <p className="mt-2 text-[12px] text-navy-1/85 leading-relaxed max-w-3xl">
              {field.description}
            </p>
          )}
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-x-12">
          <dl>
            <Spec label="type">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider ${tone}`}>
                {field.type}
              </span>
            </Spec>
            <Spec label="applies to">
              <span className="font-mono text-[12px] text-navy-1">
                {(field.applies_to || []).join(' · ') || <span className="text-muted">—</span>}
              </span>
            </Spec>
            <Spec label="canonical">
              <span className={`text-[12px] ${field.reconcile_canonical ? 'text-teal-1' : 'text-muted'}`}>
                {field.reconcile_canonical ? 'yes — used by reconcile pivot' : 'no'}
              </span>
            </Spec>
          </dl>
          <dl>
            <Spec label="swift tags">
              {(field.source_tags || []).length === 0 ? (
                <span className="text-[12px] text-muted">— extracted from doc, not parsed from MT700</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {field.source_tags.map((t) => (
                    <span key={t} className="font-mono text-[11px] text-orange-700 bg-orange-50 border border-orange-200 px-1.5 rounded">
                      :{t}:
                    </span>
                  ))}
                  <span className="text-[10px] text-muted/80 ml-1">parser-bound, read-only</span>
                </span>
              )}
            </Spec>
            <Spec label="owner">
              <span className="font-mono text-[12px] text-navy-1">@{field.owner}</span>
            </Spec>
            <Spec label="last edit" muted>
              <span className="text-[11px] text-muted">
                {new Date(field.last_edited_at).toLocaleDateString()}
              </span>
            </Spec>
          </dl>
        </div>
      </div>

      {/* ── WHERE USED ──────────────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-12 gap-5 items-start">
        <div className="col-span-7">
          <Section caption="Used by rules" side={`${usedRules.length}`}>
            {usedRules.length === 0 ? (
              <Empty>No rule references this field.</Empty>
            ) : (
              <ul className="divide-y divide-line/50">
                {usedRules.map((r) => (
                  <li key={r.rule_id} className="px-4 py-2.5 flex items-center gap-3 text-[12px]">
                    <Link to={`/admin/rules/${r.rule_id}`} className="font-mono text-teal-1 hover:underline w-32">
                      {r.rule_id}
                    </Link>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider ${TIER_TONE[r.tier] || ''}`}>
                      {TIER_SHORT[r.tier] || r.tier}
                    </span>
                    <Link to={`/admin/rules/${r.rule_id}`}
                          className="ml-auto text-[11px] text-muted hover:text-navy-1">open →</Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <div className="col-span-5">
          <Section caption="Used by prompts" side={`${usedPrompts.length}`}>
            {usedPrompts.length === 0 ? (
              <Empty>No prompt template injects this field.</Empty>
            ) : (
              <ul className="divide-y divide-line/50">
                {usedPrompts.map((p) => (
                  <li key={p.id} className="px-4 py-2.5 text-[12px]">
                    <Link to={`/admin/prompts/${encodeURIComponent(p.id)}`}
                          className="font-mono text-[11px] text-teal-1 hover:underline truncate block">
                      {p.path}
                    </Link>
                    <span className="text-[10px] font-mono text-muted">
                      injects as {isLcField ? `{{lc.${field.key}}}` : `{{doc.${(field.applies_to || ['?'])[0]}.${field.key}}}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* ── IMPACT NOTE ─────────────────────────────────────────────────── */}
      {usage > 0 && (
        <div className="mt-4 px-3 py-2 bg-status-goldSoft/40 border border-status-gold/30 rounded text-[11px] text-status-gold">
          <span className="font-medium">Renaming this field</span> would invalidate the bound prompt token in {usedPrompts.length} {usedPrompts.length === 1 ? 'template' : 'templates'} and require re-promotion of {usedRules.length} {usedRules.length === 1 ? 'rule' : 'rules'}. Plan accordingly.
        </div>
      )}
    </div>
  );
}

function Spec({ label, hint, muted, children }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-4 items-baseline py-1.5 border-b border-dotted border-line/50 last:border-b-0">
      <dt className={`text-[10px] uppercase tracking-[0.16em] ${muted ? 'text-muted/60' : 'text-muted'}`}>
        {label}
      </dt>
      <dd className="flex items-baseline gap-2">
        {children}
        {hint && <span className="text-[10px] text-muted/70">{hint}</span>}
      </dd>
    </div>
  );
}

function Section({ caption, side, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 px-0.5">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted">{caption}</span>
        {side && <span className="text-[10px] text-muted/80 font-mono">{side}</span>}
      </div>
      <div className="bg-paper border border-line rounded-lg shadow-sm">{children}</div>
    </div>
  );
}

function Empty({ children }) {
  return <div className="px-4 py-3 text-[11px] text-muted italic">{children}</div>;
}
