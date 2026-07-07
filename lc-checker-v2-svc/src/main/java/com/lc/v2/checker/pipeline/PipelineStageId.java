package com.lc.v2.checker.pipeline;

import java.util.List;
import java.util.Locale;

/**
 * Canonical pipeline stage ids (API / DB / SSE) and session status names.
 *
 * <p>HTTP multipart parsing stays in {@link com.lc.v2.checker.api.controller.SessionController};
 * business ingest validation runs in {@link com.lc.v2.checker.stage.upload.UploadStage}.</p>
 */
public enum PipelineStageId {

    UPLOAD("upload", "UPLOAD"),
    SEGMENTATION("segmentation", "SEGMENTATION"),
    PARSE("parse", "PARSE"),
    RECONCILE("reconcile", "RECONCILE"),
    COMPLIANCE_CHECK("compliance-check", "COMPLIANCE_CHECK"),
    SIGNOFF("signoff", "SIGNOFF");

    private final String id;
    private final String status;

    PipelineStageId(String id, String status) {
        this.id = id;
        this.status = status;
    }

    /** URL / DB / SSE stage key. */
    public String id() { return id; }

    /** {@code check_sessions.status} while the stage is running. */
    public String status() { return status; }

    /** Full pipeline slot order (includes dormant {@link #RECONCILE}). */
    public static final List<PipelineStageId> PIPELINE_ORDER = List.of(
            UPLOAD, SEGMENTATION, PARSE, RECONCILE, COMPLIANCE_CHECK, SIGNOFF);

    /** Officer-paced flow — reconcile omitted; upload auto-runs on session create. */
    public static final List<String> ACTIVE_IDS = List.of(
            UPLOAD.id(), SEGMENTATION.id(), PARSE.id(), COMPLIANCE_CHECK.id(), SIGNOFF.id());

    public static PipelineStageId fromId(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String norm = raw.toLowerCase(Locale.ROOT);
        for (PipelineStageId stage : values()) {
            if (stage.id.equals(norm)) return stage;
        }
        return null;
    }

    public static String statusForId(String stageId) {
        PipelineStageId stage = fromId(stageId);
        return stage != null ? stage.status() : stageId.toUpperCase(Locale.ROOT);
    }
}
