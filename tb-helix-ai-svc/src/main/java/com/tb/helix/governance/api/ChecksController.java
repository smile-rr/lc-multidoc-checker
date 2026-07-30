package com.tb.helix.governance.api;

import com.tb.helix.governance.persistence.GovernanceStore;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Authoring checks.
 *
 * <p>The one section with logic worth naming: a check's conditions are a separate document
 * from the check, and saving them is what recomputes whether it could be a hard check.
 */
@RestController
@RequestMapping("/api/v1/governance/checks")
public class ChecksController {

    private final GovernanceStore store;

    public ChecksController(GovernanceStore store) {
        this.store = store;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> check) {
        store.saveCheck(check);
        return Map.of("id", String.valueOf(check.get("id")));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> save(@PathVariable String id, @RequestBody Map<String, Object> check) {
        check.put("id", id);
        store.saveCheck(check);
        return Map.of("id", id, "saved", true);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        store.deleteCheck(id);
        return Map.of("deleted", id);
    }

    /**
     * The conditions of an exact check.
     *
     * <p>Answers with eligibility, because saving a rule can change it: move an operand onto
     * a presented document and the check stops being able to run first. The author should
     * see that in the same breath as the edit, not on the next page load.
     */
    @PatchMapping("/{id}/rule")
    public Map<String, Object> saveRule(@PathVariable String id, @RequestBody Map<String, Object> rule) {
        store.saveRule(id, rule);
        return store.gateEligibility(id);
    }

    @GetMapping("/{id}/gate")
    public Map<String, Object> gate(@PathVariable String id) {
        return store.gateEligibility(id);
    }

    /**
     * Turning a hard check on or off.
     *
     * <p>Turning it on is refused when the check cannot run first. Eligibility is derived
     * from the dictionary; a stored flag contradicting the derivation is a lie the run would
     * have to resolve, and it would resolve it by not running the gate at all.
     */
    @PostMapping("/{id}/gate")
    public Map<String, Object> setGate(@PathVariable String id, @RequestBody Map<String, Object> body) {
        boolean on = Boolean.TRUE.equals(body.get("on"));
        Map<String, Object> eligibility = store.gateEligibility(id);
        if (on && !Boolean.TRUE.equals(eligibility.get("eligible"))) return eligibility;
        store.setGate(id, on);
        return store.gateEligibility(id);
    }
}
