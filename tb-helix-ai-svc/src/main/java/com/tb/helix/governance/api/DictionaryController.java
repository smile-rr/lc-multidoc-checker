package com.tb.helix.governance.api;

import com.tb.helix.governance.persistence.GovernanceStore;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The dictionary: fields, and the documents they are read from.
 *
 * <p>Small, and load-bearing. {@code beforeReading} on a document type is what decides
 * which checks can ever be hard checks, so a change here silently changes what the
 * examination is able to do first.
 */
@RestController
@RequestMapping("/api/v1/governance/dictionary")
public class DictionaryController {

    private final GovernanceStore store;

    public DictionaryController(GovernanceStore store) {
        this.store = store;
    }

    @PatchMapping("/fields/{key}")
    public Map<String, Object> saveField(@PathVariable String key, @RequestBody Map<String, Object> field) {
        field.put("key", key);
        store.saveField(field);
        return Map.of("key", key, "saved", true);
    }

    @DeleteMapping("/fields/{key}")
    public Map<String, Object> deleteField(@PathVariable String key) {
        store.delete(GovernanceStore.FIELD, key);
        return Map.of("deleted", key);
    }

    @PatchMapping("/doc-types/{code}")
    public Map<String, Object> saveDocType(@PathVariable String code, @RequestBody Map<String, Object> docType) {
        docType.put("code", code);
        store.saveDocType(docType);
        return Map.of("code", code, "saved", true);
    }

    @DeleteMapping("/doc-types/{code}")
    public Map<String, Object> deleteDocType(@PathVariable String code) {
        store.delete(GovernanceStore.DOC_TYPE, code);
        return Map.of("deleted", code);
    }
}
