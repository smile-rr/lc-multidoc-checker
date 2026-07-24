package com.lc.v2.checker.pipeline;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.document.DocumentExtract;
import com.lc.v2.checker.domain.lc.LcParseResult;
import com.lc.v2.checker.domain.reconcile.ReconField;
import com.lc.v2.checker.domain.result.CheckResult;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Mutable pipeline context threaded through all 5 stages.
 * Populated incrementally: each stage fills its section, downstream stages read it.
 */
public final class StageContext {

    public final String sessionId;
    public final PipelineEventBus eventBus;
    public final Instant pipelineStarted;

    // Upload — ingest bundle (bytes + lcText from HTTP)
    public IngestMode ingestMode = IngestMode.LEGACY_MULTI_FILE;
    /** Preset deal number (e.g. "01") when {@link #ingestMode} is DEAL_BUNDLE. */
    public String dealNo;
    /** SHA-256 of merged deal-NN.pdf (deal bundle only). */
    public String dealPdfSha;
    public String lcText;
    public final Map<DocType, byte[]> uploadedDocBytes = new LinkedHashMap<>();
    public final Map<DocType, String> uploadedDocNames = new LinkedHashMap<>();
    public final Map<DocType, String> docIds = new LinkedHashMap<>(); // docType → DB documents.id
    /** SHA-256 of source PDF for vision cache (merged deal PDF or uploaded file). */
    public final Map<DocType, String> cacheContentSha = new LinkedHashMap<>();
    public final List<DocType> confirmedDocTypes = new ArrayList<>(); // officer-confirmed set

    // Stage 1 — Parse
    public LcParseResult lc;
    public final Map<DocType, DocumentExtract> extracts = new LinkedHashMap<>();

    // Stage 2 — Reconcile
    public List<ReconField> reconFields;
    public boolean reconLocked;

    // Stage 3 — Examine
    public final List<CheckResult> checkResults = new ArrayList<>();

    // Stage 4 — Sign-off
    public Map<String, Object> finalReport;

    // Pipeline error
    public Throwable fatalError;

    // Cancellation flag (cooperative; checked between stages)
    public volatile boolean cancelled;
    public volatile String cancelledAtStage;

    public StageContext(String sessionId, PipelineEventBus eventBus) {
        this.sessionId = sessionId;
        this.eventBus = eventBus;
        this.pipelineStarted = Instant.now();
    }

    public boolean hasFatalError() {
        return fatalError != null;
    }

    public DocumentExtract extractFor(DocType type) {
        return extracts.get(type);
    }
}
