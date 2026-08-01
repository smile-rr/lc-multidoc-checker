package com.tb.helix.governance.api;

import com.tb.helix.governance.persistence.GovernanceStore;
import com.tb.helix.governance.types.ConditionFn;
import com.tb.helix.governance.types.ConditionTree;
import com.tb.helix.governance.types.Operator;

import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The catalogue as a whole, and the conversation around it.
 *
 * <p>Everything that is not one kind of thing. The section controllers beside this one each
 * own a noun; bootstrap owns all of them at once, and a comment can hang off any.
 */
@RestController
@RequestMapping("/api/v1/governance")
public class CatalogController {

    private final GovernanceStore store;

    public CatalogController(GovernanceStore store) {
        this.store = store;
    }

    /**
     * Everything the module renders from, in one request.
     *
     * <p>One request rather than eight. The sections are navigated between constantly, and
     * eight round trips on first paint to render a page that then needs none is the wrong
     * trade for a catalogue this size.
     */
    @GetMapping("/bootstrap")
    public Map<String, Object> bootstrap() {
        Map<String, Object> out = new LinkedHashMap<>(store.bootstrap());
        out.put("conditions", conditionVocabulary());
        return out;
    }

    /**
     * What a condition may be made of, served rather than duplicated.
     *
     * <p>The console used to carry its own list of twenty operators with its own labels and
     * its own grouping, the planner's prompt was assembled from a third hand-written list,
     * and the enum was the fourth. Four statements of one vocabulary, kept in step by
     * somebody remembering. Adding an operator meant editing three files in two languages,
     * and the edit that is forgotten is the one that leaves the console offering a comparison
     * nothing implements.
     *
     * <p>Served with the catalogue rather than from an endpoint of its own for the reason
     * {@link #bootstrap()} exists at all: the console needs it on first paint and never
     * again.
     *
     * <p>{@code version} is what this build can evaluate. A console newer than the service
     * can see that it must not author what the service would refuse.
     */
    private Map<String, Object> conditionVocabulary() {
        List<Map<String, Object>> ops = Operator.authorable().stream().map(o -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("wire", o.wire());
            m.put("label", o.label());
            m.put("group", o.group().name());
            m.put("groupLabel", o.group().label());
            m.put("arity", o.unary() ? 1 : 2);
            m.put("literalRight", o.literalRight());
            // Whether the qualifier box means anything. On sixteen of the twenty it does
            // not, and the console has been showing an input that is read by nothing.
            m.put("usesTol", o.usesTol());
            // Honest about the four that are judgements: the console may offer them — that
            // is what falling through to an examiner is for — but it should say so.
            m.put("judgement", o.needsJudgement());
            m.put("describe", o.describe());
            return m;
        }).toList();

        List<Map<String, Object>> fns = ConditionFn.all().stream().map(f -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("wire", f.wire());
            m.put("arity", f.arity());
            m.put("describe", f.describe());
            return m;
        }).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", ConditionTree.SUPPORTED);
        out.put("operators", ops);
        // The values an operand may work out rather than read. Without them UCP 600 art.
        // 14(c) cannot be written as a comparison at all — there is no field called
        // "twenty-one days after the on-board date".
        out.put("functions", fns);
        // What to put where a document code goes when the demand is about all of them.
        out.put("anyDocument", ConditionTree.ANY_DOCUMENT);
        return out;
    }

    @PostMapping("/comments")
    public Map<String, Object> addComment(@RequestBody Map<String, Object> comment) {
        store.addComment(comment);
        return Map.of("added", true);
    }
}
