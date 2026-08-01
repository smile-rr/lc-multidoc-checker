package com.tb.helix.lccheck.types;

import com.tb.helix.lccheck.types.document.FactView;
import com.tb.helix.lccheck.types.document.LcDocument;
import com.tb.helix.lccheck.types.examination.CheckArea;
import com.tb.helix.lccheck.types.examination.FindingView;
import com.tb.helix.lccheck.types.examination.PlanCheckView;

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
        /**
         * Who is examining it — the name an override is initialled with on the row.
         *
         * <p>Distinct from {@code authoriser}, who signs after them. Two different people and
         * two different acts, and a seam that showed the wrong one would put a name against a
         * call they did not make.
         */
        String officer,
        String pdfUrl,
        Integer totalPages,
        RunState runState,
        List<LcDocument> documents,
        List<Map<String, Object>> bundlePages,
        List<FactView> facts,
        List<CheckArea> areas,
        List<PlanCheckView> checks,
        List<FindingView> findings,
        /**
         * Where the officer overruled the engine, keyed by finding — and only there.
         *
         * <p>An absent entry is not a missing decision. It is the engine's own outcome
         * standing, which is the ordinary case and the reason this map is sparse: the
         * examination writes an outcome for every check, and a person only writes where they
         * disagree. Sent alongside the findings rather than merged into them, because merging
         * would destroy the pair the workbench has to be able to show.
         */
        List<Map<String, Object>> overrides,
        List<Map<String, Object>> runSteps) {
}
