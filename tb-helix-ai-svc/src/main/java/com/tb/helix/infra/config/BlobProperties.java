package com.tb.helix.infra.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * {@code helix.blob.*}
 *
 * @param tier        DISK today. S3 when there is an object store; the disk layout is
 *                    already shaped like an object key so that is a new adapter, not a
 *                    migration.
 * @param root        where the content-addressed store lives
 * @param linkByCase  maintain a symlink mirror under {@code by-case/}. Costs nothing and
 *                    makes "show me what this case holds" a shell command rather than a
 *                    query plus a digest lookup.
 * @param orphanGrace how long an unreferenced blob survives before collection. Long,
 *                    because the thing being collected is evidence.
 */
@ConfigurationProperties(prefix = "helix.blob")
public record BlobProperties(
        String tier,
        String root,
        boolean linkByCase,
        Duration orphanGrace) {

    public BlobProperties {
        tier = tier == null ? "DISK" : tier;
        root = root == null ? "./var/blob" : root;
        orphanGrace = orphanGrace == null ? Duration.ofDays(30) : orphanGrace;
    }
}
