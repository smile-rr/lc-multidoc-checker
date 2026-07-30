package com.tb.helix.lccheck.domain;

import java.util.List;
import java.util.Map;

/**
 * Everything the workbench needs for one case, in one response.
 *
 * <p>One request rather than eight: the officer moves between intake, interpret, checks,
 * review and decision constantly, and a screen that refetched on each move would spend its
 * life loading. The case is a few hundred kilobytes; the bundle PDF is fetched separately
 * and is the only large thing.
 */
public record CaseDetail(
        String id,
        String status,
        CreditTerms credit,
        String presentedDate,
        String presentingBank,
        Integer replyDueDays,
        String authoriser,
        String pdfUrl,
        Integer totalPages,
        RunState runState,
        List<LcDocument> documents,
        List<Map<String, Object>> bundlePages,
        List<FactView> facts,
        List<CheckArea> areas,
        List<PlanCheckView> checks,
        List<FindingView> findings,
        List<Map<String, Object>> runSteps) {
}
