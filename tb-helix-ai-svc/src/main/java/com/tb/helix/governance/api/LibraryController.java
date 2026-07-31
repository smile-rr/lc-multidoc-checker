package com.tb.helix.governance.api;

import com.tb.helix.governance.persistence.GovernanceStore;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The library: the books and articles checks cite.
 *
 * <p>Import is deliberately absent. Reading a handbook out of a PDF is future work, and a
 * stub that resolved would make the UI look like it works.
 */
@RestController
@RequestMapping("/api/v1/governance/library")
public class LibraryController {

    private final GovernanceStore store;

    public LibraryController(GovernanceStore store) {
        this.store = store;
    }

    @PatchMapping("/books/{id}")
    public Map<String, Object> saveBook(@PathVariable String id, @RequestBody Map<String, Object> book) {
        book.put("id", id);
        store.saveBook(book);
        return Map.of("id", id, "saved", true);
    }

    @PatchMapping("/articles/{id}")
    public Map<String, Object> saveArticle(@PathVariable String id, @RequestBody Map<String, Object> article) {
        article.put("aid", id);
        store.saveArticle(article);
        return Map.of("id", id, "saved", true);
    }

    @DeleteMapping("/articles/{id}")
    public Map<String, Object> deleteArticle(@PathVariable String id) {
        store.deleteArticle(id);
        return Map.of("deleted", id);
    }
}
