package com.lc.v2.checker.stage.parse;

import com.lc.v2.checker.domain.common.FieldEnvelope;
import com.lc.v2.checker.domain.lc.LcConsistencyWarning;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Post-parse structural validation (ISBP Pitfall 06).
 * Runs against the LC envelope and emits informational warnings — not errors.
 * Officer sees these in the Parse stage before extraction begins.
 */
@Component
public class LcConsistencyChecker {

    public List<LcConsistencyWarning> check(FieldEnvelope lc) {
        List<LcConsistencyWarning> warnings = new ArrayList<>();
        checkShipmentVsExpiry(lc, warnings);
        checkTranshipmentConflict(lc, warnings);
        return List.copyOf(warnings);
    }

    private void checkShipmentVsExpiry(FieldEnvelope lc, List<LcConsistencyWarning> out) {
        Object shipRaw = lc.get("latest_shipment_date");
        Object expRaw = lc.get("expiry_date");
        if (shipRaw == null || expRaw == null) return;
        try {
            LocalDate ship = toDate(shipRaw);
            LocalDate exp = toDate(expRaw);
            if (ship != null && exp != null && ship.isAfter(exp)) {
                out.add(new LcConsistencyWarning(
                        "LC_SHIP_AFTER_EXPIRY",
                        "Latest shipment date (" + ship + ") is after expiry date (" + exp + ")",
                        "UCP 14(h)"));
            }
        } catch (Exception ignored) {}
    }

    private void checkTranshipmentConflict(FieldEnvelope lc, List<LcConsistencyWarning> out) {
        String trans = lc.getString("transhipment");
        String pol = lc.getString("port_of_loading");
        String pod = lc.getString("port_of_discharge");
        if (trans != null && trans.toUpperCase().contains("NOT ALLOWED")) {
            // If there are via ports in :44E:/:44F: implying transhipment, warn
            if ((pol != null && pol.toUpperCase().contains("VIA"))
                    || (pod != null && pod.toUpperCase().contains("VIA"))) {
                out.add(new LcConsistencyWarning(
                        "LC_TRANSHIPMENT_CONFLICT",
                        "Transhipment not allowed but :44E:/:44F: may imply transhipment route",
                        "UCP 14(h)"));
            }
        }
    }

    private static LocalDate toDate(Object o) {
        if (o instanceof LocalDate d) return d;
        if (o instanceof String s) {
            try { return LocalDate.parse(s); } catch (Exception ignored) { return null; }
        }
        return null;
    }
}
