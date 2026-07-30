package com.tb.helix.governance.api;

import com.tb.helix.governance.persistence.GovernanceStore;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The governance HTTP surface.
 *
 * <p>CRUD, deliberately. The interesting logic is elsewhere — gate eligibility is derived
 * in SQL where the dictionary lives, and revision history is a trigger of saving.
 *
 * <p>Import endpoints are absent because that feature is future work. A stub that resolved
 * would make the UI look like it works.
 */
@RestController
@RequestMapping("/api/v1/governance")
public class GovernanceController {

    private final GovernanceStore store;

    public GovernanceController(GovernanceStore store) {
        this.store = store;
    }

    /** Everything the module renders from, in one request. */
    @GetMapping("/bootstrap")
    public Map<String, Object> bootstrap() {
        return store.bootstrap();
    }

    // --- Checks -------------------------------------------------------------

    @PostMapping("/checks")
    public Map<String, Object> create(@RequestBody Map<String, Object> check) {
        store.saveCheck(check);
        return Map.of("id", String.valueOf(check.get("id")));
    }

    @PatchMapping("/checks/{id}")
    public Map<String, Object> save(@PathVariable String id, @RequestBody Map<String, Object> check) {
        check.put("id", id);
        store.saveCheck(check);
        return Map.of("id", id, "saved", true);
    }

    @PatchMapping("/checks/{id}/rule")
    public Map<String, Object> saveRule(@PathVariable String id, @RequestBody Map<String, Object> rule) {
        store.saveRule(id, rule);
        // Eligibility comes back with the save because saving a rule can change it —
        // moving an operand onto a presented document stops a gate being possible, and
        // the author should see that in the same breath as the edit.
        return store.gateEligibility(id);
    }

    @GetMapping("/checks/{id}/gate")
    public Map<String, Object> gate(@PathVariable String id) {
        return store.gateEligibility(id);
    }

    @PostMapping("/checks/{id}/gate")
    public Map<String, Object> setGate(@PathVariable String id, @RequestBody Map<String, Object> body) {
        boolean on = Boolean.TRUE.equals(body.get("on"));
        Map<String, Object> eligibility = store.gateEligibility(id);
        // Turning it on is refused when it cannot run first. Eligibility is derived, and a
        // stored flag that contradicts the derivation is a lie the run would have to resolve.
        if (on && !Boolean.TRUE.equals(eligibility.get("eligible"))) return eligibility;
        store.setGate(id, on);
        return store.gateEligibility(id);
    }

    @DeleteMapping("/checks/{id}")
    public Map<String, Object> deleteCheck(@PathVariable String id) {
        store.deleteCheck(id);
        return Map.of("deleted", id);
    }

    // --- Agents -------------------------------------------------------------

    @PostMapping("/agents")
    public Map<String, Object> createAgent(@RequestBody Map<String, Object> agent) {
        store.saveAgent(agent);
        return Map.of("id", String.valueOf(agent.get("id")));
    }

    @PatchMapping("/agents/{id}")
    public Map<String, Object> saveAgent(@PathVariable String id, @RequestBody Map<String, Object> agent) {
        agent.put("id", id);
        store.saveAgent(agent);
        return Map.of("id", id, "saved", true);
    }

    @DeleteMapping("/agents/{id}")
    public Map<String, Object> deleteAgent(@PathVariable String id) {
        store.delete("agent", "id", id);
        return Map.of("deleted", id);
    }

    @PatchMapping("/agents/{agentId}/groups/{gid}")
    public Map<String, Object> saveGroup(@PathVariable String agentId, @PathVariable String gid,
                                         @RequestBody Map<String, Object> group) {
        group.put("agentId", agentId);
        group.put("gid", gid);
        store.saveGroup(group);
        return Map.of("gid", gid, "saved", true);
    }

    // --- Dictionary ---------------------------------------------------------

    @PatchMapping("/dictionary/fields/{key}")
    public Map<String, Object> saveField(@PathVariable String key, @RequestBody Map<String, Object> field) {
        field.put("key", key);
        store.saveField(field);
        return Map.of("key", key, "saved", true);
    }

    @DeleteMapping("/dictionary/fields/{key}")
    public Map<String, Object> deleteField(@PathVariable String key) {
        store.delete("dict_field", "key", key);
        return Map.of("deleted", key);
    }

    @PatchMapping("/dictionary/doc-types/{code}")
    public Map<String, Object> saveDocType(@PathVariable String code, @RequestBody Map<String, Object> docType) {
        docType.put("code", code);
        store.saveDocType(docType);
        return Map.of("code", code, "saved", true);
    }

    @DeleteMapping("/dictionary/doc-types/{code}")
    public Map<String, Object> deleteDocType(@PathVariable String code) {
        store.delete("doc_type", "code", code);
        return Map.of("deleted", code);
    }

    // --- Library ------------------------------------------------------------

    @PatchMapping("/library/books/{id}")
    public Map<String, Object> saveBook(@PathVariable String id, @RequestBody Map<String, Object> book) {
        book.put("id", id);
        store.saveBook(book);
        return Map.of("id", id, "saved", true);
    }

    @PatchMapping("/library/articles/{id}")
    public Map<String, Object> saveArticle(@PathVariable String id, @RequestBody Map<String, Object> article) {
        article.put("aid", id);
        store.saveArticle(article);
        return Map.of("id", id, "saved", true);
    }

    @DeleteMapping("/library/articles/{id}")
    public Map<String, Object> deleteArticle(@PathVariable String id) {
        store.delete("article", "id", id);
        return Map.of("deleted", id);
    }

    // --- Comments -----------------------------------------------------------

    @PostMapping("/comments")
    public Map<String, Object> addComment(@RequestBody Map<String, Object> comment) {
        store.addComment(comment);
        return Map.of("added", true);
    }
}
