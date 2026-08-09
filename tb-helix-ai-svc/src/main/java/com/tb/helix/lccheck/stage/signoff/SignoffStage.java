package com.tb.helix.lccheck.stage.signoff;

import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.pipeline.*;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * The advice that goes out.
 *
 * <p>Assembles what the officer agreed to into an MT734 refusal advice. Only findings they
 * <em>agreed</em> reach it — a parked or rejected finding was considered and set aside, and
 * putting it in the notice anyway would make the officer's decision meaningless.
 *
 * <p>Field 77J carries every ground, because UCP 600 art. 16(c) allows one notice stating
 * each discrepancy. Art. 16(f) is why: a bank that fails to notice properly is precluded
 * from claiming the documents do not comply. There is no second notice.
 */
@Component
public class SignoffStage implements Stage {

    private final CaseStore cases;
    private final AdviceNarrator narrator;

    public SignoffStage(CaseStore cases, AdviceNarrator narrator) {
        this.cases = cases;
        this.narrator = narrator;
    }

    @Override
    public StageId id() {
        return StageId.SIGNOFF;
    }

    @Override
    public List<Step<StageContext>> steps() {
        return List.of(
                Step.<StageContext>of("report", "Drafting the refusal advice", this::draftAdvice));
    }

    private StepResult draftAdvice(StageContext ctx) {
        CaseRow row = cases.find(ctx.caseId()).orElseThrow();
        Map<String, String> overridden = cases.overrides(ctx.caseId()).stream()
                .collect(java.util.stream.Collectors.toMap(
                        ReadRows.Override::findingRef,
                        ReadRows.Override::outcome,
                        (a, b) -> b));

        // Only what stands as a discrepancy reaches the advice, with the officer's call
        // applied — a discrepancy they cleared is not a ground, and a doubt they called
        // discrepant is. Reading the engine's outcome alone would state our view over
        // theirs on a notice that goes out over the bank's name.
        //
        // A finding left in doubt is never a ground. Art. 16(c) gives one notice and a
        // ground left off cannot be added later, so this is the one place the omission
        // costs something — but a doubt is precisely the case where nothing established
        // the discrepancy, and the case status carries it to the checker instead.
        List<ReadRows.Finding> grounds = cases.findings(ctx.caseId()).stream()
                .filter(f -> "DISCREPANT".equals(overridden.getOrDefault(f.findingRef(), f.outcome())))
                .toList();

        Map<String, String> drafted = narrator.wordFor(ctx.caseId(), row, grounds);
        String mt734 = mt734(row, grounds, drafted);
        cases.patchCase(ctx.caseId(), Map.of(
                "completed_at", java.sql.Timestamp.from(java.time.Instant.now())));

        return StepResult.ok(Map.of(
                "grounds", grounds.size(),
                "drafted", drafted.size(),
                "mt734", mt734,
                "status", cases.verdict(ctx.caseId()).map(ReadRows.Verdict::status)
                        .orElse(grounds.isEmpty() ? "CLEAN" : "DISCREPANT")));
    }

    /**
     * @param drafted the narrator's wording, by finding ref. Consulted, never iterated — the
     *                notice is assembled from {@code grounds}, so a ref the model invented is
     *                simply never looked up and one it omitted falls back to the finding's own
     *                statement. That is what makes "it may not add or drop a ground"
     *                structural rather than something to check afterwards.
     */
    private String mt734(CaseRow c, List<ReadRows.Finding> grounds, Map<String, String> drafted) {
        StringBuilder sb = new StringBuilder();
        sb.append(":20:").append(nz(c.caseRef())).append('\n');
        sb.append(":21:").append(nz(c.creditRef())).append('\n');
        sb.append(":32A:").append(LocalDate.now().toString().replace("-", "").substring(2))
          .append(nz(c.currency())).append(nz(c.amount())).append('\n');
        sb.append(":57a:").append(nz(c.presentingBank())).append('\n');
        sb.append(":72:/REFUSAL/\n");
        sb.append(":77J:");
        if (grounds.isEmpty()) {
            sb.append("NO DISCREPANCIES.\n");
        } else {
            sb.append('\n');
            int n = 1;
            for (ReadRows.Finding g : grounds) {
                String word = drafted.get(g.findingRef());
                if (word == null || word.isBlank()) {
                    word = g.statement() == null
                            ? String.valueOf(g.title()).toUpperCase()
                            : g.statement();
                }
                sb.append(n++).append(". ").append(word).append('\n');
            }
        }
        // The disposal instruction is a required part of a refusal under art. 16(c)(iii).
        sb.append(":77B:/HOLD/DOCUMENTS HELD AT YOUR RISK AND DISPOSAL\n");
        return sb.toString();
    }

    private String nz(Object o) {
        return o == null ? "" : String.valueOf(o);
    }
}
