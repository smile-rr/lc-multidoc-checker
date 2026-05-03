package com.lc.v2.checker.stage.signoff;

import com.lc.v2.checker.api.dto.EnrichedRule;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Builds an SWIFT MT734 (Advice of Refusal of Documents) text block.
 * Returned as a flat string to the UI for preview / export.
 *
 * Only meaningful when the officer's decision is REFUSE — for ACCEPT or WAIVER
 * the controller still calls this to render a placeholder advisory.
 */
@Component
public class Mt734Generator {

    private static final DateTimeFormatter SWIFT_DATE = DateTimeFormatter.ofPattern("yyMMdd");

    /**
     * @param sessionId      session UUID for :21: (related-reference)
     * @param lcReference    :20: sender's reference (LC number; e.g. "LCWIDG-2024-0317")
     * @param amountText     "USD56000,00" style amount block (best-effort from final report)
     * @param decision       ACCEPT | WAIVER | REFUSE
     * @param failures       enriched failure list (drives :77J: discrepancy block)
     * @param dispositions   ruleId → disposition (WAIVER/CURED/HOLD/REFUSE/ACCEPT) — informs :77B:
     */
    public String generate(String sessionId, String lcReference, String amountText,
                            String decision, List<EnrichedRule> failures,
                            Map<String, String> dispositions) {
        StringBuilder sb = new StringBuilder();
        String today = LocalDate.now().format(SWIFT_DATE);
        String lcRef = lcReference != null && !lcReference.isBlank() ? lcReference : "LC-REF-PENDING";
        String amt = amountText != null && !amountText.isBlank() ? amountText : "USD0,00";
        String shortSession = sessionId != null && sessionId.length() >= 8
                ? sessionId.substring(0, 8).toUpperCase() : "PENDING";

        sb.append(":20: ").append(lcRef).append('\n');
        sb.append(":21: SESSION_V2_").append(shortSession).append('\n');
        sb.append(":32A: ").append(today).append(amt).append('\n');

        int n = failures != null ? failures.size() : 0;
        sb.append(":73: ").append(n).append(" DISCREPANC").append(n == 1 ? "Y" : "IES").append(" NOTED\n");

        sb.append(":77J:\n");
        if (failures != null) {
            for (int i = 0; i < failures.size(); i++) {
                EnrichedRule f = failures.get(i);
                sb.append(String.format("%02d. %s · %s%n", i + 1, f.article(), f.label()));
                if (f.explanation() != null && !f.explanation().isBlank()) {
                    sb.append("    ").append(f.explanation()).append('\n');
                }
            }
        }

        // Dispositions hint — :77B: is "for further info"; we use it to record the
        // officer's hold/refuse posture so downstream ops can see at a glance.
        String dispositionFlag = switch (decision == null ? "" : decision) {
            case "REFUSE" -> "/REFUSED/  AWAITING APPLICANT INSTRUCTIONS";
            case "WAIVER" -> "/HOLD/  WAIVER REQUESTED FROM APPLICANT";
            case "ACCEPT" -> "/ACCEPTED/  COMPLIANT — FOR YOUR RECORDS";
            default -> "/PENDING/  DECISION NOT YET RENDERED";
        };
        sb.append(":77B: ").append(dispositionFlag).append('\n');
        sb.append(":72:  ADVISED PER UCP 600 ART 16").append('\n');

        return sb.toString();
    }
}
