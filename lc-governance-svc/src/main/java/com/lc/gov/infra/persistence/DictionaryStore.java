package com.lc.gov.infra.persistence;

import com.lc.gov.domain.dictionary.DictField;
import com.lc.gov.domain.dictionary.DocTypeDef;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * The Dictionary — {@code lc_gov.dict_field} and {@code lc_gov.doc_type}.
 *
 * <p>Seeded rows carry {@code seeded = true} and are overwritten on reseed.
 * Hand-authored rows (DERIVED, EXTERNAL, or anything edited in the UI) are
 * inserted with {@code seeded = false} and the seeder leaves them alone.
 */
@Component
public class DictionaryStore {

    private final JdbcTemplate jdbc;

    public DictionaryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ── dict_field ──────────────────────────────────────────────────────────

    private static final RowMapper<DictField> FIELD_MAPPER = (ResultSet rs, int n) -> new DictField(
            rs.getString("key"),
            rs.getString("name_en"),
            rs.getString("name_zh"),
            rs.getString("kind"),
            rs.getString("value_type"),
            rs.getString("field_group"),
            PgArrays.read(rs, "source_tags"),
            PgArrays.read(rs, "applies_to"),
            rs.getBoolean("rule_relevant"),
            rs.getString("description"),
            rs.getBoolean("seeded"));

    /** Upsert from YAML. Only touches rows that are themselves seeded — an entry
     *  a human has taken over is not reverted by the next boot. */
    public void upsertSeeded(DictField f) {
        jdbc.update("""
                INSERT INTO lc_gov.dict_field
                    (key, name_en, name_zh, kind, value_type, field_group,
                     source_tags, applies_to, rule_relevant, description, seeded)
                VALUES (?, ?, ?, ?, ?, ?, ?::text[], ?::text[], ?, ?, TRUE)
                ON CONFLICT (key) DO UPDATE SET
                    name_en       = EXCLUDED.name_en,
                    name_zh       = EXCLUDED.name_zh,
                    kind          = EXCLUDED.kind,
                    value_type    = EXCLUDED.value_type,
                    field_group   = EXCLUDED.field_group,
                    source_tags   = EXCLUDED.source_tags,
                    applies_to    = EXCLUDED.applies_to,
                    rule_relevant = EXCLUDED.rule_relevant,
                    description   = COALESCE(EXCLUDED.description, lc_gov.dict_field.description)
                WHERE lc_gov.dict_field.seeded
                """,
                f.key(), f.nameEn(), f.nameZh(), f.kind(), f.valueType(), f.fieldGroup(),
                PgArrays.literal(f.sourceTags()), PgArrays.literal(f.appliesTo()),
                f.ruleRelevant(), f.description());
    }

    public List<DictField> listFields() {
        return jdbc.query("""
                SELECT * FROM lc_gov.dict_field
                ORDER BY field_group NULLS LAST, key
                """, FIELD_MAPPER);
    }

    public List<DictField> listFieldsForDocType(String docType) {
        return jdbc.query("""
                SELECT * FROM lc_gov.dict_field
                WHERE ?= ANY (applies_to)
                ORDER BY field_group NULLS LAST, key
                """, FIELD_MAPPER, docType);
    }

    /** Every key a check is allowed to reference. Used to validate field_refs
     *  and to lint {token}s in the rule editor. */
    public Set<String> fieldKeys() {
        return Set.copyOf(jdbc.queryForList("SELECT key FROM lc_gov.dict_field", String.class));
    }

    public int countFields() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM lc_gov.dict_field", Integer.class);
        return n == null ? 0 : n;
    }

    // ── doc_type ────────────────────────────────────────────────────────────

    private static final RowMapper<DocTypeDef> DOC_TYPE_MAPPER = (ResultSet rs, int n) -> new DocTypeDef(
            rs.getString("code"),
            rs.getString("name_en"),
            rs.getString("name_zh"),
            rs.getString("description"),
            rs.getInt("ordinal"));

    public void upsertDocType(DocTypeDef d) {
        jdbc.update("""
                INSERT INTO lc_gov.doc_type (code, name_en, name_zh, description, ordinal)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (code) DO UPDATE SET
                    name_en     = EXCLUDED.name_en,
                    name_zh     = EXCLUDED.name_zh,
                    description = EXCLUDED.description,
                    ordinal     = EXCLUDED.ordinal
                """,
                d.code(), d.nameEn(), d.nameZh(), d.description(), d.ordinal());
    }

    public List<DocTypeDef> listDocTypes() {
        return jdbc.query("SELECT * FROM lc_gov.doc_type ORDER BY ordinal, code", DOC_TYPE_MAPPER);
    }

    public Set<String> docTypeCodes() {
        return jdbc.query("SELECT code FROM lc_gov.doc_type", (rs, n) -> rs.getString(1))
                .stream().collect(Collectors.toUnmodifiableSet());
    }

    /** Throws when a caller names something the Dictionary does not define.
     *  Kept here so both the API layer and the importer fail the same way. */
    public void requireKnownFields(List<String> keys) {
        if (keys == null || keys.isEmpty()) return;
        Set<String> known = fieldKeys();
        List<String> unknown = keys.stream().filter(k -> !known.contains(k)).toList();
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException("unknown field keys: " + String.join(", ", unknown));
        }
    }

    public void requireKnownDocTypes(List<String> codes) {
        if (codes == null || codes.isEmpty()) return;
        Set<String> known = docTypeCodes();
        List<String> unknown = codes.stream().filter(c -> !known.contains(c)).toList();
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException("unknown doc types: " + String.join(", ", unknown));
        }
    }
}
