package com.tb.helix.lccheck.types.examination;

import java.util.List;

/**
 * A group of checks that reports progress together.
 *
 * <p>Areas exist because a finding does not exist for the officer until the area that
 * produced it has returned — progress per check would be noise, progress per run would be
 * a spinner.
 *
 * @param wave execution order; areas in the same wave run together
 */
public record CheckArea(
        String id,
        String name,
        String kind,
        int wave,
        String purpose,
        List<String> checkIds) {
}
