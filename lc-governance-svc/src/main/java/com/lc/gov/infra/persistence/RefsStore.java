package com.lc.gov.infra.persistence;

import com.lc.gov.domain.refs.Article;
import com.lc.gov.domain.refs.Book;
import java.sql.ResultSet;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/** The Library — {@code lc_gov.book} and {@code lc_gov.article}. */
@Component
public class RefsStore {

    private final JdbcTemplate jdbc;

    public RefsStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Book> BOOK_MAPPER = (ResultSet rs, int n) -> new Book(
            rs.getString("id"),
            rs.getString("name"),
            rs.getString("kind"),
            rs.getString("edition"),
            rs.getInt("article_count"));

    private static final RowMapper<Article> ARTICLE_MAPPER = (ResultSet rs, int n) -> new Article(
            rs.getString("id"),
            rs.getString("book_id"),
            rs.getString("article"),
            rs.getString("paragraph"),
            rs.getString("heading"),
            rs.getString("body"),
            rs.getInt("ordinal"));

    public void upsertBook(String id, String name, String kind, String edition) {
        jdbc.update("""
                INSERT INTO lc_gov.book (id, name, kind, edition)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, kind = EXCLUDED.kind, edition = EXCLUDED.edition
                """, id, name, kind, edition);
    }

    public void upsertArticle(Article a) {
        jdbc.update("""
                INSERT INTO lc_gov.article (id, book_id, article, paragraph, heading, body, ordinal)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    book_id   = EXCLUDED.book_id,
                    article   = EXCLUDED.article,
                    paragraph = EXCLUDED.paragraph,
                    heading   = EXCLUDED.heading,
                    body      = EXCLUDED.body,
                    ordinal   = EXCLUDED.ordinal
                """,
                a.id(), a.bookId(), a.article(), a.paragraph(), a.heading(), a.body(), a.ordinal());
    }

    public List<Book> listBooks() {
        return jdbc.query("""
                SELECT b.*, (SELECT COUNT(*) FROM lc_gov.article a WHERE a.book_id = b.id) AS article_count
                FROM lc_gov.book b
                ORDER BY b.kind, b.id
                """, BOOK_MAPPER);
    }

    public List<Article> listArticles(String bookId) {
        return jdbc.query("""
                SELECT * FROM lc_gov.article WHERE book_id = ? ORDER BY ordinal, id
                """, ARTICLE_MAPPER, bookId);
    }

    public List<Article> findArticles(List<String> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        return jdbc.query("""
                SELECT * FROM lc_gov.article WHERE id = ANY (?::text[]) ORDER BY ordinal, id
                """, ARTICLE_MAPPER, PgArrays.literal(ids));
    }

    /** Every citable id. A check may not cite what the Library does not hold. */
    public Set<String> articleIds() {
        return Set.copyOf(jdbc.queryForList("SELECT id FROM lc_gov.article", String.class));
    }

    public void requireKnownArticles(List<String> ids) {
        if (ids == null || ids.isEmpty()) return;
        Set<String> known = articleIds();
        List<String> unknown = ids.stream().filter(i -> !known.contains(i)).toList();
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException("unknown clause refs: " + String.join(", ", unknown));
        }
    }

    public int countArticles() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM lc_gov.article", Integer.class);
        return n == null ? 0 : n;
    }
}
