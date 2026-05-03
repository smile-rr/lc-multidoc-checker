package com.lc.v2.checker.stage.reconcile;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.common.FieldType;
import com.lc.v2.checker.domain.reconcile.ReconField;
import com.lc.v2.checker.infra.fields.FieldDefinition;
import com.lc.v2.checker.infra.fields.FieldPoolRegistry;
import com.lc.v2.checker.infra.observability.PipelineStage;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import java.math.BigDecimal;
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
 * Pivots all {@code reconcile_canonical} fields from field-pool.yaml across the LC
 * and all submitted documents. Computes a status per field:
 *
 *   NA          — field absent in LC (no reference value to compare against)
 *   MATCH       — all doc values equal the LC value (string: case-insensitive; amount: exact)
 *   TOLERANCE   — amount fields differ but within ±10%
 *   DISCREPANCY — values present and conflicting
 *
 * Results are written to {@code ctx.reconFields} for downstream use by ExamineStage
 * (NOT_APPLICABLE shortcut when LC field absent) and the UI reconcile table.
 *
 * The pipeline auto-advances past this stage. Officer lock/triage is handled via
 * the PATCH /api/v2/sessions/{id}/reconcile/lock endpoint (out-of-band from pipeline).
 */
@PipelineStage(name = "reconcile")
@Component
public class ReconcileStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(ReconcileStage.class);

    private final FieldPoolRegistry fieldPool;

    public ReconcileStage(FieldPoolRegistry fieldPool) {
        this.fieldPool = fieldPool;
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

            if (ctx.lc != null) {
                Object lcVal = ctx.lc.envelope().get(fd.key());
                if (lcVal != null && !lcVal.toString().isBlank()) {
                    valueByDocType.put(DocType.LC, lcVal);
                }
            }

            ctx.extracts.forEach((dt, extract) -> {
                Object val = extract.consensus().get(fd.key());
                if (val != null && !val.toString().isBlank()) {
                    valueByDocType.put(dt, val);
                }
            });

            ReconField.ReconStatus status = computeStatus(fd, valueByDocType);
            String detail = status == ReconField.ReconStatus.DISCREPANCY
                    ? buildDetail(valueByDocType) : null;
            fields.add(new ReconField(fd.key(), fd.nameEn(), valueByDocType, status, detail, null));
        }

        ctx.reconFields = fields;
        long discrepancies = fields.stream().filter(f -> f.status() == ReconField.ReconStatus.DISCREPANCY).count();
        ctx.eventBus.stageCompleted(ctx.sessionId, "reconcile", System.currentTimeMillis() - start);
        log.info("[{}] Reconcile: {} canonical fields, {} discrepancies, {}ms",
                ctx.sessionId, fields.size(), discrepancies, System.currentTimeMillis() - start);
    }

    private ReconField.ReconStatus computeStatus(FieldDefinition fd, Map<DocType, Object> values) {
        if (values.isEmpty()) return ReconField.ReconStatus.NA;
        if (!values.containsKey(DocType.LC)) return ReconField.ReconStatus.NA;
        if (values.size() == 1) return ReconField.ReconStatus.MATCH; // only LC value

        Object lcVal = values.get(DocType.LC);
        if (fd.type() == FieldType.AMOUNT) {
            return compareAmounts(lcVal, values);
        }
        boolean allMatch = values.values().stream()
                .allMatch(v -> normalize(v).equalsIgnoreCase(normalize(lcVal)));
        return allMatch ? ReconField.ReconStatus.MATCH : ReconField.ReconStatus.DISCREPANCY;
    }

    private ReconField.ReconStatus compareAmounts(Object lcVal, Map<DocType, Object> values) {
        BigDecimal lcAmt = parseBd(lcVal);
        if (lcAmt == null) {
            return values.values().stream().allMatch(v -> normalize(v).equalsIgnoreCase(normalize(lcVal)))
                    ? ReconField.ReconStatus.MATCH : ReconField.ReconStatus.DISCREPANCY;
        }
        boolean anyTolerance = false;
        for (var entry : values.entrySet()) {
            if (entry.getKey() == DocType.LC) continue;
            BigDecimal docAmt = parseBd(entry.getValue());
            if (docAmt == null) continue;
            int cmp = docAmt.compareTo(lcAmt);
            if (cmp == 0) continue;
            BigDecimal diff = docAmt.subtract(lcAmt).abs();
            BigDecimal threshold = lcAmt.abs().multiply(new BigDecimal("0.10"));
            if (diff.compareTo(threshold) > 0) return ReconField.ReconStatus.DISCREPANCY;
            anyTolerance = true;
        }
        return anyTolerance ? ReconField.ReconStatus.TOLERANCE : ReconField.ReconStatus.MATCH;
    }

    private BigDecimal parseBd(Object val) {
        if (val == null) return null;
        String s = val.toString().replaceAll("[^0-9.]", "");
        if (s.isEmpty()) return null;
        try { return new BigDecimal(s); } catch (Exception e) { return null; }
    }

    private String normalize(Object val) {
        return val == null ? "" : val.toString().trim().replaceAll("\\s+", " ");
    }

    private String buildDetail(Map<DocType, Object> values) {
        StringBuilder sb = new StringBuilder();
        values.forEach((dt, val) -> sb.append(dt.name()).append("=").append(val).append("; "));
        return sb.toString();
    }
}
