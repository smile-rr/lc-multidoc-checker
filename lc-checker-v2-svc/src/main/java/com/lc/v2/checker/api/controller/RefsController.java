package com.lc.v2.checker.api.controller;

import com.lc.v2.checker.domain.common.ArticleRef;
import com.lc.v2.checker.infra.refs.ArticleRefRegistry;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET /api/v2/refs/{id}   — single UCP/ISBP article by ID
 * GET /api/v2/refs        — all loaded article refs
 * Used by UI hover tooltips and "View full article" side panel.
 */
@RestController
@RequestMapping("/api/v2/refs")
public class RefsController {

    private final ArticleRefRegistry registry;

    public RefsController(ArticleRefRegistry registry) { this.registry = registry; }

    @GetMapping("/{id}")
    public ResponseEntity<ArticleRef> getRef(@PathVariable String id) {
        return registry.byId(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public List<ArticleRef> listRefs() { return registry.all(); }
}
