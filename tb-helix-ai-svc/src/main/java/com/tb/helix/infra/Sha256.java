package com.tb.helix.infra;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Content digests.
 *
 * <p>Its own class because two unrelated things need it and neither should own it: the blob
 * store addresses content by digest, and the derivation cache keys work by digest. Having
 * one import the other for a hash function would make storage depend on caching, which is
 * the wrong way round and the sort of thing that quietly becomes a cycle.
 */
public final class Sha256 {

    private Sha256() {
    }

    public static String of(byte[] input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(input);
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16))
                   .append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by the JLS and is missing", e);
        }
    }

    public static String of(String input) {
        return of(input.getBytes(StandardCharsets.UTF_8));
    }
}
