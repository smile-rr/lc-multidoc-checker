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
  const [presetLoadingId, setPresetLoadingId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  useEffect(() => {
    getPresets().then(r => setPresets(r.presets ?? [])).catch(() => setPresets([]));
  }, []);

  const classifyFile = (file) => {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.txt') || name.endsWith('.fin') || name.endsWith('.swift')) {
      if (name.includes('mt700')) return 'LC';
      return 'TXT';
    }
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
          return (n.endsWith('.pdf') || n.endsWith('.txt') || n.endsWith('.fin') || n.endsWith('.swift'))
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

  const loadPreset = async (preset) => {
    setPresetLoadingId(preset.id);
    setError(null);
    try {
      const wanted = preset.files.filter(f => f.type === 'pdf' || f.type === 'mt700');
      const fetched = await Promise.all(wanted.map(async (f) => {
        const blob = await getPresetFile(preset.id, f.name);
        return new File([blob], f.name, {
          type: f.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
        });
      }));
      addFiles(fetched, /*replace*/ true);
    } catch (e) {
      setError(`Preset load failed: ${e.message}`);
    } finally {
      setPresetLoadingId(null);
    }
  };

  const lcCount = files.filter(f => f.detectedType === 'LC').length;
  const handleSubmit = async () => {
    if (lcCount === 0) {
      setError('No MT700 detected. Include a file containing "mt700" in the filename or starting with :27: tag.');
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

        {presets.length > 0 && (
          <div>
            <EyebrowLabel className="block mb-2">Quick-start preset</EyebrowLabel>
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
          </div>
        )}

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
            accept=".pdf,.txt,.fin,.swift"
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
  const pdfCount = preset.files.filter(f => f.type === 'pdf').length;
  const hasMt700 = preset.files.some(f => f.type === 'mt700');

  return (
    <button
      onClick={loading ? undefined : onLoad}
      disabled={loading}
      className="border border-line rounded-[10px] bg-white p-3 text-left w-full hover:border-[#a1a1a6] hover:bg-slate2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold tracking-tight">{preset.label}</div>
          <div className="text-[10px] text-muted font-mono mt-0.5">
            {pdfCount} PDFs{hasMt700 ? ' · MT700' : ''}
          </div>
        </div>
        {loading && <Spinner size="sm" />}
      </div>
    </button>
  );
}
