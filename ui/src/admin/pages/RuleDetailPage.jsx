import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore, transitionRule, updateRuleField } from '../store';
import { useRole } from '../RoleContext';
import { StateBadge, SeverityBadge, TierBadge } from '../components/StateBadge';
import { HighlightedViewer, PROSE_LEGEND } from '../components/HighlightedEditor';
import { ResolvedPreview } from '../components/ResolvedPreview';
import { EvalSection } from '../components/EvalSection';
import { HealthChips } from '../components/HealthChips';

export function RuleDetailPage() {
  const { ruleId } = useParams();
  const rule = useStore((s) => s.rules.find((r) => r.rule_id === ruleId));
  const refs = useStore((s) => s.refs);
  const events = useStore((s) => s.lifecycleEvents.filter((e) => e.artifact === 'rule' && e.artifactId === ruleId));
  const prompt = useStore((s) => s.prompts.find((p) => p.id === rule?.boundPromptId));
  const users = useStore((s) => s.users);
  const { role, can } = useRole();
  const [tab, setTab] = useState('definition');

  if (!rule) return <div className="p-6 text-sm">Rule not found.</div>;

  const cite = (id) => {
    const all = [...refs.ucp600, ...refs.isbp821];
    return all.find((x) => x.id === id);
  };
  const userById = (id) => users.find((u) => u.id === id);

  const editable = can('rule.definition') && rule.state !== 'PUBLISHED' && rule.state !== 'STAGED';
  const canReview = can('rule.review.approve');

  const next = {
    DRAFT: 'IN_REVIEW',
    IN_REVIEW: 'STAGED',
    STAGED: 'PUBLISHED',
  }[rule.state];
  const nextLabel = {
    IN_REVIEW: 'Submit for review',
    STAGED: 'Approve & stage',
    PUBLISHED: 'Publish',
  }[next];
  const nextAllowed =
    (next === 'IN_REVIEW' && can('rule.definition')) ||
    (next === 'STAGED' && canReview) ||
    (next === 'PUBLISHED' && can('lifecycle.publish'));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link to="/admin/rules" className="text-xs text-muted hover:text-navy-1">← Rules</Link>

      {/* Header */}
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-sm">{rule.rule_id}</span>
            {rule.category && (
              <span className="text-[10px] uppercase tracking-wider bg-slate2 border border-line text-muted px-1.5 py-0.5 rounded font-mono">
                {rule.category}
              </span>
            )}
            <StateBadge state={rule.state} />
            <TierBadge type={rule.check_type} />
            <SeverityBadge severity={rule.severity} />
            <HealthChips signals={rule.health_signals} layout="dots" />
            <span className="text-[10px] text-muted">v{rule.publishedVersion} published · v{rule.workingVersion} working</span>
          </div>
          <h1 className="text-2xl font-serif" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>{rule.name}</h1>
        </div>
        <div className="flex gap-2 shrink-0">
          {next && (
            <button
              disabled={!nextAllowed}
              onClick={() => transitionRule(rule.rule_id, next, role.id, `${role.role} action`)}
              className={`text-xs px-3 py-1.5 rounded transition ${
                nextAllowed
                  ? 'bg-teal-1 text-white hover:bg-teal-2 shadow-sm'
                  : 'bg-slate-100 text-muted cursor-not-allowed border border-line'
              }`}
              title={!nextAllowed ? `Requires a different role (current: ${role.role})` : ''}
            >
              {nextLabel}
            </button>
          )}
          {rule.state === 'DRAFT' && (
            <button
              onClick={() => transitionRule(rule.rule_id, 'PUBLISHED', role.id, 'Reverted')}
              className="text-xs px-3 py-1.5 border border-line rounded hover:bg-slate2"
              title="Discard draft"
            >
              Discard
            </button>
          )}
        </div>
      </div>

      {/* Provenance strip */}
      <div className="mt-4 bg-paper border border-line rounded p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Provenance</div>
        <div className="flex items-center gap-3 overflow-x-auto">
          {events.length === 0 && <span className="text-xs text-muted">No history</span>}
          {events.slice().reverse().map((e, i) => (
            <React.Fragment key={e.id}>
              {i > 0 && <span className="text-muted text-xs">·</span>}
              <div className="flex flex-col items-center text-center min-w-[100px]">
                <StateBadge state={e.to} />
                <span className="text-[10px] text-muted mt-1">{new Date(e.at).toLocaleDateString()}</span>
                <span className="text-[10px] font-medium">{userById(e.actor)?.name?.split(' ')[0] || e.actor}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-line flex gap-4 text-xs">
        {['definition', 'citations', 'prompt', 'eval', 'health'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 border-b-2 -mb-px transition ${
              tab === t ? 'border-teal-1 text-teal-1 font-medium' : 'border-transparent text-muted hover:text-navy-1'
            }`}
          >
            {t === 'definition' && 'Definition'}
            {t === 'citations' && `Citations (${(rule.ucp_refs?.length || 0) + (rule.isbp_refs?.length || 0)})`}
            {t === 'prompt' && (rule.boundPromptId ? 'Bound prompt' : 'No prompt (SpEL)')}
            {t === 'eval' && `Eval (${rule.eval_cases?.length || 0})`}
            {t === 'health' && 'Health'}
          </button>
        ))}
      </div>

      {tab === 'definition' && (
        <div className="grid grid-cols-3 gap-6 mt-4">
          <div className="col-span-2 space-y-3">
            <Field label="Display name" value={rule.name} editable={editable}
                   onSave={(v) => updateRuleField(rule.rule_id, 'name', v, role.id)} />
            <Field label="Canonical field" value={rule.canonical_field} mono />
            <Field label="Severity" value={rule.severity} editable={editable} options={['CRITICAL', 'MAJOR', 'MINOR']}
                   onSave={(v) => updateRuleField(rule.rule_id, 'severity', v, role.id)} />
            <Field label="Polarity" value={rule.polarity} editable={editable} options={['POSITIVE', 'NEGATIVE']}
                   onSave={(v) => updateRuleField(rule.rule_id, 'polarity', v, role.id)} />
            <Field label="Waivable" value={String(rule.waivable)} editable={editable} options={['true', 'false']}
                   onSave={(v) => updateRuleField(rule.rule_id, 'waivable', v === 'true', role.id)} />
            <Field label="Applies to" value={(rule.applies_to || []).join(', ')} mono />
            <Field label="Trigger docs" value={(rule.trigger_docs || []).join(', ') || '—'} mono />
            <Field label="LC fields required" value={(rule.lc_fields_required || []).join(', ') || '—'} mono />
            <Field label="UCP excerpt (LLM context)"
                   value={rule.ucp_excerpt} multiline editable={editable}
                   onSave={(v) => updateRuleField(rule.rule_id, 'ucp_excerpt', v, role.id)} />
          </div>
          <aside className="col-span-1">
            <div className="bg-paper border border-line rounded p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Token contract</div>
              <p className="text-[11px] text-muted leading-relaxed mb-2">
                What the bound prompt may inject as <code className="font-mono">{`{{...}}`}</code> tokens.
                The runtime validates the prompt against this list.
              </p>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Allowed fields</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {(rule.field_keys || []).length === 0 && <span className="text-[10px] text-muted italic">none declared</span>}
                {(rule.field_keys || []).map((k) => (
                  <span key={k} className="text-[10px] font-mono bg-teal-1/10 text-teal-1 border border-teal-1/30 px-1.5 py-0.5 rounded">{k}</span>
                ))}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Allowed citations</div>
              <div className="flex flex-wrap gap-1">
                {(rule.ucp_refs || []).map((id) => (
                  <span key={id} className="text-[10px] font-mono bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded">{id}</span>
                ))}
                {(rule.isbp_refs || []).map((id) => (
                  <span key={id} className="text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">{id}</span>
                ))}
              </div>
            </div>

            <div className="bg-paper border border-line rounded p-3 mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Ownership</div>
              <p className="text-xs leading-relaxed">
                Compliance Lead owns the <strong>meaning</strong>, <strong>severity</strong>,
                and <strong>citations</strong>. Engineering owns the prompt body that
                consumes these fields at runtime.
              </p>
              {!editable && (
                <p className="text-[10px] text-status-gold mt-2">
                  ✎ Edits forking from a published rule auto-create a new draft.
                </p>
              )}
            </div>
            <div className="bg-paper border border-line rounded p-3 mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Last edited</div>
              <div className="text-xs">{userById(rule.lastEditedBy)?.name || rule.lastEditedBy}</div>
              <div className="text-[10px] text-muted">{new Date(rule.lastEditedAt).toLocaleString()}</div>
            </div>
          </aside>
        </div>
      )}

      {tab === 'citations' && (
        <div className="mt-4 space-y-3">
          {[...(rule.ucp_refs || []).map((id) => ({ id, kind: 'UCP' })),
            ...(rule.isbp_refs || []).map((id) => ({ id, kind: 'ISBP' }))].map(({ id, kind }) => {
              const ref = cite(id);
              if (!ref) return null;
              return (
                <div key={id} className="bg-paper border border-line rounded p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      kind === 'UCP' ? 'bg-status-blueSoft text-status-blue' : 'bg-purple-50 text-purple-700'
                    }`}>{ref.id}</span>
                    <span className="text-xs font-medium">{ref.heading}</span>
                  </div>
                  <p className="text-xs text-navy-1 leading-relaxed font-serif" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
                    "{ref.text}"
                  </p>
                </div>
              );
          })}
        </div>
      )}

      {tab === 'eval' && (
        <div className="mt-4">
          <EvalSection rule={rule} />
        </div>
      )}

      {tab === 'health' && (
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-paper border border-line rounded p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-3">Production telemetry (last 30 days)</div>
            <HealthChips signals={rule.health_signals} layout="inline" />
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              Eval = agreement on golden case set ·
              Override = officer reverted verdict ·
              Doubts = LLM returned DOUBTS ·
              p95 = 95th-percentile latency ·
              Cost = average per check (LLM-tier only).
            </p>
            <div className="text-[10px] uppercase tracking-wider text-muted mt-4 mb-2">Action thresholds</div>
            <ul className="text-[11px] text-muted space-y-0.5">
              <li>Override rate &gt; 15% → flag for review (rule may be misaligned with examiner judgement)</li>
              <li>Doubts rate &gt; 25% → prompt under-specified; tighten decision rules</li>
              <li>Eval pass rate &lt; 95% → block re-publish until prompt is fixed or eval set re-curated</li>
            </ul>
          </div>
          <aside className="col-span-1 bg-paper border border-line rounded p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Policy overlays</div>
            {Object.keys(rule.policy_overlays || {}).length === 0 ? (
              <p className="text-[11px] text-muted">No jurisdictional overlays. Base policy applies in all markets.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(rule.policy_overlays).map(([k, v]) => (
                  <li key={k} className="text-[11px]">
                    <span className="font-mono text-[10px] bg-slate2 border border-line px-1 rounded">{k}</span>
                    <p className="text-muted mt-0.5">{v.note || JSON.stringify(v)}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-muted mt-3 leading-relaxed">
              Resolver picks overlay based on issuing-bank country at runtime; falls back to base policy when no overlay matches.
            </p>
          </aside>
        </div>
      )}

      {tab === 'prompt' && (
        <div className="mt-4">
          {!rule.boundPromptId && (
            <div className="bg-paper border border-line rounded p-6 text-center text-sm text-muted">
              This rule is evaluated by a SpEL expression — no LLM prompt is bound.
              <pre className="mt-3 text-[11px] font-mono bg-slate2 p-3 rounded text-left overflow-x-auto">{rule.expression}</pre>
            </div>
          )}
          {rule.boundPromptId && prompt && (
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 bg-paper border border-line rounded">
                <div className="flex items-center justify-between border-b border-line px-3 py-1.5 gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted">Prompt body</span>
                    <span className="font-mono text-[10px] text-muted">
                      {prompt.tokenizedBody ? prompt.tokenizedPath : prompt.path}
                    </span>
                    <StateBadge state={prompt.state} />
                    {prompt.tokenizedBody && (
                      <span className="text-[9px] uppercase tracking-wider text-teal-1 bg-teal-1/10 border border-teal-1/30 rounded px-1.5 py-0.5">
                        Tokenized
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-1 overflow-x-auto justify-end">
                    {PROSE_LEGEND.map((l) => (
                      <span key={l.kind} className={`text-[10px] font-mono px-1 rounded border ${l.cls}`}>
                        {l.label}
                      </span>
                    ))}
                  </div>
                  <Link to={`/admin/prompts/${encodeURIComponent(prompt.id)}`}
                        className="text-[11px] text-teal-1 hover:underline shrink-0">Open in editor →</Link>
                </div>
                <HighlightedViewer value={prompt.tokenizedBody || prompt.body} rows={18} />
                {prompt.tokenizedBody && (
                  <ResolvedPreview template={prompt.tokenizedBody} rule={rule} />
                )}
              </div>
              <aside className="bg-paper border border-line rounded p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Cross-lane gate</div>
                <p className="text-xs leading-relaxed">
                  Bound prompt is currently <StateBadge state={prompt.state} />.
                  {prompt.state !== 'PUBLISHED' && (
                    <span className="text-status-red"> Rule cannot be published until prompt is published.</span>
                  )}
                </p>
                <div className="text-[10px] uppercase tracking-wider text-muted mt-3 mb-1">Field keys consumed</div>
                <div className="flex flex-wrap gap-1">
                  {(rule.field_keys || []).map((k) => (
                    <span key={k} className="text-[10px] font-mono bg-slate2 px-1.5 py-0.5 rounded border border-line">{k}</span>
                  ))}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted mt-3 mb-1">Read-only here</div>
                <p className="text-[10px] text-muted leading-relaxed">
                  Compliance reviews — never edits. Prompt body is owned by the
                  Prompt Engineer. Use "Open in editor" to switch lanes.
                </p>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, editable, multiline, mono, options, onSave }) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);

  if (!editable || !editing) {
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5 flex items-center gap-2">
          {label}
          {editable && (
            <button onClick={() => setEditing(true)} className="text-teal-1 normal-case tracking-normal text-[10px]">edit</button>
          )}
        </div>
        <div className={`text-xs ${mono ? 'font-mono' : ''} ${multiline ? 'whitespace-pre-wrap' : ''}`}>
          {value || <span className="text-muted">—</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">{label}</div>
      {options ? (
        <select value={v} onChange={(e) => setV(e.target.value)}
                className="text-xs border border-line rounded px-2 py-1 w-full">
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : multiline ? (
        <textarea value={v} onChange={(e) => setV(e.target.value)} rows={4}
                  className="text-xs border border-line rounded px-2 py-1 w-full font-serif" />
      ) : (
        <input value={v} onChange={(e) => setV(e.target.value)}
               className="text-xs border border-line rounded px-2 py-1 w-full" />
      )}
      <div className="flex gap-1 mt-1">
        <button onClick={() => { onSave(v); setEditing(false); }}
                className="text-[10px] px-2 py-0.5 bg-teal-1 hover:bg-teal-2 text-white rounded">Save</button>
        <button onClick={() => { setV(value); setEditing(false); }}
                className="text-[10px] px-2 py-0.5 border border-line rounded">Cancel</button>
      </div>
    </div>
  );
}
