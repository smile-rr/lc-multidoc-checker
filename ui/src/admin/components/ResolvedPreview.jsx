import React, { useMemo } from 'react';
import { useStore } from '../store';
import { resolveTokens, validateTokens } from './tokenResolver';
import { HighlightedViewer } from './HighlightedEditor';

export function ResolvedPreview({ template, rule }) {
  const refs = useStore((s) => s.refs);
  const sample = useStore((s) => s.sampleResolution);

  const { resolved, validation } = useMemo(() => ({
    resolved: resolveTokens(template, { rule, refs, sample }),
    validation: validateTokens(template, rule),
  }), [template, rule, refs, sample]);

  return (
    <div>
      <div className="px-3 py-2 border-b border-line bg-slate2/40 flex items-center gap-3 text-[10px]">
        <span className="uppercase tracking-wider text-muted">Resolved preview</span>
        <span className="font-mono text-muted">{validation.tokens.length} tokens</span>
        {validation.issues.length === 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 text-status-green font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-status-green" />
            contract OK · all tokens declared in field_keys / refs
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-status-red font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-status-red" />
            {validation.issues.length} contract violation{validation.issues.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {validation.issues.length > 0 && (
        <div className="px-3 py-2 border-b border-line bg-status-redSoft">
          <ul className="space-y-0.5 text-[11px] text-status-red">
            {validation.issues.map((i, k) => (
              <li key={k}>
                <span className="font-mono">{`{{${i.token}}}`}</span> — {i.message}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-status-red/80 mt-1">
            At startup the runtime would refuse to load this rule until either the prompt drops the unbound token, or the catalog declares it.
          </p>
        </div>
      )}
      <div className="bg-paper">
        <HighlightedViewer value={resolved} rows={20} />
      </div>
      <div className="px-3 py-1.5 border-t border-line text-[10px] text-muted">
        Sample LC + doc data is illustrative; real values come from <code className="font-mono">ctx.lc</code> + <code className="font-mono">ctx.extracts</code> at runtime.
      </div>
    </div>
  );
}
