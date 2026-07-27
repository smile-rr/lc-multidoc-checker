package com.lc.gov.dictionary;

import com.lc.gov.dictionary.SheetParser.SheetRow;
import com.lc.gov.domain.dictionary.DictField;
import com.lc.gov.domain.dictionary.DocTypeDef;
import com.lc.gov.infra.persistence.DictionaryStore;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Replace-all import of the Dictionary from a spreadsheet.
 *
 * <p>Delete every row, insert what the sheet says. The sheet is the whole
 * dictionary — including DERIVED and EXTERNAL entries, which is what the
 * {@code kind} column is for.
 *
 * <p>Nothing is written unless the entire sheet validates, so a rejected upload
 * leaves the previous dictionary intact.
 */
@Service
public class DictionaryImportService {

    private static final Logger log = LoggerFactory.getLogger(DictionaryImportService.class);

    private final SheetParser parser;
    private final DictionaryStore dictionary;

    public DictionaryImportService(SheetParser parser, DictionaryStore dictionary) {
        this.parser = parser;
        this.dictionary = dictionary;
    }

    /** What a replace did, so the caller can see the size of what just happened. */
    public record ImportResult(int removed, int inserted, List<String> warnings) {}

    // ── fields ──────────────────────────────────────────────────────────────

    public ImportResult replaceFields(String filename, InputStream in) throws IOException {
        List<SheetRow> rows = parser.parse(filename, in);
        if (rows.isEmpty()) throw new SheetException("the sheet has no data rows");

        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Set<String> seenKeys = new HashSet<>();
        List<DictField> fields = new ArrayList<>();

        // Unknown doc-type codes in applies_to are reported, not rejected: the
        // two sheets are uploaded separately and either order should work.
        Set<String> knownDocTypes = dictionary.docTypeCodes();
        Set<String> unknownDocTypes = new LinkedHashSet<>();

        for (SheetRow row : rows) {
            String key = row.get("key");
            if (key == null) {
                errors.add("row " + row.number() + ": key is required");
                continue;
            }
            if (!seenKeys.add(key)) {
                errors.add("row " + row.number() + ": duplicate key '" + key + "'");
                continue;
            }
            String nameEn = row.get("name_en");
            if (nameEn == null) {
                errors.add("row " + row.number() + ": name_en is required (key '" + key + "')");
                continue;
            }
            String kind = row.get("kind");
            if (kind == null) {
                kind = DictField.LC_FIELD;
            } else {
                kind = kind.toUpperCase().replace(' ', '_');
                if (!SheetSchema.KINDS.contains(kind)) {
                    errors.add("row " + row.number() + ": kind '" + row.get("kind")
                            + "' is not one of " + SheetSchema.KINDS);
                    continue;
                }
            }

            List<String> appliesTo = row.list("applies_to");
            appliesTo.stream().filter(c -> !knownDocTypes.contains(c)).forEach(unknownDocTypes::add);

            fields.add(new DictField(
                    key, nameEn, row.get("name_zh"), kind,
                    row.get("value_type"), row.get("field_group"),
                    row.list("source_tags"), appliesTo,
                    row.bool("rule_relevant", true),
                    row.get("description"),
                    false));
        }

        if (!errors.isEmpty()) {
            throw new SheetException(errors.size() + " problem(s) in the sheet — nothing was changed", errors);
        }
        if (!unknownDocTypes.isEmpty()) {
            warnings.add("applies_to names doc types that do not exist yet: "
                    + String.join(", ", unknownDocTypes));
        }

        int removed = dictionary.replaceAllFields(fields);
        log.info("Dictionary fields replaced from {} — {} removed, {} inserted",
                filename, removed, fields.size());
        return new ImportResult(removed, fields.size(), warnings);
    }

    // ── doc types ───────────────────────────────────────────────────────────

    public ImportResult replaceDocTypes(String filename, InputStream in) throws IOException {
        List<SheetRow> rows = parser.parse(filename, in);
        if (rows.isEmpty()) throw new SheetException("the sheet has no data rows");

        List<String> errors = new ArrayList<>();
        Set<String> seenCodes = new HashSet<>();
        List<DocTypeDef> docTypes = new ArrayList<>();
        int position = 0;

        for (SheetRow row : rows) {
            String code = row.get("code");
            if (code == null) {
                errors.add("row " + row.number() + ": code is required");
                continue;
            }
            if (!seenCodes.add(code)) {
                errors.add("row " + row.number() + ": duplicate code '" + code + "'");
                continue;
            }
            String nameEn = row.get("name_en");
            if (nameEn == null) {
                errors.add("row " + row.number() + ": name_en is required (code '" + code + "')");
                continue;
            }
            Integer ordinal = row.integer("ordinal");
            docTypes.add(new DocTypeDef(
                    code, nameEn, row.get("name_zh"), row.get("description"),
                    ordinal == null ? position : ordinal));
            position++;
        }

        if (!errors.isEmpty()) {
            throw new SheetException(errors.size() + " problem(s) in the sheet — nothing was changed", errors);
        }

        int removed = dictionary.replaceAllDocTypes(docTypes);
        log.info("Doc types replaced from {} — {} removed, {} inserted",
                filename, removed, docTypes.size());
        return new ImportResult(removed, docTypes.size(), List.of());
    }
}
