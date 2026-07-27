package com.lc.gov.api.controller;

import com.lc.gov.api.dto.LibraryDtos.ConfirmImportRequest;
import com.lc.gov.domain.refs.Article;
import com.lc.gov.domain.refs.Book;
import com.lc.gov.infra.persistence.PgArrays;
import com.lc.gov.infra.persistence.RefsStore;
import com.lc.gov.library.LibraryImportService;
import com.lc.gov.library.LibraryImportService.ConfirmResult;
import com.lc.gov.library.LibraryImportService.StagedImport;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The Library — reference books and their articles.
 *
 * <pre>
 *   GET    /api/gov/library/books                  UCP 600, ISBP 821, handbooks
 *   GET    /api/gov/library/books/{id}/articles
 *   DELETE /api/gov/library/books/{id}
 *   GET    /api/gov/library/articles?ids=A,B       resolve citations for display
 *
 *   POST   /api/gov/library/imports                upload a PDF → split → stage
 *   GET    /api/gov/library/imports/{id}           re-read the candidates
 *   POST   /api/gov/library/imports/{id}/confirm   accepted subset → a book
 *   DELETE /api/gov/library/imports/{id}           throw the staged import away
 * </pre>
 *
 * <p>Import is two-step on purpose. No splitter reads an arbitrary handbook
 * correctly first time, and an article is a citation target — once a check
 * points at one, a bad split is expensive to withdraw. The author reviews the
 * proposal before anything is written.
 *
 * <p>Confirming onto an existing book id replaces that book's articles.
 */
@RestController
@RequestMapping("/api/gov/library")
public class LibraryController {

    private final RefsStore refs;
    private final LibraryImportService importer;

    public LibraryController(RefsStore refs, LibraryImportService importer) {
        this.refs = refs;
        this.importer = importer;
    }

    // ── books ───────────────────────────────────────────────────────────────

    @GetMapping("/books")
    public Map<String, Object> books() {
        List<Book> books = refs.listBooks();
        return Map.of("count", books.size(), "books", books);
    }

    @GetMapping("/books/{bookId}/articles")
    public ResponseEntity<Map<String, Object>> articles(@PathVariable String bookId) {
        if (!refs.bookExists(bookId)) return ResponseEntity.notFound().build();
        List<Article> articles = refs.listArticles(bookId);
        return ResponseEntity.ok(Map.of("bookId", bookId, "count", articles.size(), "articles", articles));
    }

    @DeleteMapping("/books/{bookId}")
    public ResponseEntity<Void> deleteBook(@PathVariable String bookId) {
        return refs.deleteBook(bookId)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    @GetMapping("/articles")
    public Map<String, Object> resolve(@RequestParam(required = false) String ids) {
        List<Article> articles = refs.findArticles(PgArrays.csv(ids));
        return Map.of("count", articles.size(), "articles", articles);
    }

    // ── PDF import, step 1 ──────────────────────────────────────────────────

    @PostMapping("/imports")
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file) throws IOException {
        StagedImport staged = importer.stage(file.getOriginalFilename(), file.getBytes());
        return stagedResponse(staged);
    }

    @GetMapping("/imports/{importId}")
    public Map<String, Object> staged(@PathVariable String importId) {
        return stagedResponse(importer.get(importId));
    }

    // ── PDF import, step 2 ──────────────────────────────────────────────────

    @PostMapping("/imports/{importId}/confirm")
    public ConfirmResult confirm(@PathVariable String importId,
                                 @Valid @RequestBody ConfirmImportRequest request) {
        return importer.confirm(importId, request.bookId(), request.name(),
                request.edition(), request.acceptedIndexes());
    }

    @DeleteMapping("/imports/{importId}")
    public ResponseEntity<Void> discard(@PathVariable String importId) {
        importer.discard(importId);
        return ResponseEntity.noContent().build();
    }

    // ── responses ───────────────────────────────────────────────────────────

    /** The body the review screen renders: how the split was reached, and each
     *  candidate with enough text to judge it without opening the PDF. */
    private Map<String, Object> stagedResponse(StagedImport staged) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("importId", staged.importId());
        out.put("filename", staged.filename());
        out.put("pageCount", staged.pageCount());
        out.put("totalChars", staged.totalChars());
        out.put("emptyPages", staged.emptyPages());
        out.put("strategy", staged.strategy());
        out.put("candidateCount", staged.candidates().size());
        out.put("candidates", staged.candidates().stream().map(c -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("index", c.index());
            item.put("label", c.label());
            item.put("heading", c.heading());
            item.put("page", c.page());
            item.put("charCount", c.charCount());
            item.put("preview", c.body().length() <= 280 ? c.body() : c.body().substring(0, 279) + "…");
            return item;
        }).toList());
        return out;
    }
}
