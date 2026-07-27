package com.lc.gov.api.controller;

import com.lc.gov.infra.persistence.DictionaryStore;
import com.lc.gov.infra.persistence.RefsStore;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What this service is holding right now. Cheap enough to hit after a boot to
 * confirm the seed landed, which is the usual reason to ask.
 */
@RestController
@RequestMapping("/api/gov")
public class MetaController {

    private final DictionaryStore dictionary;
    private final RefsStore refs;

    public MetaController(DictionaryStore dictionary, RefsStore refs) {
        this.dictionary = dictionary;
        this.refs = refs;
    }

    @GetMapping("/meta")
    public Map<String, Object> meta() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("service", "lc-governance-svc");
        out.put("schema", "lc_gov");
        out.put("docTypes", dictionary.listDocTypes().size());
        out.put("dictionaryFields", dictionary.countFields());
        out.put("books", refs.listBooks().size());
        out.put("articles", refs.countArticles());
        return out;
    }
}
