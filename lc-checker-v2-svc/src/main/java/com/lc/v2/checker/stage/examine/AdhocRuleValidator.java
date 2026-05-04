package com.lc.v2.checker.stage.examine;

import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.domain.rule.RuleOrigin;
import com.lc.v2.checker.infra.refs.ArticleRefRegistry;
import com.lc.v2.checker.infra.rules.RuleCatalogRegistry;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Validates planner-proposed ad-hoc rules:
 *  1. UCP/ISBP refs must exist in {@link ArticleRefRegistry} — hallucinated refs are dropped.
 *  2. Dedupe vs catalog by exact promptInstruction match.
 *  3. severity / check_type / origin normalisation.
 *  4. Hard cap at 8 rules, sorted DISCREPANCY > WARNING > INFO.
 */
@Component
public class AdhocRuleValidator {

    private static final Logger log = LoggerFactory.getLogger(AdhocRuleValidator.class);

    private static final int MAX_RULES = 8;
    private static final Set<String> VALID_SEVERITIES = Set.of("CRITICAL", "MAJOR", "MINOR",
            "INFO", "WARNING", "DISCREPANCY");

    private final ArticleRefRegistry refs;
    private final RuleCatalogRegistry catalog;

    public AdhocRuleValidator(ArticleRefRegistry refs, RuleCatalogRegistry catalog) {
        this.refs = refs;
        this.catalog = catalog;
    }

    public List<Rule> validate(List<Rule> proposals) {
        if (proposals == null || proposals.isEmpty()) return List.of();
        Set<String> catalogPrompts = new HashSet<>();
        for (Rule r : catalog.all()) {
            if (r.promptInstruction() != null) catalogPrompts.add(norm(r.promptInstruction()));
        }

        List<Rule> validated = new ArrayList<>();
        Set<String> seenPrompts = new HashSet<>(catalogPrompts);
        Set<String> seenIds = new HashSet<>();
        for (Rule p : proposals) {
            if (p == null || p.ruleId() == null) continue;
            String id = p.ruleId().trim();
            if (!id.startsWith("AH-")) {
                log.debug("dropping ad-hoc rule with non-AH id: {}", id);
                continue;
            }
            if (!seenIds.add(id)) continue;

            // Planner-discovered rules are always AGENTIC_ADHOC; planner's own
            // checkType field is overridden so the dispatcher routes consistently.
            String checkType = "AGENTIC_ADHOC";

            String severity = p.severity() == null ? "WARNING" : p.severity().toUpperCase(Locale.ROOT);
            if (!VALID_SEVERITIES.contains(severity)) severity = "WARNING";

            List<String> ucp = filterRefs(p.ucpRefs());
            List<String> isbp = filterRefs(p.isbpRefs());

            String prompt = p.promptInstruction();
            if (prompt == null || prompt.isBlank()) {
                log.debug("dropping ad-hoc rule {} — empty prompt_instruction", id);
                continue;
            }
            if (!seenPrompts.add(norm(prompt))) {
                log.debug("dropping ad-hoc rule {} — duplicate of catalog prompt", id);
                continue;
            }

            validated.add(new Rule(
                    id,
                    p.scope(),
                    p.triggerDocs(),
                    p.lcFieldsRequired(),
                    checkType,
                    severity,
                    p.polarity() == null ? "POSITIVE" : p.polarity().toUpperCase(Locale.ROOT),
                    p.waivable(),
                    ucp, isbp,
                    p.expression(),
                    prompt,
                    p.fieldKeys(),
                    true,
                    p.triggers(),
                    RuleOrigin.DYNAMIC,
                    p.evidenceLcClause(),
                    null
            ));
        }

        validated.sort(Comparator.comparingInt(AdhocRuleValidator::severityRank));
        if (validated.size() > MAX_RULES) {
            log.info("ad-hoc rule cap: keeping {} of {} proposals", MAX_RULES, validated.size());
            return validated.subList(0, MAX_RULES);
        }
        return validated;
    }

    private List<String> filterRefs(List<String> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        List<String> kept = new ArrayList<>(ids.size());
        for (String id : ids) {
            if (id == null) continue;
            if (refs.byId(id).isPresent()) kept.add(id);
            else log.debug("dropping unknown ref id: {}", id);
        }
        return kept;
    }

    private static int severityRank(Rule r) {
        return switch (r.severity()) {
            case "DISCREPANCY", "CRITICAL" -> 0;
            case "MAJOR", "WARNING" -> 1;
            case "MINOR", "INFO" -> 2;
            default -> 3;
        };
    }

    private static String norm(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
    }
}
