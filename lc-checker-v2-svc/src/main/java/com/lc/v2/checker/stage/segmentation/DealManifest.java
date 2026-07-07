package com.lc.v2.checker.stage.segmentation;

import com.lc.v2.checker.domain.common.DocType;
import java.util.List;

/** Page map segment within a deal TIFF (from deal.manifest.yml). */
public record DealManifest(
        String dealNo,
        String caseId,
        String tiff,
        String lc,
        int totalPages,
        List<Segment> segments) {

    /** {@code pages} — 1-based exact page numbers in the deal TIFF (e.g. {@code [2, 3]}). */
    public record Segment(DocType docType, List<Integer> pages, String source, String desc) {}
}
