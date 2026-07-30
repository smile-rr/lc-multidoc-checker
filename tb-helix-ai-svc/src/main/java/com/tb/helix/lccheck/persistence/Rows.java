package com.tb.helix.lccheck.persistence;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Building the loosely-typed row maps the store takes.
 *
 * <p>Here rather than beside the stages because it exists for {@link CaseStore}'s sake —
 * these are its row maps, and a stage only builds them on the way to a write.
 *
 * <p>{@code Map.of} cannot do this job: it caps at ten pairs and throws on a null value,
 * and half of what a stage writes is legitimately absent — a check with no area because
 * its trigger was not met, a finding with no page because it is about the credit. Absent
 * has to survive as null, not as an exception or an empty string.
 */
public final class Rows {

    private Rows() {
    }

    public static Map<String, Object> of(Object... kv) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) out.put(String.valueOf(kv[i]), kv[i + 1]);
        return out;
    }
}
