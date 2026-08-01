package com.tb.helix.governance.persistence;

import com.tb.helix.governance.spi.CheckCatalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The rulebook, served to lc-check.
 *
 * <p>In {@code persistence} because that is what it is — a query over governance's own
 * tables. It reads the live catalogue today; when the pin mode becomes RELEASE it reads a
 * frozen snapshot instead, so the rule that ran is the rule as it stood, and lc-check does
 * not change either way.
 *
 * <p>The catalogue is documents now, so this reads one column and picks the parts an
 * examination needs out of it. That is the whole adapter: no row mapper enumerating
 * twenty-two columns, and nothing to forget when the console grows a field.
 */
@Component
public class GovernanceCatalog implements CheckCatalog {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public GovernanceCatalog(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public List<CheckCard> activeChecks() {
        return jdbc.query("""
                SELECT body, tier, gate_on, operand_docs
                  FROM helix_gov.v_check_list
                 WHERE status <> 'RETIRED'
                 ORDER BY id
                """, this::card);
    }

    @Override
    public List<CheckCard> gates() {
        // Eligibility, not intent. A rule that stopped qualifying — an operand moved onto a
        // document that has to be read first — stops running first, rather than continuing
        // to claim it does.
        return jdbc.query("""
                SELECT body, tier, gate_on, operand_docs
                  FROM helix_gov.v_check_list
                 WHERE gate_on AND status <> 'RETIRED'
                 ORDER BY id
                """, this::card);
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<AgentCard> agents() {
        return jdbc.query("""
                SELECT body, ordinal
                  FROM helix_gov.v_agent
                 ORDER BY ordinal, id
                """, (rs, i) -> {
            Map<String, Object> a = document(rs.getString("body"));
            Map<String, Object> config = a.get("config") instanceof Map<?, ?> c
                    ? (Map<String, Object>) c : Map.of();

            // Authored where an author has said so; the display category otherwise. `cat` was
            // the only thing that named a domain before this was consumed, and it happens to
            // match — but it is a heading on a card, and a heading being load-bearing is how
            // renaming one for the screen quietly stops an examiner being asked anything.
            List<String> domains = strings(a.get("domains"));
            if (domains.isEmpty() && a.get("cat") != null) domains = List.of(str(a.get("cat")));

            List<AgentCard.Anchor> anchors = new java.util.ArrayList<>();
            if (config.get("anchors") instanceof List<?> list) {
                for (Object o : list) {
                    if (o instanceof Map<?, ?> m) {
                        Map<String, Object> anchor = (Map<String, Object>) m;
                        anchors.add(new AgentCard.Anchor(str(anchor.get("ref")), str(anchor.get("desc"))));
                    }
                }
            }

            return new AgentCard(
                    str(a.get("id")), str(a.get("name")), str(a.get("domainId")),
                    domains, str(a.get("summary")), str(a.get("behavior")),
                    List.copyOf(anchors), rs.getInt("ordinal"));
        });
    }

    @Override
    public List<DocTypeDef> docTypes() {
        return jdbc.query("""
                SELECT body, role, before_reading
                  FROM helix_gov.v_doc_type
                 WHERE active
                 ORDER BY ordinal, code
                """, (rs, i) -> {
            Map<String, Object> d = document(rs.getString("body"));
            return new DocTypeDef(
                    str(d.get("key")), str(d.get("name")), str(d.get("description")),
                    rs.getString("role"), rs.getBoolean("before_reading"));
        });
    }

    @Override
    public List<FieldBinding> bindingsFor(String docCode) {
        return jdbc.query("""
                SELECT field_key, field_name, value_type, kind, doc_code, note, aliases
                  FROM helix_gov.v_field_binding
                 WHERE doc_code = ?
                 ORDER BY ordinal, field_key
                """, (rs, i) -> new FieldBinding(
                        rs.getString("field_key"), rs.getString("field_name"),
                        rs.getString("value_type"), rs.getString("kind"), rs.getString("doc_code"),
                        rs.getString("note"), array(rs.getArray("aliases"))),
                docCode);
    }

    @Override
    public List<FieldBinding> fieldsOfKind(String kind) {
        return jdbc.query("""
                SELECT key, name, value_type
                  FROM helix_gov.v_field
                 WHERE COALESCE(body ->> 'kind', 'LC_FIELD') = ?
                 ORDER BY key
                """, (rs, i) -> new FieldBinding(
                        rs.getString("key"), rs.getString("name"),
                        rs.getString("value_type"), kind, null, null, List.of()),
                kind);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Matched with spacing and case ignored. A check cites {@code UCP600 Art.18} and an
     * agent's anchor says {@code UCP 600 Art. 18} — one citation, two spellings, and an exact
     * match returned nothing for the second while looking exactly like an article the book
     * did not have. Neither spelling is wrong, so neither is corrected; the lookup is what
     * gives.
     */
    @Override
    public String articleText(String code) {
        if (code == null) return "";
        return jdbc.queryForList("""
                SELECT body FROM helix_gov.v_article
                 WHERE lower(replace(code, ' ', '')) = lower(replace(?, ' ', ''))
                """, String.class, code)
                .stream().findFirst().orElse("");
    }

    private CheckCard card(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        Map<String, Object> c = document(rs.getString("body"));
        return new CheckCard(
                str(c.get("id")),
                str(c.get("title")),
                str(c.get("body")),
                str(c.get("domain")),
                str(c.get("severity")),
                c.get("checkType") == null ? "AGENT" : str(c.get("checkType")),
                rs.getString("tier"),
                rs.getBoolean("gate_on"),
                // Off the document, not the view — nothing derives from it, so it needs no
                // column of its own and the view stays about eligibility.
                str(c.get("onFail")),
                str(c.get("citedAs")),
                strings(c.get("refs")),
                strings(c.get("fields")),
                strings(c.get("docs")),
                // The whole rule, as the console authored it — version, scope, the Raise line
                // and the groups. Null for a judged check, which has no conditions to
                // evaluate: its wording IS the check.
                //
                // It used to hand over `groups` alone, which dropped two things the
                // examination wants. The version, so a tree written for a later reader can
                // be refused rather than half-run; and the author's Raise line, which is the
                // wording a discrepancy is stated in and was being replaced by a sentence
                // this service generated from the values.
                c.get("rule") instanceof Map<?, ?> rule ? rule : null);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> document(String raw) {
        try {
            return json.readValue(raw, LinkedHashMap.class);
        } catch (Exception e) {
            throw new IllegalStateException("A stored check could not be read: " + e.getMessage(), e);
        }
    }

    private String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    @SuppressWarnings("unchecked")
    private List<String> strings(Object o) {
        if (!(o instanceof List<?> list)) return List.of();
        return list.stream().filter(java.util.Objects::nonNull).map(String::valueOf).toList();
    }

    private List<String> array(java.sql.Array a) {
        try {
            return a == null ? List.of() : List.of((String[]) a.getArray());
        } catch (Exception e) {
            return List.of();
        }
    }
}
