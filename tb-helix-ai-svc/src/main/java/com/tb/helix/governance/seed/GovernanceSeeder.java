package com.tb.helix.governance.seed;

import com.tb.helix.governance.persistence.GovernanceStore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * The rulebook this service starts with.
 *
 * <p>{@code initial-catalogue.json} is production data: the checks, fields, doc types and
 * articles an empty deployment needs in order to examine anything at all. An unseeded
 * catalogue is not a smaller product — it is a service that plans zero checks and reports
 * every presentation clean.
 *
 * <p>Runs once, only when the catalogue is empty. A reseed that overwrote hand-authored rows
 * would delete somebody's afternoon, which is why {@code seeded} exists on a dictionary
 * field and why this checks before writing rather than trusting upserts to be harmless.
 *
 * <h2>Why there is no mapping code here</h2>
 *
 * <p>This class used to translate: {@code key} became {@code code}, {@code cat} became
 * {@code category}, a check's fields came from one map and its rule from another, document
 * <em>labels</em> were looked up to find document <em>codes</em>, and {@code citedAs} was not
 * in the file at all — it was the string {@code "practice"}, in Java. That is data living in
 * code, and it means changing the seed needs a rebuild and a Java reviewer.
 *
 * <p>All of it existed for one reason: the file had been copied from the UI's mock fixture,
 * so it was shaped for a React screen rather than for these tables. Once it became the
 * backend's own file, the shape could be the schema's, and the translation had nothing left
 * to do.
 *
 * <p>The file now speaks the same vocabulary as {@link GovernanceStore} — which is also the
 * vocabulary of the authoring API, since the controllers hand it the request body directly.
 * So a seed entry is literally a check you could have POSTed. Adding one is editing JSON;
 * nothing below needs to change, and nothing below decides anything.
 */
@Component
@ConditionalOnProperty(name = "helix.governance.seed.enabled", havingValue = "true", matchIfMissing = true)
public class GovernanceSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(GovernanceSeeder.class);

    private static final TypeReference<List<Map<String, Object>>> ROWS = new TypeReference<>() {
    };

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
        if (!store.isEmpty()) {
            log.info("Governance catalogue already populated — not seeding");
            return;
        }
        try (var in = resources.getResource(resource).getInputStream()) {
            JsonNode seed = json.readTree(in);

            // Five lists, five stores, and no order to get right. A field carries its own
            // bindings and a check carries its own rule, so there is nothing here that has
            // to be written before something else can reference it — which is what the
            // ordering comment this replaces was apologising for.
            rows(seed, "docTypes").forEach(store::saveDocType);
            rows(seed, "fields").forEach(store::saveField);
            rows(seed, "agents").forEach(store::saveAgent);
            rows(seed, "checks").forEach(store::saveCheck);
            rows(seed, "books").forEach(store::saveBook);

            log.info("Seeded the governance catalogue from {}", resource);
        } catch (Exception e) {
            // A service that will not start because a seed file moved is worse than one
            // that starts empty and says so.
            log.error("Governance seeding failed — starting with an empty catalogue", e);
        }
    }

    private List<Map<String, Object>> rows(JsonNode seed, String name) {
        JsonNode node = seed.path(name);
        return node.isMissingNode() ? List.of() : json.convertValue(node, ROWS);
    }

}
