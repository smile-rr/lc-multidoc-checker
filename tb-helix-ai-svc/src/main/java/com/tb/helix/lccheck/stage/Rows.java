package com.tb.helix.lccheck.stage;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Building the loosely-typed row maps the store takes.
 *
 * <p>{@code Map.of} cannot do this job: it caps at ten pairs and throws on a null value,
 * and half of what a stage writes is legitimately absent — a check with no area because
 * its trigger was not met, a finding with no page because it is about the credit. Absent
 * has to survive as null, not as an exception or an empty string.
 */
final class Rows {

    private Rows() {
    }

    static Map<String, Object> of(Object... kv) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) out.put(String.valueOf(kv[i]), kv[i + 1]);
        return out;
    }
}
