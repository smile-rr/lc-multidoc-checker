package com.lc.gov.library;

import com.lc.gov.domain.refs.Article;
import com.lc.gov.domain.refs.Book;
import com.lc.gov.infra.config.GovernanceProperties;
import com.lc.gov.infra.persistence.RefsStore;
import com.lc.gov.library.ArticleSplitter.Candidate;
import com.lc.gov.library.ArticleSplitter.SplitResult;
import com.lc.gov.library.PdfTextExtractor.ExtractedPdf;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Two-step import of a rulebook PDF into the Library.
 *
 * <pre>
 *   1  upload  → extract text, reject a scan, split into candidates, stage
 *   2  confirm → the accepted subset becomes a book's articles
 * </pre>
 *
 * <p>Two steps because no splitter gets an arbitrary handbook right first time.
 * Committing straight from the parser would put mis-split fragments into the
 * Library as real citable articles, and a citation is expensive to withdraw once
 * a check points at it. The staged import mirrors the governance UI's existing
 * import modal — split, review, untick, create.
 *
 * <p>Staged imports live in memory only. Losing one to a restart costs a
 * re-upload; persisting them would mean storing PDF bytes, and this service has
 * no object storage by design.
 */
@Service
public class LibraryImportService {

    private static final Logger log = LoggerFactory.getLogger(LibraryImportService.class);

    private final PdfTextExtractor extractor;
    private final ArticleSplitter splitter;
    private final RefsStore refs;
    private final GovernanceProperties props;

    private final Map<String, StagedImport> staged = new ConcurrentHashMap<>();

    public LibraryImportService(PdfTextExtractor extractor, ArticleSplitter splitter,
                                RefsStore refs, GovernanceProperties props) {
        this.extractor = extractor;
        this.splitter = splitter;
        this.refs = refs;
        this.props = props;
    }

    public record StagedImport(
            String importId,
            String filename,
            int pageCount,
            int totalChars,
            int emptyPages,
            String strategy,
            List<Candidate> candidates,
            Instant createdAt) {}

    public record ConfirmResult(
            String bookId,
            String name,
            int articlesCreated,
            int articlesRemoved,
            List<String> skippedDuplicateLabels) {}

    // ── step 1 — upload, split, stage ───────────────────────────────────────

    public StagedImport stage(String filename, byte[] bytes) {
        evictExpired();

        ExtractedPdf pdf = extractor.extract(filename, bytes);
        SplitResult split = splitter.split(pdf);

        if (split.candidates().isEmpty()) {
            throw new PdfRejectedException(
                    "text was extracted but no articles could be identified — "
                            + "the document may not be structured as a rulebook");
        }

        StagedImport staging = new StagedImport(
                UUID.randomUUID().toString(), filename,
                pdf.pageCount(), pdf.totalChars(), pdf.emptyPages(),
                split.strategy(), split.candidates(), Instant.now());

        staged.put(staging.importId(), staging);
        log.info("Staged library import {} — {} ({} pages, {} chars) split by '{}' into {} candidates",
                staging.importId(), filename, pdf.pageCount(), pdf.totalChars(),
                split.strategy(), split.candidates().size());
        return staging;
    }

    public StagedImport get(String importId) {
        evictExpired();
        StagedImport found = staged.get(importId);
        if (found == null) {
            throw new IllegalArgumentException(
                    "no staged import '" + importId + "' — it may have expired; upload the PDF again");
        }
        return found;
    }

    // ── step 2 — confirm the accepted subset ────────────────────────────────

    /**
     * Writes the accepted candidates as a book. Confirming onto an existing
     * {@code bookId} replaces that book's articles wholesale.
     *
     * @param acceptedIndexes candidate indexes to keep; null or empty means all
     */
    public ConfirmResult confirm(String importId, String bookId, String name, String edition,
                                 List<Integer> acceptedIndexes) {
        StagedImport staging = get(importId);

        String id = normaliseBookId(bookId);
        if (id.isEmpty()) throw new IllegalArgumentException("bookId is required");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("name is required");

        Set<Integer> accepted = (acceptedIndexes == null || acceptedIndexes.isEmpty())
                ? null
                : new HashSet<>(acceptedIndexes);

        List<Article> articles = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        Set<String> usedIds = new HashSet<>();
        int ordinal = 0;

        for (Candidate candidate : staging.candidates()) {
            if (accepted != null && !accepted.contains(candidate.index())) continue;

            String articleId = ArticleSplitter.articleId(id, candidate.label());
            if (!usedIds.add(articleId)) {
                // Two candidates parsed to the same label. Dropping the later one
                // keeps ids deterministic; silently suffixing would make a
                // re-import produce different ids for the same document.
                skipped.add(candidate.label());
                continue;
            }

            articles.add(new Article(
                    articleId, id, candidate.label(), null,
                    candidate.heading(), candidate.body(), ordinal++));
        }

        if (articles.isEmpty()) {
            throw new IllegalArgumentException("no candidates were accepted — nothing to create");
        }

        int removed = refs.replaceBook(id, name, Book.INTERNAL, edition, articles);
        staged.remove(importId);

        log.info("Library book {} written from import {} — {} articles ({} removed, {} duplicate labels skipped)",
                id, importId, articles.size(), removed, skipped.size());
        return new ConfirmResult(id, name, articles.size(), removed, skipped);
    }

    public void discard(String importId) {
        staged.remove(importId);
    }

    // ── housekeeping ────────────────────────────────────────────────────────

    private void evictExpired() {
        Duration ttl = Duration.ofMinutes(props.getLibrary().getStagedTtlMinutes());
        Instant cutoff = Instant.now().minus(ttl);
        staged.entrySet().removeIf(e -> e.getValue().createdAt().isBefore(cutoff));
    }

    /** Book ids appear inside every citation, so they are constrained here
     *  rather than left to whatever the author typed. */
    private static String normaliseBookId(String raw) {
        if (raw == null) return "";
        return raw.trim().toUpperCase()
                .replaceAll("[^A-Z0-9]+", "-")
                .replaceAll("^-|-$", "");
    }
}
