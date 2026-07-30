package com.tb.helix.governance.seed;

import com.tb.helix.governance.persistence.GovernanceStore;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * The rulebook this service starts with.
 *
 * <p>{@code initial-catalogue.json} is <b>the backend's</b> content — the checks, fields,
 * doc types and articles an empty deployment needs in order to examine anything at all. An
 * unseeded catalogue is not a smaller product; it is a service that plans zero checks and
 * reports every presentation clean.
 *
 * <p>It is deliberately <em>not</em> the UI's mock fixture, though it was first copied from
 * it. Sharing one file across the two looked like "one description of the world" and was
 * really an unenforced promise: nothing failed when they diverged, and nothing would have
 * told anybody. The UI's fixtures are the design — what a check looks like on screen — and
 * they belong to the UI. This is production data, and it belongs here.
 *
 * <p>Runs only when the catalogue is empty. A reseed that overwrote hand-authored rows
 * would delete somebody's afternoon, which is why {@code seeded} exists on a dictionary
 * field and why this checks before writing rather than relying on upserts to be harmless.
 */
@Component
@ConditionalOnProperty(name = "helix.governance.seed.enabled", havingValue = "true", matchIfMissing = true)
public class GovernanceSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(GovernanceSeeder.class);

    private final GovernanceStore store;
    private final ObjectMapper json;
    private final ResourceLoader resources;
    private final String resource;

    public GovernanceSeeder(GovernanceStore store, ObjectMapper json, ResourceLoader resources,
                            @Value("${helix.governance.seed.resource:classpath:seed/initial-catalogue.json}")
                            String resource) {
        this.store = store;
        this.json = json;
        this.resources = resources;
        this.resource = resource;
    }

    @Override
    public void run(org.springframework.boot.ApplicationArguments args) {
        if (store.countChecks() > 0) {
            log.info("Governance catalogue already populated — not seeding");
            return;
        }
        try (var in = resources.getResource(resource).getInputStream()) {
            JsonNode seed = json.readTree(in);
            seedDocTypes(seed);
            seedFields(seed);
            seedLibrary(seed);
            seedAgents(seed);
            seedChecks(seed);
            log.info("Seeded governance catalogue from {}: {} checks", resource, store.countChecks());
        } catch (Exception e) {
            // A service that will not start because a seed file moved is worse than one
            // that starts empty and says so.
            log.error("Governance seeding failed — starting with an empty catalogue", e);
        }
    }

    private void seedDocTypes(JsonNode seed) {
        for (JsonNode d : seed.path("docTypes")) {
            store.saveDocType(Map.of(
                    "key", d.path("key").asText(),
                    "name", d.path("name").asText(),
                    "description", d.path("description").asText(""),
                    "beforeReading", d.path("beforeReading").asBoolean(false),
                    "ordinal", 0));
        }
    }

    private void seedFields(JsonNode seed) {
        for (JsonNode f : seed.path("fields")) {
            String key = f.path("name").asText();
            store.saveField(mapOf(
                    "key", key,
                    "name", f.path("name").asText(),
                    "description", f.path("description").asText(""),
                    "seeded", true));
            int i = 0;
            for (JsonNode b : f.path("bindings")) {
                // Bindings name documents by label; the table keys them by code.
                String code = codeForLabel(seed, b.path("doc").asText());
                if (code != null) store.saveBinding(key, code, b.path("note").asText(""), i++);
            }
        }
    }

    private void seedLibrary(JsonNode seed) {
        Map<String, String> books = new LinkedHashMap<>();
        books.put("UCP600", "UCP 600");
        books.put("ISBP821", "ISBP 821");
        books.forEach((id, name) -> store.saveBook(Map.of("id", id, "title", name, "ordinal", 0)));

        JsonNode info = seed.path("articleInfo");
        int i = 0;
        for (JsonNode ref : seed.path("refBook")) {
            String code = ref.path("code").asText();
            String bookId = code.startsWith("ISBP") ? "ISBP821" : "UCP600";
            JsonNode detail = info.path(code);
            store.saveArticle(mapOf(
                    "aid", code.replace(" ", "-").replace(".", "-"),
                    "bookId", bookId,
                    "code", code,
                    "title", ref.path("desc").asText(""),
                    "summary", detail.path("summary").asText(""),
                    "read", detail.path("read").asText(""),
                    "ordinal", i++));
        }
    }

    private void seedAgents(JsonNode seed) {
        int i = 0;
        for (JsonNode a : seed.path("agents")) {
            store.saveAgent(mapOf(
                    "id", a.path("id").asText(),
                    "name", a.path("name").asText(),
                    "cat", a.path("cat").asText(""),
                    "domainId", a.path("domainId").asText(""),
                    "eyebrow", a.path("eyebrow").asText(""),
                    "summary", a.path("summary").asText(""),
                    "description", a.path("description").asText(""),
                    "behavior", a.path("behavior").asText(""),
                    "owner", a.path("owner").asText(""),
                    "version", a.path("version").asText(""),
                    "status", "ACTIVE",
                    "icon", a.path("icon").asText(""),
                    "accent", a.path("accent").asText(""),
                    "config", json.convertValue(a.path("config"), Map.class),
                    "ordinal", i++));
        }
        for (JsonNode g : seed.path("groups")) {
            store.saveGroup(mapOf(
                    "gid", g.path("gid").asText(),
                    "agentId", g.path("agentId").asText(),
                    "name", g.path("name").asText(),
                    "desc", g.path("desc").asText("")));
        }
    }

    private void seedChecks(JsonNode seed) {
        JsonNode defaults = seed.path("checkDefaults");
        JsonNode rules = seed.path("ruleSeeds");

        for (JsonNode c : seed.path("checks")) {
            String id = c.path("id").asText();
            JsonNode def = defaults.path(id);

            store.saveCheck(mapOf(
                    "id", id,
                    "title", c.path("title").asText(),
                    "body", c.path("body").asText(""),
                    "domain", c.path("domain").asText(""),
                    "severity", c.path("severity").asText("MAJOR"),
                    "checkType", c.path("checkType").asText("AGENT"),
                    "gate", c.path("gate").asBoolean(false),
                    "citedAs", "practice",
                    "agentId", c.path("agentId").isNull() ? null : c.path("agentId").asText(null),
                    "groupId", c.path("groupId").isNull() ? null : c.path("groupId").asText(null),
                    "refs", list(c.path("refs")),
                    "fields", list(def.path("fields")),
                    "docs", codesFor(seed, def.path("docs")),
                    "suggestion", c.path("suggestion").asText(""),
                    // Seeded checks are ACTIVE, otherwise the first examination plans nothing
                    // and the whole pipeline looks broken for a reason nobody would guess.
                    "status", c.path("draft").asBoolean(false) ? "DRAFT" : "ACTIVE"));

            JsonNode rule = rules.path(id);
            if (!rule.isMissingNode()) {
                // Seeds are flat {scope, logic, message, rows}; the editor works in groups.
                Map<String, Object> group = new LinkedHashMap<>();
                group.put("id", "g1");
                group.put("logic", rule.path("logic").asText("all"));
                group.put("rows", json.convertValue(rule.path("rows"), List.class));
                store.saveRule(id, mapOf(
                        "scope", rule.path("scope").asText(""),
                        "message", rule.path("message").asText(""),
                        "groups", List.of(group)));
            }
        }
    }

    // --- Helpers ------------------------------------------------------------

    private String codeForLabel(JsonNode seed, String label) {
        for (JsonNode d : seed.path("docTypes")) {
            if (d.path("name").asText().equalsIgnoreCase(label)) return d.path("key").asText();
        }
        return null;
    }

    private List<String> codesFor(JsonNode seed, JsonNode labels) {
        List<String> out = new ArrayList<>();
        for (JsonNode l : labels) {
            String code = codeForLabel(seed, l.asText());
            if (code != null) out.add(code);
        }
        return out;
    }

    private List<String> list(JsonNode node) {
        List<String> out = new ArrayList<>();
        node.forEach(n -> out.add(n.asText()));
        return out;
    }

    private static Map<String, Object> mapOf(Object... kv) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) out.put(String.valueOf(kv[i]), kv[i + 1]);
        return out;
    }
}
