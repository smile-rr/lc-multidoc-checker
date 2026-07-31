package com.tb.helix.lccheck.stage.signoff;

import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.pipeline.*;
import com.tb.helix.lccheck.types.StageId;
import com.tb.helix.lccheck.types.pipeline.StepResult;

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

    public SignoffStage(CaseStore cases) {
        this.cases = cases;
    }

    @Override
    public StageId id() {
        return StageId.SIGNOFF;
    }

    @Override
    public List<Step> steps() {
        return List.of(
                Step.of("report", "Drafting the refusal advice", this::draftAdvice));
    }

    private StepResult draftAdvice(StageContext ctx) {
        CaseRow row = cases.find(ctx.caseId()).orElseThrow();
        Map<String, String> decisions = cases.decisions(ctx.caseId()).stream()
                .collect(java.util.stream.Collectors.toMap(
                        ReadRows.Decision::findingRef,
                        d -> String.valueOf(d.disposition()),
                        (a, b) -> b));

        // Only what the officer agreed reaches the advice. A parked or rejected finding was
        // considered and set aside, and putting it in the notice anyway would make the
        // officer's decision meaningless.
        List<ReadRows.Finding> agreed = cases.findings(ctx.caseId()).stream()
                .filter(f -> "agreed".equals(decisions.get(f.findingRef())))
                .toList();

        String mt734 = mt734(row, agreed);
        cases.patchCase(ctx.caseId(), Map.of(
                "status", agreed.isEmpty() ? "clean" : "with_authoriser",
                "completed_at", java.sql.Timestamp.from(java.time.Instant.now())));

        return StepResult.ok(Map.of(
                "grounds", agreed.size(),
                "mt734", mt734,
                "verdict", cases.verdict(ctx.caseId()).map(ReadRows.Verdict::verdict).orElse("refuse")));
    }

    private String mt734(CaseRow c, List<ReadRows.Finding> grounds) {
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
                sb.append(n++).append(". ")
                  .append(g.statement() == null ? String.valueOf(g.title()).toUpperCase() : g.statement())
                  .append('\n');
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
