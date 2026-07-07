import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StageProgressMeter } from '../shared/StageProgressMeter';
import { useStageProgress } from '../../hooks/useStageProgress';
import { useDevMode } from '../../context/DevModeContext';
import { StagePage, StageBody } from '../ui/StagePage';
import { StageToolbar } from '../ui/StageToolbar';
import { PageContainer } from '../ui/PageContainer';
import { EyebrowLabel } from '../ui/EyebrowLabel';
import { Card } from '../ui/Card';
import { RerunButton } from '../shared/RerunButton';

/**
 * Stage 0 — Upload. Auto-runs on POST /sessions; officer reviews the ingest
 * manifest here, then continues to Segmentation.
 */
export function UploadPanel({ session, stagesCompleted, events, sessionId }) {
  const navigate = useNavigate();
  const { enabled: devMode } = useDevMode();
  const sid = sessionId ?? session?.id;

  const running = session?.status === 'UPLOAD';
  const uploadDone = stagesCompleted?.has('upload')
    || session?.next_stage === 'segmentation';
  const progress = useStageProgress(events, 'upload', session?.status, uploadDone);

  const ingestFiles = useMemo(() => {
    const rows = [];
    for (const e of events ?? []) {
      if (e?.type !== 'ExtractionProgress') continue;
      const d = e.data || {};
      if (d.slot !== 'upload') continue;
      rows.push({
        docType: d.docType,
        detail: d.status,
      });
    }
    return rows;
  }, [events]);

  const docCount = session?.doc_count ?? ingestFiles.length;

  return (
    <StagePage>
      <StageToolbar
        title="Document Upload"
        meta={running ? (
          <StageProgressMeter
            {...progress}
            sub={progress.sub || `ingesting ${docCount} file${docCount === 1 ? '' : 's'}`}
          />
        ) : uploadDone ? (
          <span className="text-[11px] text-status-green font-mono">
            {docCount} file{docCount === 1 ? '' : 's'} received · ready for segmentation
          </span>
        ) : (
          <span className="text-[11px] text-muted font-mono">awaiting upload…</span>
        )}
        actions={
          devMode ? (
            <RerunButton sessionId={sid} stage="upload" devMode={devMode} />
          ) : null
        }
      />

      <StageBody tone="slate" className="px-6 py-6">
        <PageContainer className="space-y-5">
          <div>
            <EyebrowLabel>Ingest manifest</EyebrowLabel>
            <p className="text-[13px] text-muted mt-1">
              Files were validated and registered when this session was created.
              Continue to classify documents and parse the MT700.
            </p>
          </div>

          {ingestFiles.length > 0 ? (
            <div className="grid gap-2">
              {ingestFiles.map((f, i) => (
                <Card key={`${f.docType}-${i}`} className="px-4 py-3 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-navy-1">{f.docType}</span>
                  <span className="text-[11px] text-muted font-mono truncate max-w-[60%]">{f.detail}</span>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="px-4 py-6 text-center text-[13px] text-muted">
              {docCount > 0
                ? `${docCount} document${docCount === 1 ? '' : 's'} in session`
                : 'No ingest events yet — upload may still be running'}
            </Card>
          )}

          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-[12px] text-muted hover:text-navy-1 underline underline-offset-2"
          >
            Start a new upload on the home page
          </button>
        </PageContainer>
      </StageBody>
    </StagePage>
  );
}
