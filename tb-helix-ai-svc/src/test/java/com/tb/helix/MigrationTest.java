package com.tb.helix;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The migration filenames, checked before a boot has to discover them.
 *
 * <p>Two people adding a migration on the same afternoon both reach for the next number,
 * and Flyway does not notice until {@code migrate()} — which is startup, after a build
 * that passed. The failure then arrives as a wall of Spring bean-creation stack trace with
 * the real sentence eight frames down, and every dependent bean reports it again.
 *
 * <p>A filename collision is knowable from the filenames. This makes it a red build.
 */
class MigrationTest {

    private static final Path DIR = Path.of("src/main/resources/db/migration");

    /** {@code V12__infra_schema_and_model_spend.sql} → version 12. */
    private static final Pattern VERSIONED = Pattern.compile("^V(\\d+)__(.+)\\.sql$");
    private static final Pattern REPEATABLE = Pattern.compile("^R__(.+)\\.sql$");

    @Test
    @DisplayName("no two migrations share a version")
    void versionsAreUnique() throws IOException {
        Map<Integer, List<String>> byVersion = new LinkedHashMap<>();
        for (String name : names()) {
            Matcher m = VERSIONED.matcher(name);
            if (m.matches()) {
                byVersion.computeIfAbsent(Integer.parseInt(m.group(1)), k -> new ArrayList<>()).add(name);
            }
        }

        List<String> clashes = byVersion.entrySet().stream()
                .filter(e -> e.getValue().size() > 1)
                .map(e -> "V" + e.getKey() + ": " + String.join(", ", e.getValue()))
                .toList();

        assertThat(clashes)
                .as("two migrations claim the same version — renumber the later one; "
                        + "Flyway refuses to start rather than choosing between them")
                .isEmpty();
    }

    @Test
    @DisplayName("every migration is named the way Flyway reads")
    void namesAreWellFormed() throws IOException {
        List<String> malformed = names().stream()
                .filter(n -> !VERSIONED.matcher(n).matches() && !REPEATABLE.matcher(n).matches())
                .toList();

        // A file Flyway cannot parse is not an error to it — it is simply not a migration,
        // so it is silently never applied. That is worse than a collision: the build is
        // green, the boot is clean, and the column is missing.
        assertThat(malformed)
                .as("not V<n>__name.sql or R__name.sql, so Flyway will ignore it entirely")
                .isEmpty();
    }

    @Test
    @DisplayName("versions have no gaps")
    void versionsAreContiguous() throws IOException {
        List<Integer> versions = names().stream()
                .map(VERSIONED::matcher)
                .filter(Matcher::matches)
                .map(m -> Integer.parseInt(m.group(1)))
                .sorted()
                .toList();
        if (versions.isEmpty()) return;

        List<Integer> missing = new ArrayList<>();
        for (int v = versions.get(0); v < versions.get(versions.size() - 1); v++) {
            if (!versions.contains(v)) missing.add(v);
        }

        // A gap is usually a deleted migration, and a deleted migration is a schema no
        // existing database will ever reach. Loud, because the databases that already ran
        // it and the fresh ones that never will have quietly diverged.
        assertThat(missing)
                .as("missing migration version(s) — a deleted migration leaves old and new "
                        + "databases on different schemas with nothing to say so")
                .isEmpty();
    }

    private static List<String> names() throws IOException {
        try (Stream<Path> files = Files.list(DIR)) {
            return files.filter(Files::isRegularFile)
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .toList();
        }
    }
}
