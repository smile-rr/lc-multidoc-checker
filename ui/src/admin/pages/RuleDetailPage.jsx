import React, { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore, transitionRule, updateRuleField } from '../store';
import { useRole } from '../RoleContext';
import { StateBadge } from '../components/StateBadge';

const CATEGORIES   = ['DATE', 'DOCSET', 'AMT', 'PARTY', 'GOODS', 'TRANS', 'INS', 'CERT', 'EXAM'];
const TIERS        = ['PROGRAMMATIC', 'AGENT', 'AGENT_TOOL', 'AGENTIC'];
const SEVERITIES   = ['CRITICAL', 'MAJOR', 'MINOR'];
const POLARITIES   = ['POSITIVE', 'NEGATIVE'];
const DOCTYPES     = ['LC', 'INV', 'BOL', 'PKL', 'BOE', 'BC', 'WC', 'INS'];

// Reasoning is N/A for deterministic SpEL; defaulted on for full tool-loop AGENTIC,
// off for single-call AGENT and one-round AGENT_TOOL.
const REASONING_DEFAULT = { AGENT: false, AGENT_TOOL: false, AGENTIC: true };
const reasoningEnabled = (rule) =>
  rule.reasoning !== undefined ? !!rule.reasoning : !!REASONING_DEFAULT[rule.check_type];

export function RuleDetailPage() {
  const { ruleId } = useParams();
  const rule       = useStore((s) => s.rules.find((r) => r.rule_id === ruleId));
  const refs       = useStore((s) => s.refs);
  const fields     = useStore((s) => s.fields);
  const allPrompts = useStore((s) => s.prompts.filter((p) => p.kind === 'check'));
  const prompt     = useStore((s) => s.prompts.find((p) => p.id === rule?.boundPromptId));
  const events     = useStore((s) => s.lifecycleEvents.filter((e) => e.artifact === 'rule' && e.artifactId === ruleId));
  const users      = useStore((s) => s.users);
  const { role, can } = useRole();
  const [showHist, setShowHist] = useState(false);

  if (!rule) return <div className="p-6 text-sm">Rule not found.</div>;

  const editable = can('rule.definition');
  const userById = (id) => users.find((u) => u.id === id);
  const set = (k, v) => updateRuleField(rule.rule_id, k, v, role.id);

  const next = { DRAFT: 'SUBMITTED', SUBMITTED: 'APPROVED', APPROVED: 'RELEASED' }[rule.state];
  const nextLabel = { SUBMITTED: 'Submit', APPROVED: 'Approve', RELEASED: 'Release' }[next];

  const showReasoning = rule.check_type !== 'PROGRAMMATIC';

  return (
    <div className="px-6 py-5 max-w-[1280px] mx-auto">
      {/* ── BREADCRUMB / STATE / ACTIONS ─────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs">
        <Link to="/admin/rules" className="text-muted hover:text-navy-1">← Rules</Link>
        <span className="text-muted">/</span>
        <span className="font-mono text-navy-1/80">{rule.rule_id}</span>
        <span className="ml-auto flex items-center gap-3">
          <StateBadge state={rule.state} />
          <span className="text-[10px] text-muted font-mono">v{rule.publishedVersion} · v{rule.workingVersion}</span>
          <button onClick={() => setShowHist((v) => !v)}
                  className="text-[11px] text-muted hover:text-teal-1">
            history ({events.length}) {showHist ? '▴' : '▾'}
          </button>
          {next && (
            <button
              onClick={() => transitionRule(rule.rule_id, next, role.id, `${role.role} action`)}
              className="text-xs px-3 py-1.5 bg-teal-1 text-white rounded hover:bg-teal-2 shadow-sm"
            >
              {nextLabel}
            </button>
          )}
        </span>
      </div>

      {showHist && (
        <div className="mt-2 bg-paper border border-line rounded px-3 py-2 text-[11px]">
          {events.length === 0 && <span className="text-muted">No history</span>}
          {events.map((e) => (
            <div key={e.id} className="flex gap-2 items-center py-0.5">
              <span className="font-mono text-muted w-32">{new Date(e.at).toLocaleString()}</span>
              {e.from && <StateBadge state={e.from} />}
              <span className="text-muted">→</span>
              <StateBadge state={e.to} />
              <span className="text-muted">@{userById(e.actor)?.name?.split(' ')[0] || e.actor}</span>
              <span className="text-muted truncate">{e.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── HERO: ID + NAME + SPEC LIST ─────────────────────────────────── */}
      <div className="mt-4 bg-paper border border-line rounded-lg shadow-sm">
        <div className="px-6 pt-5 pb-4 border-b border-line/70">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-base text-teal-1 tracking-tight">{rule.rule_id}</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted">rule definition</span>
          </div>
          <div className="mt-1.5">
            <NameInput value={rule.name} onSave={(v) => set('name', v)} disabled={!editable} />
          </div>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-x-12">
          <dl className="space-y-0">
            <Spec label="category">
              <SpecSelect value={rule.category}   options={CATEGORIES} onChange={(v) => set('category', v)}   editable={editable} />
            </Spec>
            <Spec label="tier">
              <SpecSelect value={rule.check_type} options={TIERS}      onChange={(v) => set('check_type', v)} editable={editable} />
            </Spec>
            <Spec label="severity">
              <SpecSelect value={rule.severity}   options={SEVERITIES} onChange={(v) => set('severity', v)}   editable={editable} />
            </Spec>
            <Spec label="polarity">
              <SpecSelect value={rule.polarity}   options={POLARITIES} onChange={(v) => set('polarity', v)}   editable={editable} />
            </Spec>
          </dl>
          <dl className="space-y-0">
            <Spec label="waivable">
              <SpecBool value={!!rule.waivable} onChange={(v) => set('waivable', v)} editable={editable} />
            </Spec>
            {showReasoning && (
              <Spec label="reasoning" hint="extended thinking on LLM call">
                <SpecBool value={reasoningEnabled(rule)} onChange={(v) => set('reasoning', v)} editable={editable} />
              </Spec>
            )}
            <Spec label="enabled">
              <SpecBool value={rule.enabled !== false} onChange={(v) => set('enabled', v)} editable={editable} />
            </Spec>
            <Spec label="last edit" muted>
              <span className="text-[11px] text-muted">
                {new Date(rule.lastEditedAt).toLocaleDateString()} · @{userById(rule.lastEditedBy)?.name?.split(' ')[0] || rule.lastEditedBy}
              </span>
            </Spec>
          </dl>
        </div>
      </div>

      {/* ── DEFINITION ──────────────────────────────────────────────────── */}
      <Section caption="Definition" className="mt-5">
        <div className="grid grid-cols-12 divide-x divide-line/70">
          <DefField className="col-span-3" label="applies_to">
            <ChipSet values={rule.applies_to || []} options={DOCTYPES}
                     onChange={(v) => set('applies_to', v)} kind="doc" disabled={!editable} />
          </DefField>
          <DefField className="col-span-4" label="lc_fields_required">
            <ChipSet values={rule.lc_fields_required || []}
                     options={fields.filter((f) => (f.applies_to || []).includes('LC')).map((f) => f.key)}
                     onChange={(v) => set('lc_fields_required', v)}
                     kind="lc" disabled={!editable} />
          </DefField>
          <DefField className="col-span-5" label="field_keys">
            <ChipSet values={rule.field_keys || []}
                     options={fields.map((f) => f.key)}
                     onChange={(v) => set('field_keys', v)}
                     kind="lc" disabled={!editable} />
          </DefField>
        </div>
      </Section>

      {/* ── IMPLEMENTATION + CITATIONS ──────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-12 gap-5 items-start">
        <div className="col-span-7">
          <Section caption="Implementation"
                   side={rule.check_type === 'PROGRAMMATIC' ? 'SpEL' : 'Prompt template'}>
            <ImplementationCard
              rule={rule}
              prompt={prompt}
              allPrompts={allPrompts}
              editable={editable}
              onBind={(promptId) => set('boundPromptId', promptId || null)}
              onSaveExpression={(v) => set('expression', v)}
            />
          </Section>
        </div>
        <div className="col-span-5">
          <Section caption="Citations"
                   side={`${(rule.ucp_refs?.length || 0)} UCP · ${(rule.isbp_refs?.length || 0)} ISBP`}>
            <CitationsCard
              rule={rule}
              refs={refs}
              editable={editable}
              onAdd={(kind, id) => {
                const key = kind === 'UCP' ? 'ucp_refs' : 'isbp_refs';
                const arr = rule[key] || [];
                if (!arr.includes(id)) set(key, [...arr, id]);
              }}
              onRemove={(kind, id) => {
                const key = kind === 'UCP' ? 'ucp_refs' : 'isbp_refs';
                set(key, (rule[key] || []).filter((x) => x !== id));
              }}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ caption, side, className = '', children }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-1.5 px-0.5">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted">{caption}</span>
        {side && <span className="text-[10px] text-muted/80">{side}</span>}
      </div>
      <div className="bg-paper border border-line rounded-lg shadow-sm">{children}</div>
    </div>
  );
}

function DefField({ label, children, className = '' }) {
  return (
    <div className={`${className} px-4 py-3`}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted/80 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function NameInput({ value, onSave, disabled }) {
  const [v, setV] = useState(value ?? '');
  React.useEffect(() => setV(value ?? ''), [value]);
  return (
    <input
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      className="w-full text-xl text-navy-1 font-serif bg-transparent border-0 border-b border-transparent hover:border-line focus:border-teal-1 focus:outline-none px-0 py-0.5"
      style={{ fontFamily: 'ui-serif, Georgia, serif' }}
    />
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

function SpecSelect({ value, options, onChange, editable }) {
  return (
    <select
      value={value || ''}
      disabled={!editable}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono text-[12px] text-navy-1 bg-transparent border-0 hover:text-teal-1 focus:text-teal-1 focus:outline-none cursor-pointer disabled:cursor-default disabled:hover:text-navy-1 -ml-0.5 pr-2 min-w-[8rem]"
    >
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

function SpecBool({ value, onChange, editable }) {
  return (
    <select
      value={value ? 'yes' : 'no'}
      disabled={!editable}
      onChange={(e) => onChange(e.target.value === 'yes')}
      className={`font-mono text-[12px] bg-transparent border-0 hover:text-teal-1 focus:text-teal-1 focus:outline-none cursor-pointer disabled:cursor-default -ml-0.5 pr-2 min-w-[8rem] ${value ? 'text-navy-1' : 'text-muted'}`}
    >
      <option value="yes">yes</option>
      <option value="no">no</option>
    </select>
  );
}

// ─── PRIMITIVES ──────────────────────────────────────────────────────────

function ChipSet({ values, options, onChange, kind = 'lc', disabled, small, onChipClick }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const remaining = (options || []).filter((o) => !values.includes(o));
  const matches = q ? remaining.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : remaining;
  const cls = {
    lc:   'bg-teal-1/10 text-teal-1 border-teal-1/30',
    doc:  'bg-purple-50 text-purple-700 border-purple-200',
    ref:  'bg-blue-50 text-blue-700 border-blue-200',
  }[kind];
  const sz = small ? 'text-[9px]' : 'text-[10px]';

  return (
    <div className="flex flex-wrap items-center gap-1">
      {values.map((v) => (
        <span key={v} className={`group inline-flex items-center gap-0.5 ${sz} font-mono px-1.5 py-0.5 rounded border ${cls}`}>
          <button type="button" disabled={!onChipClick} onClick={() => onChipClick?.(v)}
                  className={onChipClick ? 'hover:underline' : 'cursor-default'}>{v}</button>
          {!disabled && (
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}
                    className="opacity-40 hover:opacity-100 hover:text-status-red ml-0.5">×</button>
          )}
        </span>
      ))}
      {!disabled && !adding && (
        <button onClick={() => setAdding(true)} className={`${sz} font-mono px-1.5 py-0.5 rounded border border-dashed border-line text-muted hover:border-teal-1 hover:text-teal-1`}>
          +
        </button>
      )}
      {adding && (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            onBlur={() => setTimeout(() => setAdding(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && q) { onChange([...values, q]); setQ(''); }
              if (e.key === 'Escape') setAdding(false);
            }}
            placeholder="type or pick…"
            className={`${sz} font-mono border border-line rounded px-1 py-0.5 w-32 focus:outline-none focus:border-teal-1`}
          />
          {matches.length > 0 && (
            <span className="relative">
              <span className="absolute left-0 top-5 z-10 bg-paper border border-line rounded shadow max-h-44 overflow-auto w-44">
                {matches.slice(0, 12).map((o) => (
                  <button key={o} onMouseDown={() => { onChange([...values, o]); setQ(''); setAdding(false); }}
                          className={`block w-full text-left ${sz} font-mono px-2 py-0.5 hover:bg-teal-1/10`}>
                    {o}
                  </button>
                ))}
              </span>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// ─── IMPLEMENTATION + CITATIONS (reference cards, not editors) ──────────

function ImplementationCard({ rule, prompt, allPrompts, editable, onBind, onSaveExpression }) {
  const usesPrompt = rule.check_type !== 'PROGRAMMATIC';
  const [picking, setPicking] = useState(false);
  const [editingExpr, setEditingExpr] = useState(false);
  const [exprDraft, setExprDraft] = useState(rule.expression || '');
  React.useEffect(() => setExprDraft(rule.expression || ''), [rule.expression]);

  return (
    <div className="bg-paper border border-line rounded">
      <div className="px-3 py-1.5 border-b border-line flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted">Implementation</span>
        <span className="text-[10px] font-mono text-muted">
          {usesPrompt ? 'prompt template (referenced)' : 'SpEL expression (inline)'}
        </span>
      </div>

      {/* AGENT-family: reference to a prompt template */}
      {usesPrompt && (
        <div className="p-3">
          {prompt ? (
            <div className="flex items-center gap-2">
              <Link to={`/admin/prompts/${encodeURIComponent(prompt.id)}`}
                    className="font-mono text-[12px] text-teal-1 hover:underline truncate">
                {prompt.tokenizedPath || prompt.path}
              </Link>
              <StateBadge state={prompt.state} />
              <span className="text-[10px] text-muted">v{prompt.version}</span>
              <span className="ml-auto flex gap-2">
                <Link to={`/admin/prompts/${encodeURIComponent(prompt.id)}`}
                      className="text-[11px] text-teal-1 hover:underline">Open editor →</Link>
                {editable && (
                  <button onClick={() => setPicking((v) => !v)}
                          className="text-[11px] text-muted hover:text-navy-1">change</button>
                )}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-status-gold">
              <span>No prompt bound.</span>
              {editable && (
                <button onClick={() => setPicking(true)} className="text-teal-1 hover:underline">bind a prompt</button>
              )}
            </div>
          )}

          {picking && (
            <PromptPicker
              currentId={prompt?.id}
              prompts={allPrompts}
              onPick={(id) => { onBind(id); setPicking(false); }}
              onCancel={() => setPicking(false)}
            />
          )}
        </div>
      )}

      {/* PROGRAMMATIC: SpEL expression inline (it IS the implementation, no external file) */}
      {!usesPrompt && (
        <div className="p-3">
          {!editingExpr ? (
            <pre className="text-[11px] font-mono bg-slate2/50 border border-line/60 rounded p-2.5 whitespace-pre-wrap leading-relaxed">
              {rule.expression?.trim() || <span className="text-muted italic">no expression</span>}
            </pre>
          ) : (
            <textarea
              value={exprDraft} rows={6} spellCheck={false}
              onChange={(e) => setExprDraft(e.target.value)}
              className="w-full text-[11px] font-mono border border-line rounded p-2 bg-slate2/40 focus:outline-none focus:border-teal-1"
            />
          )}
          {editable && (
            <div className="flex gap-2 mt-2">
              {!editingExpr && (
                <button onClick={() => setEditingExpr(true)} className="text-[11px] text-teal-1 hover:underline">edit SpEL</button>
              )}
              {editingExpr && (
                <>
                  <button
                    onClick={() => { onSaveExpression(exprDraft); setEditingExpr(false); }}
                    className="text-[11px] px-2 py-0.5 bg-teal-1 text-white rounded">Save</button>
                  <button
                    onClick={() => { setExprDraft(rule.expression || ''); setEditingExpr(false); }}
                    className="text-[11px] px-2 py-0.5 border border-line rounded">Cancel</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PromptPicker({ currentId, prompts, onPick, onCancel }) {
  const [q, setQ] = useState('');
  const matches = prompts.filter((p) =>
    !q || `${p.path} ${p.id} ${p.boundRuleId || ''}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="mt-2 border border-line rounded bg-slate2/40">
      <div className="px-2 py-1.5 border-b border-line flex items-center gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="search prompt template…"
               className="flex-1 text-[11px] font-mono border border-line rounded px-1.5 py-0.5 bg-paper focus:outline-none focus:border-teal-1" />
        <button onClick={onCancel} className="text-[11px] text-muted">cancel</button>
        {currentId && (
          <button onClick={() => onPick(null)} className="text-[11px] text-status-red hover:underline">unbind</button>
        )}
      </div>
      <div className="max-h-56 overflow-auto">
        {matches.map((p) => (
          <button key={p.id} onClick={() => onPick(p.id)}
                  className={`w-full text-left px-2 py-1 hover:bg-teal-1/10 border-b border-line/40 last:border-b-0 flex items-center gap-2 ${p.id === currentId ? 'bg-teal-1/5' : ''}`}>
            <span className="font-mono text-[10px] text-teal-1 truncate flex-1">{p.path}</span>
            <StateBadge state={p.state} />
            {p.boundRuleId && p.boundRuleId !== '' && (
              <span className="text-[9px] font-mono text-muted">bound: {p.boundRuleId}</span>
            )}
          </button>
        ))}
        {matches.length === 0 && <div className="px-2 py-2 text-[11px] text-muted italic">no match</div>}
      </div>
    </div>
  );
}

function CitationsCard({ rule, refs, editable, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const all = [...refs.ucp600, ...refs.isbp821];
  const cite = (id) => all.find((x) => x.id === id);

  return (
    <div className="bg-paper border border-line rounded">
      <div className="px-3 py-1.5 border-b border-line flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted">Citations</span>
        <span className="text-[10px] text-muted">
          {(rule.ucp_refs?.length || 0)} UCP · {(rule.isbp_refs?.length || 0)} ISBP
        </span>
        {editable && !adding && (
          <button onClick={() => setAdding(true)}
                  className="ml-auto text-[11px] text-teal-1 hover:underline">+ add</button>
        )}
      </div>

      {adding && (
        <CitationAdderInline
          rule={rule}
          refs={refs}
          onAdd={(kind, id) => { onAdd(kind, id); }}
          onClose={() => setAdding(false)}
        />
      )}

      <div className="p-3 flex flex-wrap gap-1.5">
        {(rule.ucp_refs || []).length === 0 && (rule.isbp_refs || []).length === 0 && (
          <span className="text-[11px] text-muted italic">No citations declared.</span>
        )}
        {(rule.ucp_refs || []).map((id) => (
          <CitationLink key={id} kind="UCP" id={id} article={cite(id)}
                        editable={editable} onRemove={() => onRemove('UCP', id)} />
        ))}
        {(rule.isbp_refs || []).map((id) => (
          <CitationLink key={id} kind="ISBP" id={id} article={cite(id)}
                        editable={editable} onRemove={() => onRemove('ISBP', id)} />
        ))}
      </div>
    </div>
  );
}

function CitationLink({ kind, id, article, editable, onRemove }) {
  const tone = kind === 'UCP'
    ? 'text-status-blue bg-status-blueSoft border-status-blue/40 hover:bg-status-blue hover:text-white'
    : 'text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-700 hover:text-white';
  const heading = article?.heading;
  return (
    <RefHover kind={kind} id={id} article={article}>
      <span className="inline-flex items-stretch border border-line rounded overflow-hidden bg-paper text-[11px]">
        <Link to={`/admin/refs?id=${id}`}
              className={`font-mono px-1.5 py-0.5 transition ${tone}`}>
          {id}
        </Link>
        {heading && (
          <Link to={`/admin/refs?id=${id}`}
                className="px-2 py-0.5 truncate max-w-[260px] hover:bg-slate2 text-navy-1/85 border-l border-line">
            {heading}
          </Link>
        )}
        {editable && (
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
                  className="px-1.5 text-muted hover:text-status-red border-l border-line"
                  title="remove citation">×</button>
        )}
      </span>
    </RefHover>
  );
}

// Hover popover — quick article description without leaving the page.
// pointer-events-none on the popover so cursor can't drift onto it; the trigger
// span still receives mouseleave correctly. Closes when mouse leaves trigger.
function RefHover({ kind, id, article, children }) {
  const [open, setOpen] = useState(false);
  const enterT = useRef(null);
  const leaveT = useRef(null);
  const onEnter = () => {
    clearTimeout(leaveT.current);
    enterT.current = setTimeout(() => setOpen(true), 180);
  };
  const onLeave = () => {
    clearTimeout(enterT.current);
    leaveT.current = setTimeout(() => setOpen(false), 80);
  };
  const accent = kind === 'UCP' ? 'text-status-blue' : 'text-purple-700';

  return (
    <span className="relative inline-flex" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute z-40 bottom-full left-0 mb-2 w-[320px] pointer-events-none"
        >
          <span className="block bg-paper border border-line rounded-lg shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)] p-3">
            <span className="flex items-baseline gap-2 mb-1.5">
              <span className={`font-mono text-[10px] ${accent}`}>{id}</span>
              {article?.heading && (
                <span className="text-[11px] font-medium text-navy-1 truncate">{article.heading}</span>
              )}
              <span className="ml-auto text-[9px] uppercase tracking-[0.18em] text-muted/70">
                {kind === 'UCP' ? 'UCP 600' : 'ISBP 821'}
              </span>
            </span>
            {article?.text ? (
              <span className="block text-[11px] leading-relaxed text-navy-1/85 italic font-serif"
                    style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
                "{article.text}"
              </span>
            ) : (
              <span className="block text-[11px] text-muted italic">
                Not found in golden source.
              </span>
            )}
            <span className="block mt-2 text-[10px] text-muted/80">
              click chip → open in golden-source browser
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

function CitationAdderInline({ rule, refs, onAdd, onClose }) {
  const [kind, setKind] = useState('UCP');
  const [q, setQ] = useState('');
  const list = (kind === 'UCP' ? refs.ucp600 : refs.isbp821) || [];
  const have = new Set([...(rule.ucp_refs || []), ...(rule.isbp_refs || [])]);
  const matches = list.filter((r) => !have.has(r.id) &&
    (`${r.id} ${r.heading || ''} ${r.text || ''}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="border-b border-line bg-slate2/40 px-3 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <select value={kind} onChange={(e) => setKind(e.target.value)}
                className="text-[10px] font-mono border border-line rounded px-1 py-0.5">
          <option>UCP</option><option>ISBP</option>
        </select>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => e.key === 'Escape' && onClose()}
               placeholder={`search ${kind} 600 / ISBP 821 — id, heading, text…`}
               className="flex-1 text-[11px] font-mono border border-line rounded px-1.5 py-0.5 bg-paper focus:outline-none focus:border-teal-1" />
        <button onClick={onClose} className="text-[10px] text-muted">close</button>
      </div>
      <div className="max-h-48 overflow-auto bg-paper border border-line rounded">
        {matches.slice(0, 30).map((r) => (
          <button key={r.id} onClick={() => onAdd(kind, r.id)}
                  className="block w-full text-left px-2 py-1 hover:bg-teal-1/10 border-b border-line/40 last:border-b-0">
            <span className="font-mono text-[10px] text-teal-1">{r.id}</span>
            <span className="text-[11px] ml-1.5">{r.heading}</span>
            {r.text && <div className="text-[10px] text-muted truncate">{r.text}</div>}
          </button>
        ))}
        {matches.length === 0 && <div className="px-2 py-2 text-[11px] text-muted italic">no match</div>}
      </div>
    </div>
  );
}

