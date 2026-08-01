package com.tb.helix.infra.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Keeps Flyway's history table in {@code helix_infra}.
 *
 * <p>V12 moved every application table out of {@code helix_core}, but left
 * {@code flyway_schema_history} behind — a migration cannot relocate the table that is
 * recording its own success. That move happens here, <em>before</em>
 * {@code flyway.migrate()}, so the configured default schema already holds the history
 * when Flyway looks for it.
 *
 * <p>Fresh databases never see {@code helix_core}: history is created in {@code helix_infra}
 * from the first migration. Existing ones get one ALTER TABLE on the next boot.
 *
 * <p>If both schemas somehow hold a history table (Flyway created an empty one in the new
 * home before the move ran), the copy with more rows wins — never drop the richer ledger
 * in favour of a freshly baselined stub.
 */
@Configuration
public class FlywayConfig {

    private static final Logger log = LoggerFactory.getLogger(FlywayConfig.class);

    private static final String OLD_SCHEMA = "helix_core";
    private static final String NEW_SCHEMA = "helix_infra";
    private static final String HISTORY = "flyway_schema_history";

    @Bean
    public FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            relocateHistory(flyway.getConfiguration().getDataSource());
            flyway.migrate();
        };
    }

    private static void relocateHistory(DataSource ds) {
        try (Connection c = ds.getConnection(); Statement s = c.createStatement()) {
            s.execute("CREATE SCHEMA IF NOT EXISTS " + NEW_SCHEMA);

            boolean inOld = tableExists(s, OLD_SCHEMA, HISTORY);
            boolean inNew = tableExists(s, NEW_SCHEMA, HISTORY);

            if (inOld && inNew) {
                int oldRows = countRows(s, OLD_SCHEMA, HISTORY);
                int newRows = countRows(s, NEW_SCHEMA, HISTORY);
                if (oldRows > newRows) {
                    s.execute("DROP TABLE " + NEW_SCHEMA + "." + HISTORY);
                    s.execute("ALTER TABLE " + OLD_SCHEMA + "." + HISTORY
                            + " SET SCHEMA " + NEW_SCHEMA);
                    log.warn("Replaced {}.{} ({} rows) with {}.{} ({} rows)",
                            NEW_SCHEMA, HISTORY, newRows, OLD_SCHEMA, HISTORY, oldRows);
                } else {
                    s.execute("DROP TABLE " + OLD_SCHEMA + "." + HISTORY);
                    log.info("Dropped obsolete {}.{} ({} rows; {} kept in {})",
                            OLD_SCHEMA, HISTORY, oldRows, newRows, NEW_SCHEMA);
                }
            } else if (inOld) {
                s.execute("ALTER TABLE " + OLD_SCHEMA + "." + HISTORY
                        + " SET SCHEMA " + NEW_SCHEMA);
                log.info("Moved {}.{} → {}", OLD_SCHEMA, HISTORY, NEW_SCHEMA);
            }

            if (schemaExists(s, OLD_SCHEMA) && !hasAnyTable(s, OLD_SCHEMA)) {
                s.execute("DROP SCHEMA " + OLD_SCHEMA);
                log.info("Dropped empty schema {}", OLD_SCHEMA);
            }
        } catch (SQLException e) {
            throw new IllegalStateException(
                    "Could not relocate Flyway history to " + NEW_SCHEMA, e);
        }
    }

    private static boolean tableExists(Statement s, String schema, String table) throws SQLException {
        try (ResultSet rs = s.executeQuery(
                "SELECT 1 FROM information_schema.tables"
                        + " WHERE table_schema = '" + schema + "'"
                        + "   AND table_name = '" + table + "'")) {
            return rs.next();
        }
    }

    private static boolean schemaExists(Statement s, String schema) throws SQLException {
        try (ResultSet rs = s.executeQuery(
                "SELECT 1 FROM information_schema.schemata WHERE schema_name = '" + schema + "'")) {
            return rs.next();
        }
    }

    private static boolean hasAnyTable(Statement s, String schema) throws SQLException {
        try (ResultSet rs = s.executeQuery(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = '" + schema + "' LIMIT 1")) {
            return rs.next();
        }
    }

    private static int countRows(Statement s, String schema, String table) throws SQLException {
        try (ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM " + schema + "." + table)) {
            rs.next();
            return rs.getInt(1);
        }
    }
}
