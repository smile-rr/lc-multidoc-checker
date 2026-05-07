package com.lc.v2.checker.infra.cache;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Composer for the vision-extract cache key. Pure-static. */
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

    public static String compose(
            String pdfSha256,
            String promptSha256,
            String model,
            String baseUrl,
            int renderDpi,
            int maxPages,
            Integer maxLongEdgePx,
            int requestShapeVersion) {
        String composite = pdfSha256
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
