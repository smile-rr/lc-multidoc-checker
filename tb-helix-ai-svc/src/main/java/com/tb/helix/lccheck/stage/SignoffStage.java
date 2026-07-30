package com.tb.helix.lccheck.stage;

import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.pipeline.*;
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
    public StageOutcome execute(StageContext ctx) {
        Map<String, Object> row = cases.find(ctx.caseId()).orElseThrow();
        Map<String, String> decisions = cases.decisions(ctx.caseId()).stream()
                .collect(java.util.stream.Collectors.toMap(
                        d -> String.valueOf(d.get("finding_ref")),
                        d -> String.valueOf(d.get("disposition")),
                        (a, b) -> b));

        List<Map<String, Object>> agreed = cases.findings(ctx.caseId()).stream()
                .filter(f -> "agreed".equals(decisions.get(String.valueOf(f.get("finding_ref")))))
                .toList();

        String mt734 = mt734(row, agreed);
        ctx.recordStep("report", Map.of(
                "grounds", agreed.size(),
                "mt734", mt734,
                "verdict", cases.verdict(ctx.caseId()).map(v -> String.valueOf(v.get("verdict"))).orElse("refuse")));

        cases.patchCase(ctx.caseId(), Map.of(
                "status", agreed.isEmpty() ? "clean" : "with_authoriser",
                "completed_at", java.sql.Timestamp.from(java.time.Instant.now())));
        return StageOutcome.ok();
    }

    private String mt734(Map<String, Object> c, List<Map<String, Object>> grounds) {
        StringBuilder sb = new StringBuilder();
        sb.append(":20:").append(nz(c.get("case_ref"))).append('\n');
        sb.append(":21:").append(nz(c.get("credit_ref"))).append('\n');
        sb.append(":32A:").append(LocalDate.now().toString().replace("-", "").substring(2))
          .append(nz(c.get("currency"))).append(nz(c.get("amount"))).append('\n');
        sb.append(":57a:").append(nz(c.get("presenting_bank"))).append('\n');
        sb.append(":72:/REFUSAL/\n");
        sb.append(":77J:");
        if (grounds.isEmpty()) {
            sb.append("NO DISCREPANCIES.\n");
        } else {
            sb.append('\n');
            int n = 1;
            for (Map<String, Object> g : grounds) {
                Object statement = g.get("statement");
                sb.append(n++).append(". ")
                  .append(statement == null ? String.valueOf(g.get("title")).toUpperCase() : statement)
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
