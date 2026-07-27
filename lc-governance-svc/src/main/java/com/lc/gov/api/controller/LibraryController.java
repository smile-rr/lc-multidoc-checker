package com.lc.gov.api.controller;

import com.lc.gov.domain.refs.Article;
import com.lc.gov.domain.refs.Book;
import com.lc.gov.infra.persistence.PgArrays;
import com.lc.gov.infra.persistence.RefsStore;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Library — reference books and their articles.
 *
 * <pre>
 *   GET /api/gov/library/books                  UCP 600, ISBP 821, internal handbooks
 *   GET /api/gov/library/books/{id}/articles    every article in a book
 *   GET /api/gov/library/articles?ids=A,B       resolve citations for display
 * </pre>
 *
 * <p>Checks cite by id; the text is resolved here at read time so a check can
 * never carry a stale copy of a clause.
 */
@RestController
@RequestMapping("/api/gov/library")
public class LibraryController {

    private final RefsStore refs;

    public LibraryController(RefsStore refs) {
        this.refs = refs;
    }

    @GetMapping("/books")
    public Map<String, Object> books() {
        List<Book> books = refs.listBooks();
        return Map.of("count", books.size(), "books", books);
    }

    @GetMapping("/books/{bookId}/articles")
    public ResponseEntity<Map<String, Object>> articles(@PathVariable String bookId) {
        List<Article> articles = refs.listArticles(bookId);
        if (articles.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of("bookId", bookId, "count", articles.size(), "articles", articles));
    }

    @GetMapping("/articles")
    public Map<String, Object> resolve(@RequestParam(required = false) String ids) {
        List<Article> articles = refs.findArticles(PgArrays.csv(ids));
        return Map.of("count", articles.size(), "articles", articles);
    }
}
