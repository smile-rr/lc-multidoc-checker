package com.tb.helix.governance.api;

import com.tb.helix.governance.persistence.GovernanceStore;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Agents and the groups of checks that sit under them. */
@RestController
@RequestMapping("/api/v1/governance/agents")
public class AgentsController {

    private final GovernanceStore store;

    public AgentsController(GovernanceStore store) {
        this.store = store;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> agent) {
        store.saveAgent(agent);
        return Map.of("id", String.valueOf(agent.get("id")));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> save(@PathVariable String id, @RequestBody Map<String, Object> agent) {
        agent.put("id", id);
        store.saveAgent(agent);
        return Map.of("id", id, "saved", true);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        store.delete(GovernanceStore.AGENT, id);
        return Map.of("deleted", id);
    }

    // Nested under the agent because a group has no meaning apart from one — its
    // sequence within that agent is the taxonomy the checks are read in.
    @PatchMapping("/{agentId}/groups/{gid}")
    public Map<String, Object> saveGroup(@PathVariable String agentId, @PathVariable String gid,
                                         @RequestBody Map<String, Object> group) {
        group.put("agentId", agentId);
        group.put("gid", gid);
        store.saveGroup(group);
        return Map.of("gid", gid, "saved", true);
    }
}
