package com.tb.helix.governance.api;

import com.tb.helix.governance.persistence.GovernanceStore;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The catalogue as a whole, and the conversation around it.
 *
 * <p>Everything that is not one kind of thing. The section controllers beside this one each
 * own a noun; bootstrap owns all of them at once, and a comment can hang off any.
 */
@RestController
@RequestMapping("/api/v1/governance")
public class CatalogController {

    private final GovernanceStore store;

    public CatalogController(GovernanceStore store) {
        this.store = store;
    }

    /**
     * Everything the module renders from, in one request.
     *
     * <p>One request rather than eight. The sections are navigated between constantly, and
     * eight round trips on first paint to render a page that then needs none is the wrong
     * trade for a catalogue this size.
     */
    @GetMapping("/bootstrap")
    public Map<String, Object> bootstrap() {
        return store.bootstrap();
    }

    @PostMapping("/comments")
    public Map<String, Object> addComment(@RequestBody Map<String, Object> comment) {
        store.addComment(comment);
        return Map.of("added", true);
    }
}
