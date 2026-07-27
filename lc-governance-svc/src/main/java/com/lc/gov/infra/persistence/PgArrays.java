package com.lc.gov.infra.persistence;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;

/**
 * Postgres {@code text[]} on the way in and out.
 *
 * <p>Values are bound as an array literal cast with {@code ?::text[]} rather than
 * through {@code Connection.createArrayOf}, so a caller never needs the live
 * connection and every store method stays a one-liner.
 */
public final class PgArrays {

    private PgArrays() {}

    /** Renders {@code {"a","b"}} — every element quoted, so a comma or a brace in
     *  a value cannot change the shape of the literal. */
    public static String literal(Collection<String> values) {
        if (values == null || values.isEmpty()) return "{}";
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (String v : values) {
            if (!first) sb.append(',');
            first = false;
            if (v == null) { sb.append("NULL"); continue; }
            sb.append('"').append(v.replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return sb.append('}').toString();
    }

    /** Reads a {@code text[]} column, never returning null. */
    public static List<String> read(ResultSet rs, String column) throws SQLException {
        Array array = rs.getArray(column);
        if (array == null) return List.of();
        Object raw = array.getArray();
        if (!(raw instanceof String[] values)) return List.of();
        List<String> out = new ArrayList<>(values.length);
        for (String v : values) if (v != null) out.add(v);
        return out;
    }

    /** Splits a comma-separated request parameter into a list, trimming blanks. */
    public static List<String> csv(String value) {
        if (value == null || value.isBlank()) return List.of();
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
