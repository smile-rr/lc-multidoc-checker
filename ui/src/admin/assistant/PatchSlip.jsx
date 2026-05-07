import React from 'react';
import { useRole } from '../RoleContext';
import { useAssistant } from './AssistantContext';

const KIND_LABEL = {
  'rule.create': 'RULE · CREATE',
  'rule.update': 'RULE · UPDATE',
  'prompt.update': 'PROMPT · UPDATE',
  'field.update': 'FIELD · UPDATE',
};

const time = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

export function PatchSlip({ patch, index, total }) {
  const { role } = useRole();
  const { applyPatch, rejectPatch } = useAssistant();
  const canApply = role.role !== 'Viewer';

  const onApply = () => {
    if (!canApply) return;
    const ok = patch.apply(role.id);
    if (ok) applyPatch(patch.id, role.name);
  };

  const onEdit = () => {
    if (patch.kind.startsWith('rule.')) window.location.hash = `#/admin/rules/${patch.target}`;
    else if (patch.kind === 'prompt.update') window.location.hash = `#/admin/prompts/${encodeURIComponent(patch.target)}`;
  };

  return (
    <div
      className={'patch-slip' + (patch.applied ? ' patch-applied' : '')}
      tabIndex={0}
      data-patch-id={patch.id}
      onKeyDown={(e) => {
        if (patch.applied) return;
        if (e.key === 'a' && canApply) { e.preventDefault(); onApply(); }
        if (e.key === 'x') { e.preventDefault(); rejectPatch(patch.id); }
        if (e.key === 'e') { e.preventDefault(); onEdit(); }
      }}
    >
      <span className="patch-slip-corner tl">┌</span>
      <span className="patch-slip-corner tr">┐</span>
      <span className="patch-slip-corner bl">└</span>
      <span className="patch-slip-corner br">┘</span>

      <div className="patch-header">
        <span>{KIND_LABEL[patch.kind] || patch.kind}</span>
        <span>patch {String(index + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}</span>
      </div>

      <div className="patch-title">
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: 'var(--marginalia)', marginRight: 12 }}>{patch.target}</span>
        {patch.title}
      </div>
      {patch.meta ? (
        <div className="patch-meta">
          {Object.entries(patch.meta).map(([k, v]) => (
            <span key={k} style={{ marginRight: 12 }}>{k} <em style={{ color: 'var(--ink)', fontStyle: 'normal' }}>{Array.isArray(v) ? v.join(', ') : String(v)}</em></span>
          ))}
        </div>
      ) : null}

      <div className="patch-diff">
        {patch.diff.map(([op, line], i) => (
          <div key={i} className={op === '+' ? 'add' : op === '-' ? 'del' : ''}>
            {op}{' '}{line}
          </div>
        ))}
      </div>

      {patch.rationale ? (
        <div className="patch-rationale">
          <span className="patch-rationale-lead">rationale —</span>
          {patch.rationale}
        </div>
      ) : null}

      {(patch.citations?.length || patch.sources?.length) ? (
        <div className="patch-chips">
          {patch.citations?.length ? (
            <span>
              <span style={{ color: 'var(--ink-soft)' }}>cites: </span>
              {patch.citations.map((c) => <span key={c} className="patch-chip">[{c}]</span>)}
            </span>
          ) : null}
          {patch.sources?.length ? (
            <span>
              <span style={{ color: 'var(--ink-soft)' }}>sources: </span>
              {patch.sources.map((s) => <span key={s} className="patch-chip session">#{s} </span>)}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="patch-lifecycle">
        {patch.applied
          ? `applied · ${time(patch.appliedAt)} · ${patch.appliedBy || 'officer'}`
          : 'lands in DRAFT · reviewer approval required'}
      </div>

      {!patch.applied ? (
        <div className="patch-actions">
          <button
            className={'patch-action apply' + (canApply ? '' : ' disabled')}
            onClick={onApply}
            disabled={!canApply}
            title={canApply ? 'Apply (a)' : 'Switch to Engineer or Compliance to apply.'}
          >
            {canApply ? <>Apply <span className="arrow">→</span></> : <>Apply <span aria-hidden> · read-only</span></>}
          </button>
          <button className="patch-action" onClick={onEdit}>Edit</button>
          <button className="patch-action" onClick={() => rejectPatch(patch.id)}>Reject</button>
        </div>
      ) : (
        <>
          <div className="patch-stamp">APPLIED · {time(patch.appliedAt)}</div>
          <div className="patch-actions">
            <button className="patch-action" onClick={onEdit}>view in {patch.kind.startsWith('rule') ? 'Rules' : 'Prompts'} →</button>
          </div>
        </>
      )}

      {!patch.applied ? (
        <div className="role-badge" style={{ marginTop: 12 }}>
          will be authored as: <strong>{role.name} · {role.role}</strong>
        </div>
      ) : null}
    </div>
  );
}
