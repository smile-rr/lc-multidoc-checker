package com.lc.v2.checker.stage.reconcile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.reconcile.ReconField;
import com.lc.v2.checker.infra.fields.FieldDefinition;
import com.lc.v2.checker.infra.fields.FieldPoolRegistry;
import com.lc.v2.checker.infra.observability.PipelineStage;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stage 2 — Reconcile.
 *
 * Builds a matrix of reconcile_canonical fields × {LC, each present doc}.
 *
 * <p><b>Mechanical, not semantic.</b> This stage answers
 * "are values literally consistent across documents after stripping cosmetic
 * differences?" — it does NOT make UCP/ISBP rule judgements. Tolerance per
 * UCP 30(b) is the only domain rule applied here. Goods-description
 * correspondence (ISBP C3) and other soft semantic compliance lives in
 * ExamineStage as AGENT rules, not here.</p>
 *
 * <p>Per-cell verdicts feed the matrix UI; row-level verdict (worst-of)
 * remains in {@code status} so ExamineStage's NOT_APPLICABLE shortcut still
 * works without change.</p>
 */
@PipelineStage(name = "reconcile")
@Component
public class ReconcileStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(ReconcileStage.class);

    private final FieldPoolRegistry fieldPool;
    private final ReconcileNormaliser normaliser;
    private final SessionStore sessionStore;
    private final ObjectMapper objectMapper;

    public ReconcileStage(FieldPoolRegistry fieldPool, ReconcileNormaliser normaliser,
                           SessionStore sessionStore, ObjectMapper objectMapper) {
        this.fieldPool = fieldPool;
        this.normaliser = normaliser;
        this.sessionStore = sessionStore;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() { return "reconcile"; }

    @Override
    public void execute(StageContext ctx) {
        long start = System.currentTimeMillis();
        ctx.eventBus.stageStarted(ctx.sessionId, "reconcile");

        List<FieldDefinition> canonical = fieldPool.reconcileCanonical();
        List<ReconField> fields = new ArrayList<>();

        for (FieldDefinition fd : canonical) {
            Map<DocType, Object> valueByDocType = new LinkedHashMap<>();
            Map<DocType, ReconField.ReconStatus> cellStatus = new LinkedHashMap<>();
            Map<DocType, String> cellDetail = new LinkedHashMap<>();

            // 1. Pull LC reference value (if present)
            Object lcVal = null;
            if (ctx.lc != null) {
                Object v = ctx.lc.envelope().get(fd.key());
                if (v != null && !v.toString().isBlank()) {
                    lcVal = v;
                    valueByDocType.put(DocType.LC, v);
                    cellStatus.put(DocType.LC, ReconField.ReconStatus.MATCH); // LC is the reference
                }
            }

            // 2. Pull each doc's value, compare to LC
            for (var entry : ctx.extracts.entrySet()) {
                DocType dt = entry.getKey();
                Object docVal = entry.getValue().consensus().get(fd.key());
                if (docVal != null && !docVal.toString().isBlank()) {
                    valueByDocType.put(dt, docVal);
                }

                if (lcVal == null) {
                    // No reference to compare against
                    cellStatus.put(dt, ReconField.ReconStatus.NA);
                } else if (docVal == null || docVal.toString().isBlank()) {
                    // LC requires this field; doc didn't produce it
                    cellStatus.put(dt, ReconField.ReconStatus.MISSING);
                    cellDetail.put(dt, "expected per LC, not extracted");
                } else {
                    var cmp = normaliser.compare(fd.type(), lcVal, docVal);
                    cellStatus.put(dt, mapVerdict(cmp.verdict()));
                    if (cmp.detail() != null) cellDetail.put(dt, cmp.detail());
                }
            }

            // 3. Row-level verdict = worst-of cells (LC excluded)
            ReconField.ReconStatus rowStatus = lcVal == null
                    ? ReconField.ReconStatus.NA
                    : worstOf(cellStatus, /*excludeLc*/ true);

            String rowDetail = rowStatus == ReconField.ReconStatus.DISCREPANCY
                    ? buildRowDetail(valueByDocType) : null;

            fields.add(new ReconField(
                    fd.key(), fd.nameEn(), valueByDocType,
                    cellStatus, cellDetail,
                    rowStatus, rowDetail, null));
        }

        ctx.reconFields = fields;
        long disc = fields.stream().filter(f -> f.status() == ReconField.ReconStatus.DISCREPANCY).count();
        long tol  = fields.stream().filter(f -> f.status() == ReconField.ReconStatus.TOLERANCE).count();

        // Persist to final_report.reconcile so the matrix survives JVM restart.
        persistRows(ctx, fields);

        ctx.eventBus.stageCompleted(ctx.sessionId, "reconcile", System.currentTimeMillis() - start);
        log.info("[{}] Reconcile: {} fields, {} discrepancies, {} tolerances, {}ms",
                ctx.sessionId, fields.size(), disc, tol, System.currentTimeMillis() - start);
    }

    private void persistRows(StageContext ctx, List<ReconField> fields) {
        try {
            List<Map<String, Object>> serialised = new ArrayList<>(fields.size());
            for (ReconField f : fields) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("fieldKey", f.fieldKey());
                row.put("label", f.nameEn());
                row.put("verdict", f.status().name());
                row.put("discrepancyDetail", f.discrepancyDetail());
                Map<String, Object> values = new LinkedHashMap<>();
                f.valueByDocType().forEach((dt, v) -> values.put(dt.name(), v == null ? null : v.toString()));
                row.put("valueByDocType", values);
                Map<String, String> cellStatus = new LinkedHashMap<>();
                f.cellStatus().forEach((dt, s) -> cellStatus.put(dt.name(), s.name()));
                row.put("cellStatus", cellStatus);
                Map<String, String> cellDetail = new LinkedHashMap<>();
                f.cellDetail().forEach((dt, d) -> cellDetail.put(dt.name(), d));
                row.put("cellDetail", cellDetail);
                serialised.add(row);
            }
            String json = objectMapper.writeValueAsString(serialised);
            sessionStore.mergeFinalReportSection(ctx.sessionId, "reconcile", json);
        } catch (Exception e) {
            log.warn("[{}] reconcile persistence failed: {}", ctx.sessionId, e.getMessage());
        }
    }

    private static ReconField.ReconStatus mapVerdict(ReconcileNormaliser.Verdict v) {
        return switch (v) {
            case MATCH       -> ReconField.ReconStatus.MATCH;
            case TOLERANCE   -> ReconField.ReconStatus.TOLERANCE;
            case DISCREPANCY -> ReconField.ReconStatus.DISCREPANCY;
            case MISSING     -> ReconField.ReconStatus.MISSING;
        };
    }

    private static ReconField.ReconStatus worstOf(Map<DocType, ReconField.ReconStatus> cells, boolean excludeLc) {
        // priority: DISCREPANCY > TOLERANCE > MISSING > MATCH > NA
        ReconField.ReconStatus worst = ReconField.ReconStatus.MATCH;
        boolean any = false;
        for (var entry : cells.entrySet()) {
            if (excludeLc && entry.getKey() == DocType.LC) continue;
            any = true;
            worst = worse(worst, entry.getValue());
        }
        return any ? worst : ReconField.ReconStatus.NA;
    }

    private static ReconField.ReconStatus worse(ReconField.ReconStatus a, ReconField.ReconStatus b) {
        return rank(a) >= rank(b) ? a : b;
    }
    private static int rank(ReconField.ReconStatus s) {
        return switch (s) {
            case DISCREPANCY -> 4;
            case TOLERANCE   -> 3;
            case MISSING     -> 2;
            case MATCH       -> 1;
            case NA          -> 0;
        };
    }

    private static String buildRowDetail(Map<DocType, Object> values) {
        StringBuilder sb = new StringBuilder();
        values.forEach((dt, val) -> sb.append(dt.name()).append("=").append(val).append("; "));
        return sb.toString();
    }
}
