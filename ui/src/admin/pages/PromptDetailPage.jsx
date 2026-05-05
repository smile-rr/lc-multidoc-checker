import React, { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore, transitionPrompt, updatePromptBody } from '../store';
import { useRole } from '../RoleContext';
import { StateBadge } from '../components/StateBadge';
import { HighlightedEditor, HighlightedViewer, PROSE_LEGEND } from '../components/HighlightedEditor';
import { TokenPalette } from '../components/TokenPalette';
import { ResolvedPreview } from '../components/ResolvedPreview';

export function PromptDetailPage() {
  const { '*': pathRest } = useParams();
  const id = pathRest;
  const prompt = useStore((s) => s.prompts.find((p) => p.id === id));
  const rule = useStore((s) => s.rules.find((r) => r.boundPromptId === id));
  const events = useStore((s) => s.lifecycleEvents.filter((e) => e.artifact === 'prompt' && e.artifactId === id));
  const users = useStore((s) => s.users);
  const { role, can } = useRole();
  const hasTokenized = !!prompt?.tokenizedBody;
  const [view, setView] = useState(hasTokenized ? 'tokenized' : 'production');
  const [body, setBody] = useState(prompt?.body || '');
  const [tokenizedBody, setTokenizedBody] = useState(prompt?.tokenizedBody || '');
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef(null);

  if (!prompt) {
    return (
      <div className="p-6">
        <Link to="/admin/prompts" className="text-xs text-muted">← Prompts</Link>
        <div className="mt-4 text-sm">Prompt not found: <span className="font-mono">{id}</span></div>
      </div>
    );
  }

  const userById = (uid) => users.find((u) => u.id === uid);
  const editable = can('prompt.body') || can('system.prompt');
  const tokenCount = (body.match(/\{\{[^}]+\}\}/g) || []).length;
  const next = { DRAFT: 'SUBMITTED', SUBMITTED: 'APPROVED', APPROVED: 'RELEASED' }[prompt.state];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Link to="/admin/prompts" className="text-xs text-muted hover:text-navy-1">← Prompts</Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm">{prompt.path}</span>
            <StateBadge state={prompt.state} />
            <span className="text-[10px] text-muted">v{prompt.version}</span>
          </div>
          <h1 className="text-xl font-serif" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
            {prompt.kind === 'check' && 'Check prompt'}
            {prompt.kind === 'extract' && 'Vision extraction prompt'}
            {prompt.kind === 'system' && 'System prompt'}
          </h1>
        </div>
        <div className="flex gap-2 shrink-0">
          {dirty && (
            <button
              onClick={() => { updatePromptBody(prompt.id, body, role.id); setDirty(false); }}
              className="text-xs px-3 py-1.5 bg-teal-1 text-white rounded hover:bg-teal-2 shadow-sm transition"
            >
              Save draft
            </button>
          )}
          {next && !dirty && (
            <button
              onClick={() => transitionPrompt(prompt.id, next, role.id, `${role.role} action`)}
              className="text-xs px-3 py-1.5 bg-teal-1 text-white rounded hover:bg-teal-2 shadow-sm transition"
            >
              {next === 'SUBMITTED' ? 'Submit' : next === 'APPROVED' ? 'Approve' : 'Release'}
            </button>
          )}
        </div>
      </div>

      {hasTokenized && (
        <div className="mt-3 inline-flex items-center bg-paper border border-line rounded p-0.5 text-xs">
          {[
            { id: 'production', label: 'Production prose' },
            { id: 'tokenized',  label: 'Tokenized (proposed)' },
            { id: 'resolved',   label: 'Resolved preview' },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`px-3 py-1 rounded transition ${
                view === v.id
                  ? 'bg-teal-1 text-white shadow-sm'
                  : 'text-navy-1/70 hover:text-navy-1'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4 mt-4">
        <div className="col-span-8">
          <div className="bg-paper border border-line rounded">
            <div className="flex items-center justify-between border-b border-line px-3 py-1.5 gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-muted">Body</span>
                {hasTokenized && view !== 'production' && (
                  <span className="text-[10px] font-mono text-muted">
                    {view === 'tokenized' ? prompt.tokenizedPath : 'rendered with sample data'}
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
              <div className="text-[10px] font-mono text-muted shrink-0">
                {(view === 'tokenized' ? tokenizedBody : body).split('\n').length} lines
              </div>
            </div>
            {view === 'production' && (
              <HighlightedEditor
                ref={editorRef}
                value={body}
                onChange={(v) => { setBody(v); setDirty(true); }}
                disabled={!editable}
                rows={28}
              />
            )}
            {view === 'tokenized' && (
              <HighlightedEditor
                ref={editorRef}
                value={tokenizedBody}
                onChange={(v) => { setTokenizedBody(v); setDirty(true); }}
                disabled={!editable}
                rows={28}
              />
            )}
            {view === 'resolved' && rule && (
              <ResolvedPreview template={tokenizedBody} rule={rule} />
            )}
            {view === 'resolved' && !rule && (
              <div className="p-6 text-xs text-muted">No rule binding — resolved preview requires a bound rule.</div>
            )}
          </div>

          {!editable && (
            <p className="text-[10px] text-status-gold mt-2">
              ✎ Read-only as <strong>{role.role}</strong>. Switch to Prompt Engineer to edit.
            </p>
          )}

          {/* Bound rule + history below editor */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-paper border border-line rounded p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Bound rule</div>
              {rule ? (
                <Link to={`/admin/rules/${rule.rule_id}`} className="block">
                  <div className="font-mono text-xs text-teal-1 hover:underline">{rule.rule_id}</div>
                  <div className="text-xs">{rule.name}</div>
                  <div className="mt-1"><StateBadge state={rule.state} /></div>
                </Link>
              ) : (
                <span className="text-xs text-muted">Not bound to a single rule.</span>
              )}
            </div>
            <div className="bg-paper border border-line rounded p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">History</div>
              <ul className="space-y-1.5">
                {events.slice(0, 4).map((e) => (
                  <li key={e.id} className="text-[11px] flex items-start gap-1.5">
                    <span className="font-mono text-muted shrink-0">{new Date(e.at).toLocaleDateString()}</span>
                    <StateBadge state={e.to} />
                    <span className="text-muted">@{userById(e.actor)?.name?.split(' ')[0] || e.actor}</span>
                  </li>
                ))}
                {events.length === 0 && <li className="text-[11px] text-muted">No history</li>}
              </ul>
            </div>
          </div>
        </div>

        <aside className="col-span-4">
          <TokenPalette
            rule={rule}
            onInsert={(t) => editorRef.current?.insertAtCursor(t)}
          />
          <div className="bg-paper border border-line rounded p-3 mt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Templating model</div>
            <p className="text-xs leading-relaxed text-muted">
              Tokens use <code className="font-mono text-[10px] text-navy-1">{`{{kind.path}}`}</code>{' '}
              syntax. At runtime, the service resolves them from the bound rule
              (<span className="text-amber-700">rule</span>),
              the citation registry (<span className="text-blue-700">ref</span>),
              the parsed LC (<span className="text-teal-1">lc</span>),
              extracted documents (<span className="text-purple-700">doc</span>),
              and runtime context (<span className="text-slate-600">system</span>).
              Click any token in the palette to insert at the cursor.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
