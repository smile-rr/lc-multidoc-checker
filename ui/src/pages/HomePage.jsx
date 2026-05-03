import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession, listSessions, getPresets, getPresetFile } from '../api';
import { classifyFilename, DOC_TYPE_LABELS } from '../components/shared/DocTypeClassifier';
import { Spinner } from '../components/shared/Spinner';

/**
 * Stage 0 — upload + presets.
 *
 * Single drop zone accepts .pdf and .txt files. Filename + content sniff classifies:
 *   - .pdf → DocType via filename keyword (existing DocTypeClassifier)
 *   - .txt with "mt700" or starting with :27:/:20: → LC (server confirms)
 * Three preset bundles (01–03) load with one click; each bundle provides one MT700 variant.
 */
export function HomePage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [presets, setPresets] = useState([]);
  const [presetLoadingId, setPresetLoadingId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  useEffect(() => {
    listSessions(20).then(setSessions).catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
    getPresets().then(r => setPresets(r.presets ?? [])).catch(() => setPresets([]));
  }, []);

  // ── File handling ──────────────────────────────────────────────────────

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

  // ── Presets ────────────────────────────────────────────────────────────

  const loadPreset = async (preset) => {
    setPresetLoadingId(preset.id);
    setError(null);
    try {
      const wanted = preset.files.filter(f =>
        f.type === 'pdf' || f.type === 'mt700'
      );
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

  // ── Submit ─────────────────────────────────────────────────────────────

  const lcCount = files.filter(f => f.detectedType === 'LC').length;
  const handleSubmit = async () => {
    if (lcCount === 0) {
      setError('No MT700 detected. Include a file containing "mt700" in the filename or starting with :27: tag.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // lcText left empty — backend extracts MT700 text from the LC file's bytes
      const { sessionId } = await createSession('', files.map(f => f.file));
      navigate(`/session/${sessionId}`);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        <div>
          <h1 className="text-xl font-semibold text-navy-1">LC Compliance Check</h1>
          <p className="text-sm text-muted mt-1">
            Drop the MT700 (.txt) and supporting PDFs together. Filenames are classified automatically.
          </p>
        </div>

        {/* Presets row */}
        {presets.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
              Quick-start preset
            </div>
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

        {/* Unified drop zone */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Documents
            </label>
            {files.length > 0 && (
              <button onClick={clearAll} className="text-xs text-muted hover:text-status-red">
                clear all
              </button>
            )}
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${dragOver ? 'border-teal-1 bg-status-greenSoft' : 'border-line hover:border-[#8e8e93]'}`}
          >
            <p className="text-sm text-muted">
              Drop PDFs <strong>and</strong> the MT700 .txt here, or click to browse
            </p>
            <p className="text-xs text-[#a1a1a6] mt-1">
              mt700 · invoice · bill-of-lading · packing-list · bill-of-exchange · beneficiary-cert · warranty-cert
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.fin,.swift"
              multiple
              className="hidden"
              onChange={e => addFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <>
              <div className="text-[11px] text-muted font-mono">
                {files.length} file{files.length === 1 ? '' : 's'} · {lcCount} LC · {files.length - lcCount} supporting
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {files.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-paper rounded border border-line px-3 py-2">
                    <TypeBadge type={item.detectedType} />
                    <span className="text-xs text-navy-1 flex-1 truncate">{item.file.name}</span>
                    <span className="text-xs text-[#a1a1a6]">{(item.file.size / 1024).toFixed(0)} KB</span>
                    <button
                      onClick={e => { e.stopPropagation(); removeFile(idx); }}
                      className="text-[#a1a1a6] hover:text-status-red text-xs ml-1"
                    >✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="bg-status-redSoft border border-[#fca5a5] rounded p-3 text-sm text-status-red">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={submitting || lcCount === 0}
            className="px-6 py-2.5 bg-teal-1 hover:bg-teal-2 disabled:opacity-50 disabled:cursor-not-allowed
                       text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
          >
            {submitting ? <Spinner size="sm" /> : null}
            {submitting ? 'Uploading…' : 'Upload'}
          </button>
        </div>

        <div>
          <h2 className="text-sm font-medium text-muted mb-3">Recent Sessions</h2>
          {loadingSessions && <p className="text-xs text-[#a1a1a6]">Loading…</p>}
          {!loadingSessions && sessions.length === 0 && (
            <p className="text-xs text-[#a1a1a6]">No sessions yet.</p>
          )}
          {sessions.length > 0 && (
            <div className="space-y-1">
              {sessions.map((s) => <SessionRow key={s.id} session={s} />)}
            </div>
          )}
        </div>
      </div>
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
    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 font-mono ${cls}`}>
      {type}
    </span>
  );
}

function PresetCard({ preset, loading, onLoad }) {
  const pdfCount = preset.files.filter(f => f.type === 'pdf').length;
  const hasMt700 = preset.files.some(f => f.type === 'mt700');

  return (
    <div className="border border-line rounded-[10px] bg-white p-3 relative">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold tracking-tight">{preset.label}</div>
          <div className="text-[10px] text-muted font-mono mt-0.5">
            {pdfCount} PDFs{hasMt700 ? ' · MT700' : ''}
          </div>
        </div>
        {loading
          ? <Spinner size="sm" />
          : (
            <button
              onClick={onLoad}
              className="text-[10px] px-2 py-1 rounded border border-line hover:bg-slate2"
            >
              load →
            </button>
          )
        }
      </div>
    </div>
  );
}

function SessionRow({ session }) {
  const navigate = useNavigate();
  const compliant = session.compliant;
  const statusCls = {
    COMPLETED: compliant === true ? 'text-status-green' : compliant === false ? 'text-status-red' : 'text-muted',
    FAILED:    'text-status-red',
    CANCELLED: 'text-status-gold',
    QUEUED:    'text-[#a1a1a6]',
    INTAKE:    'text-teal-1',
    RUNNING:   'text-teal-1',
  }[session.status] ?? 'text-[#a1a1a6]';

  return (
    <div
      onClick={() => navigate(`/session/${session.id}`)}
      className="flex items-center gap-3 bg-paper hover:bg-slate2 border border-line rounded px-4 py-2.5 cursor-pointer transition-colors"
    >
      <span className={`text-xs font-medium ${statusCls} w-20 shrink-0`}>
        {session.status === 'COMPLETED'
          ? (compliant === true ? 'COMPLIANT' : compliant === false ? 'DISCREPANT' : 'COMPLETED')
          : session.status}
      </span>
      <span className="text-xs text-[#a1a1a6] font-mono w-20 shrink-0">
        {String(session.id).slice(0, 8)}
      </span>
      <span className="text-xs text-muted flex-1 truncate">
        {session.lc_number ?? '—'}
        {session.beneficiary_name ? ` · ${session.beneficiary_name}` : ''}
      </span>
      <span className="text-xs text-[#a1a1a6]">{session.doc_count} docs</span>
      <span className="text-xs text-[#c0c0c4]">
        {new Date(session.created_at).toLocaleDateString()}
      </span>
    </div>
  );
}
