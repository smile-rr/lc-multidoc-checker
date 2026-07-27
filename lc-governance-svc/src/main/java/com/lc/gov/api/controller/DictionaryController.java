package com.lc.gov.api.controller;

import com.lc.gov.domain.dictionary.DictField;
import com.lc.gov.domain.dictionary.DocTypeDef;
import com.lc.gov.infra.persistence.DictionaryStore;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Dictionary — the vocabulary a check may name.
 *
 * <pre>
 *   GET /api/gov/dictionary/fields[?docType=INV]   the field pool
 *   GET /api/gov/dictionary/doc-types              document types
 *   GET /api/gov/dictionary/keys                   keys only, for editor lint/autocomplete
 * </pre>
 */
@RestController
@RequestMapping("/api/gov/dictionary")
public class DictionaryController {

    private final DictionaryStore dictionary;

    public DictionaryController(DictionaryStore dictionary) {
        this.dictionary = dictionary;
    }

    @GetMapping("/fields")
    public Map<String, Object> fields(@RequestParam(required = false) String docType) {
        List<DictField> fields = (docType == null || docType.isBlank())
                ? dictionary.listFields()
                : dictionary.listFieldsForDocType(docType);
        return Map.of("count", fields.size(), "fields", fields);
    }

    @GetMapping("/doc-types")
    public Map<String, Object> docTypes() {
        List<DocTypeDef> types = dictionary.listDocTypes();
        return Map.of("count", types.size(), "docTypes", types);
    }

    /** Bare keys — what the rule editor autocompletes and lints {token}s against. */
    @GetMapping("/keys")
    public Map<String, Object> keys() {
        return Map.of("keys", dictionary.fieldKeys().stream().sorted().toList());
    }
}
