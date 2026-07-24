package com.lc.v2.checker.infra.cache;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Composer for the vision-extract cache key. Pure-static.
 *
 * <p>Content identity = {@code pdfSha256} (merged deal PDF or uploaded file)
 * + {@code pageFingerprint} (1-based bundle page numbers, e.g. {@code 1}, {@code 2-3}).</p>
 */
public final class CacheKey {

    private CacheKey() {}

    public static String sha256Hex(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public static String sha256Hex(String s) {
        return sha256Hex(s.getBytes(StandardCharsets.UTF_8));
    }

    /** 1-based deal-bundle or explicit page list, e.g. {@code 1}, {@code 2-3}, {@code 2,4}. */
    public static String pageFingerprint(List<Integer> pages) {
        if (pages == null || pages.isEmpty()) return "1";
        List<Integer> sorted = pages.stream().sorted().distinct().toList();
        if (sorted.size() == 1) return String.valueOf(sorted.get(0));
        boolean consecutive = true;
        for (int i = 1; i < sorted.size(); i++) {
            if (sorted.get(i) != sorted.get(i - 1) + 1) {
                consecutive = false;
                break;
            }
        }
        if (consecutive) {
            return sorted.get(0) + "-" + sorted.get(sorted.size() - 1);
        }
        return sorted.stream().map(String::valueOf).collect(Collectors.joining(","));
    }

    /** Legacy whole-file upload: pages {@code 1} or {@code 1-N}. */
    public static String pageFingerprintForPageCount(int pageCount) {
        if (pageCount <= 1) return "1";
        List<Integer> pages = new ArrayList<>(pageCount);
        for (int i = 1; i <= pageCount; i++) pages.add(i);
        return pageFingerprint(pages);
    }

    public static String compose(
            String pdfSha256,
            String pageFingerprint,
            String promptSha256,
            String model,
            String baseUrl,
            int renderDpi,
            int maxPages,
            Integer maxLongEdgePx,
            int requestShapeVersion) {
        String pages = (pageFingerprint == null || pageFingerprint.isBlank()) ? "1" : pageFingerprint;
        String composite = pdfSha256
                + "|p" + pages
                + "|" + promptSha256
                + "|" + model
                + "|" + baseUrl
                + "|" + renderDpi
                + "|" + maxPages
                + "|" + (maxLongEdgePx == null ? "" : maxLongEdgePx)
                + "|v" + requestShapeVersion;
        return sha256Hex(composite);
    }
}
