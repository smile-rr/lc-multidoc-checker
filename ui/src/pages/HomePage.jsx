import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession, getPresets, getPresetFile } from '../api';
import { classifyFilename } from '../components/shared/DocTypeClassifier';
import { compareDocType } from '../constants/docTypes';
import { Spinner } from '../components/shared/Spinner';
import { PageContainer } from '../components/ui/PageContainer';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { EyebrowLabel } from '../components/ui/EyebrowLabel';
import { PrimaryButton, GhostButton } from '../components/ui/Button';
import { useUploadDraft } from '../context/UploadDraftContext';

/**
 * Stage 0 — landing page. Single job: start a check.
 *
 * Layout:
 *   1. Header
 *   2. Quick-start presets (one-click test bundles)
 *   3. Drop zone (full-width hero; collapses when files present)
 *   4. File list with count header + Upload action
 *
 * Recent sessions live exclusively in TopNav `History ▾` — not duplicated here.
 */
export function HomePage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [presets, setPresets] = useState([]);
  const [presetsStatus, setPresetsStatus] = useState('loading'); // loading | ok | empty | error
  const [presetsError, setPresetsError] = useState(null);
  const [presetsRetryKey, setPresetsRetryKey] = useState(0);
  const [presetLoadingId, setPresetLoadingId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();
  const { registerDraft } = useUploadDraft();

  useEffect(() => {
    return registerDraft(files.length > 0, () => setFiles([]));
  }, [files.length, registerDraft]);

  useEffect(() => {
    let cancelled = false;
    const RETRIES = 6;
    const DELAY_MS = 1500;

    (async () => {
      setPresetsStatus('loading');
      setPresetsError(null);
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        if (cancelled) return;
        try {
          const r = await getPresets();
          if (cancelled) return;
          const list = r.presets ?? [];
          setPresets(list);
          setPresetsStatus(list.length ? 'ok' : 'empty');
          return;
        } catch (e) {
          if (cancelled) return;
          const msg = e.message || String(e);
          const retryable = /\b(500|502|503|504)\b/.test(msg)
            || /failed to fetch/i.test(msg)
            || /network/i.test(msg);
          if (retryable && attempt < RETRIES - 1) {
            await new Promise(r => setTimeout(r, DELAY_MS));
            continue;
          }
          setPresets([]);
          setPresetsError(msg);
          setPresetsStatus('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [presetsRetryKey]);

  const classifyFile = (file) => {
    const name = (file.name || '').toLowerCase();
    if (name === 'lc.txt' || (name.includes('mt700') && (name.endsWith('.txt') || name.endsWith('.fin') || name.endsWith('.swift')))) {
      return 'LC';
    }
    if (/^deal-\d+\.(tiff?|tif)$/.test(name)) return 'DEAL';
    if (name.endsWith('.txt') || name.endsWith('.fin') || name.endsWith('.swift')) return 'TXT';
    if (name.endsWith('.pdf')) return classifyFilename(file.name);
    return 'OTHER';
  };

  const addFiles = useCallback((newFiles, replace = false) => {
    setFiles(prev => {
      const baseSet = replace ? [] : prev;
      const existing = new Set(baseSet.map(f => f.file.name));
      const toAdd = Array.from(newFiles)
        .filter(f => {
          const n = (f.name || '').toLowerCase();
          return (n.endsWith('.pdf') || n.endsWith('.txt') || n.endsWith('.fin') || n.endsWith('.swift')
            || n.endsWith('.tiff') || n.endsWith('.tif'))
            && !existing.has(f.name);
        })
        .map(f => ({ file: f, detectedType: classifyFile(f) }));
      return replace ? toAdd : [...baseSet, ...toAdd];
    });
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));
  const clearAll = () => setFiles([]);

  // Preset click stages files into the same drop-zone list as a manual upload —
  // officer reviews the file list and clicks "Upload →" to start the run. The
  // preset path and the manual path then share one and only one create-session
  // entry point.
  const loadPreset = async (preset) => {
    setPresetLoadingId(preset.id);
    setError(null);
    try {
      const isDeal = preset.ingestMode === 'deal'
        || (preset.files.some(f => f.type === 'lc') && preset.files.some(f => f.type === 'deal-tiff'));
      const wanted = isDeal
        ? preset.files.filter(f => f.type === 'lc' || f.type === 'deal-tiff')
        : preset.files.filter(f =>
          f.type === 'pdf' || f.type === 'mt700-pass' || (
            f.type === 'mt700' && !preset.files.some(g => g.type === 'mt700-pass')
          ) || (
            f.type === 'mt700-fail'
              && !preset.files.some(g => g.type === 'mt700-pass' || g.type === 'mt700')
          )
        );
      const fetched = await Promise.all(wanted.map(async (f) => {
        const blob = await getPresetFile(preset.id, f.name);
        const lower = f.name.toLowerCase();
        const mime = lower.endsWith('.pdf') ? 'application/pdf'
          : (lower.endsWith('.tiff') || lower.endsWith('.tif')) ? 'image/tiff'
          : 'text/plain';
        return new File([blob], f.name, { type: mime });
      }));
      addFiles(fetched, /*replace*/ true);
    } catch (e) {
      setError(`Preset load failed: ${e.message}`);
    } finally {
      setPresetLoadingId(null);
    }
  };

  const lcCount = files.filter(f => f.detectedType === 'LC').length;
  const dealCount = files.filter(f => f.detectedType === 'DEAL').length;
  const handleSubmit = async () => {
    if (lcCount === 0) {
      setError('No MT700 detected. Include lc.txt, a file containing "mt700", or starting with :27: tag.');
      return;
    }
    if (dealCount > 0 && (lcCount !== 1 || dealCount !== 1 || files.length !== 2)) {
      setError('Deal bundle requires exactly lc.txt + deal-NN.tiff (2 files).');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { sessionId } = await createSession('', files.map(f => f.file));
      navigate(`/session/${sessionId}`);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const hasFiles = files.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <PageContainer className="px-6 py-8 space-y-6">

        <div>
          <h1 className="text-xl font-semibold text-navy-1">LC Compliance Check</h1>
          <p className="text-sm text-muted mt-1">
            Drop the MT700 (.txt) and supporting PDFs together. Filenames are classified automatically.
          </p>
        </div>

        <div>
          <EyebrowLabel className="block mb-2">Quick-start preset</EyebrowLabel>
          {presetsStatus === 'loading' && (
            <div className="text-[11px] text-muted font-mono flex items-center gap-2">
              <Spinner size="sm" /> loading presets…
            </div>
          )}
          {presetsStatus === 'error' && (
            <div className="bg-status-redSoft border border-[#fca5a5] rounded p-3 text-[12px] text-status-red">
              <div className="font-semibold">Couldn't load preset bundles</div>
              <div className="mt-1 font-mono text-[10px] break-words">{presetsError}</div>
              <div className="mt-1 text-[10px] opacity-80">
                500 usually means svc is restarting (<code>make svc-watch</code>) or not up — run <code>make status</code> / <code>make health</code>, then retry.
                Empty list: check svc logs for <code>[Presets] dir not found</code> and <code>PRESETS_DIR</code> → <code>test/cases</code>.
              </div>
              <button
                type="button"
                className="mt-2 text-[11px] underline"
                onClick={() => setPresetsRetryKey(k => k + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {presetsStatus === 'empty' && (
            <div className="bg-status-goldSoft border border-[#fcd34d] rounded p-3 text-[12px] text-status-gold">
              <div className="font-semibold">No preset bundles found</div>
              <div className="mt-1 text-[10px] opacity-80">
                Backend returned an empty list. Verify the test/cases directory is mounted and <code>PRESETS_DIR</code> points at it.
              </div>
            </div>
          )}
          {presetsStatus === 'ok' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {presets.map(p => (
                <PresetCard
                  key={p.id}
                  preset={p}
                  loading={presetLoadingId === p.id}
                  onLoad={() => loadPreset(p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Drop zone — hero when empty, slim re-add bar when files present */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-[10px] cursor-pointer transition-colors flex flex-col items-center justify-center gap-1 text-center
            ${hasFiles ? 'py-2' : 'py-10'}
            ${dragOver ? 'border-teal-1 bg-status-greenSoft' : 'border-line hover:border-[#8e8e93] bg-white'}`}
        >
          <p className="text-sm text-muted">
            {hasFiles ? '+ drop more files or ' : 'Drop MT700 + PDFs here, or '}
            <span className="text-teal-1 font-medium">click to browse</span>
          </p>
          {!hasFiles && (
            <p className="text-[10px] text-[#a1a1a6]">
              mt700 · invoice · bill-of-lading · packing-list · bill-of-exchange · beneficiary-cert · warranty-cert
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.fin,.swift,.tiff,.tif"
            multiple
            className="hidden"
            onChange={e => addFiles(e.target.files)}
          />
        </div>

        {/* File list — gets all the vertical space; no inner scroll cap */}
        {hasFiles && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted font-mono">
                {files.length} file{files.length === 1 ? '' : 's'} · {lcCount} LC · {files.length - lcCount} supporting
              </span>
              <GhostButton onClick={clearAll}>clear all</GhostButton>
              <PrimaryButton
                tone="teal"
                onClick={handleSubmit}
                disabled={submitting || lcCount === 0}
                className="ml-auto"
              >
                {submitting ? <Spinner size="sm" /> : null}
                {submitting ? 'Uploading…' : 'Upload →'}
              </PrimaryButton>
            </div>
            <div className="space-y-1">
              {files
                .map((item, idx) => ({ item, idx }))
                .sort((a, b) => {
                  // Order by LC review priority (LC → INV → BOL → PKL → BOE → BC → WC → rest)
                  const c = compareDocType(a.item.detectedType, b.item.detectedType);
                  if (c !== 0) return c;
                  return a.idx - b.idx; // stable within same type
                })
                .map(({ item, idx }) => (
                <div key={idx} className="flex items-center gap-2 bg-paper rounded border border-line px-3 py-2">
                  <TypeBadge type={item.detectedType} />
                  <span className="text-[11px] text-navy-1 flex-1 truncate font-mono">{item.file.name}</span>
                  <span className="text-[10px] text-[#a1a1a6]">{(item.file.size / 1024).toFixed(0)} KB</span>
                  <button
                    onClick={e => { e.stopPropagation(); removeFile(idx); }}
                    className="text-[#a1a1a6] hover:text-status-red text-[10px]"
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasFiles && (
          <EmptyState dense className="text-[11px]">
            No files added yet — drop above, or pick a preset to auto-fill.
          </EmptyState>
        )}

        {error && (
          <div className="bg-status-redSoft border border-[#fca5a5] rounded p-3 text-sm text-status-red">
            {error}
          </div>
        )}

      </PageContainer>
    </div>
  );
}

function TypeBadge({ type }) {
  const isLC = type === 'LC';
  const isUnknown = type === 'UNKNOWN' || type === 'OTHER' || type === 'TXT';
  const cls = isLC
    ? 'bg-teal-1/15 text-teal-1'
    : isUnknown
      ? 'bg-status-goldSoft text-status-gold'
      : 'bg-status-blueSoft text-status-blue';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 font-mono ${cls}`}>
      {type}
    </span>
  );
}

function PresetCard({ preset, loading, onLoad }) {
  const isDeal = preset.ingestMode === 'deal'
    || (preset.files.some(f => f.type === 'lc') && preset.files.some(f => f.type === 'deal-tiff'));
  const pdfCount = preset.files.filter(f => f.type === 'pdf').length;
  const hasMt700 = preset.files.some(f => f.type && f.type.startsWith('mt700'));

  return (
    <button
      onClick={loading ? undefined : onLoad}
      disabled={loading}
      className="border border-line rounded-[10px] bg-white p-3 text-left w-full hover:border-[#a1a1a6] hover:bg-slate2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold tracking-tight truncate">{preset.label}</div>
          <div className="text-[10px] text-muted font-mono mt-0.5">
            {isDeal ? 'deal bundle · lc.txt + TIFF' : `${pdfCount} PDFs${hasMt700 ? ' · MT700' : ''}`}
          </div>
        </div>
        {loading && <Spinner size="sm" />}
      </div>
    </button>
  );
}
