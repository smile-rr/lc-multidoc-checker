package com.tb.helix.lccheck.domain;

import java.util.List;

/**
 * One logical document.
 *
 * <p>In a deal bundle several of these are page ranges carved out of one scanned PDF, so
 * {@code pages} carries the identity and there is usually no file of its own.
 *
 * @param lines  the credit only, each line anchored so a fact can point at it
 * @param marks  signatures, stamps, handwriting found on the page
 */
public record LcDocument(
        String id,
        String role,
        String docType,
        String abbr,
        String fileName,
        String reference,
        String icon,
        List<Integer> pageRange,
        List<Integer> pages,
        String extraction,
        boolean lowConfidence,
        String scanNote,
        String title,
        String meta,
        List<?> lines,
        List<?> marks) {
}
