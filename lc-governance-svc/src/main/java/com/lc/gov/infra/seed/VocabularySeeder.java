package com.lc.gov.infra.seed;

import com.lc.gov.domain.dictionary.DictField;
import com.lc.gov.domain.dictionary.DocTypeDef;
import com.lc.gov.domain.refs.Article;
import com.lc.gov.domain.refs.Book;
import com.lc.gov.infra.config.GovernanceProperties;
import com.lc.gov.infra.persistence.DictionaryStore;
import com.lc.gov.infra.persistence.RefsStore;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Loads the vocabulary — Dictionary and Library — from YAML on boot.
 *
 * <p>The source files are copies of the checker's {@code fields/} and {@code refs/}
 * resources. Governance owns this vocabulary; the checker keeps its own copy
 * until the catalog cutover, at which point these become the single source and
 * the checker reads a published release instead.
 *
 * <p>Idempotent: every write is an upsert, and a row a human has taken over
 * ({@code seeded = false}) is never overwritten.
 */
@Component
public class VocabularySeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(VocabularySeeder.class);

    private final GovernanceProperties props;
    private final YamlReader yaml;
    private final DictionaryStore dictionary;
    private final RefsStore refs;

    public VocabularySeeder(GovernanceProperties props, YamlReader yaml,
                            DictionaryStore dictionary, RefsStore refs) {
        this.props = props;
        this.yaml = yaml;
        this.dictionary = dictionary;
        this.refs = refs;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!props.getSeed().isEnabled()) {
            log.info("Vocabulary seeding disabled — dictionary has {} fields, library {} articles",
                    dictionary.countFields(), refs.countArticles());
            return;
        }
        try {
            int docTypes = seedDocTypes();
            int fields = seedFields();
            int articles = seedBooks();
            log.info("Vocabulary seeded — {} doc types, {} dictionary fields, {} articles",
                    docTypes, fields, articles);
        } catch (IOException e) {
            // Fail loud: a check cannot be authored, validated or deduped without
            // the vocabulary, so booting without it is worse than not booting.
            throw new IllegalStateException("vocabulary seed failed", e);
        }
    }

    // ── doc types ───────────────────────────────────────────────────────────

    private int seedDocTypes() throws IOException {
        Map<String, Object> root = readYaml(props.getSeed().getDocTypes());
        Object node = root.get("doc_types");
        if (!(node instanceof Map<?, ?> byCode)) return 0;

        int ordinal = 0, count = 0;
        for (Map.Entry<?, ?> entry : byCode.entrySet()) {
            if (!(entry.getValue() instanceof Map<?, ?> raw)) continue;
            String code = str(raw.get("code"), String.valueOf(entry.getKey()));
            dictionary.upsertDocType(new DocTypeDef(
                    code,
                    str(raw.get("name_en"), code),
                    str(raw.get("name_zh"), null),
                    str(raw.get("desc_en"), null),
                    ordinal++));
            count++;
        }
        return count;
    }

    // ── dictionary fields ───────────────────────────────────────────────────

    private int seedFields() throws IOException {
        Map<String, Object> root = readYaml(props.getSeed().getFieldPool());
        Object node = root.get("fields");
        if (!(node instanceof List<?> list)) return 0;

        int count = 0;
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> raw)) continue;
            String key = str(raw.get("key"), null);
            if (key == null) continue;

            List<String> sourceTags = strings(raw.get("source_tags"));
            List<String> appliesTo = strings(raw.get("applies_to"));

            dictionary.upsertSeeded(new DictField(
                    key,
                    str(raw.get("name_en"), key),
                    str(raw.get("name_zh"), null),
                    // A field carrying a SWIFT tag is read off the credit; anything
                    // else in the pool is read off a presented document. DERIVED and
                    // EXTERNAL entries are authored by hand, never seeded.
                    sourceTags.isEmpty() ? DictField.DOC_DATA_POINT : DictField.LC_FIELD,
                    str(raw.get("type"), null),
                    str(raw.get("group"), null),
                    sourceTags,
                    appliesTo,
                    !Boolean.FALSE.equals(raw.get("rule_relevant")),
                    null,
                    true));
            count++;
        }
        return count;
    }

    // ── reference books ─────────────────────────────────────────────────────

    private int seedBooks() throws IOException {
        int total = 0;
        for (GovernanceProperties.BookSeed book : props.getSeed().getBooks()) {
            refs.upsertBook(book.getId(), book.getName(), Book.STANDARD, book.getEdition());

            Map<String, Object> root = readYaml(book.getPath());
            if (!(root.get("refs") instanceof List<?> list)) continue;

            int ordinal = 0;
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> raw)) continue;
                String id = str(raw.get("id"), null);
                if (id == null) continue;
                refs.upsertArticle(new Article(
                        id,
                        book.getId(),
                        str(raw.get("article"), null),
                        str(raw.get("paragraph"), null),
                        str(raw.get("heading"), null),
                        str(raw.get("text"), ""),
                        ordinal++));
                total++;
            }
        }
        return total;
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private Map<String, Object> readYaml(String location) throws IOException {
        return yaml.readMap(location);
    }

    private static String str(Object value, String fallback) {
        if (value == null) return fallback;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? fallback : s;
    }

    private static List<String> strings(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        List<String> out = new ArrayList<>(list.size());
        for (Object o : list) if (o != null) out.add(String.valueOf(o));
        return out;
    }
}
