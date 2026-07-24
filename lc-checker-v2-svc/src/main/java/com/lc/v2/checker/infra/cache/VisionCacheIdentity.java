package com.lc.v2.checker.infra.cache;

/** Inputs that identify a vision-extract cache entry (cross-session). */
public record VisionCacheIdentity(String pdfSha256, String pageFingerprint, String filename) {

    public VisionCacheIdentity {
        if (pageFingerprint == null || pageFingerprint.isBlank()) {
            pageFingerprint = "1";
        }
    }
}
