package com.tb.helix.lccheck.stage.intake;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * What a credit reading becomes in the database.
 *
 * <p>Lifted out of {@code IntakeStage} because it is not orchestration: it is the rules for
 * turning a model's answer into columns, and those rules are subtle enough to be worth
 * reading on their own. The stage now says what happens; this says what a value means.
 *
 * <p>Static and stateless. Nothing here touches a database, a model or a case — hand it a map
 * of read fields and it gives back a map of columns.
 */
final class CreditColumns {

    private CreditColumns() {
    }

    /**
     * Column values for the terms a credit states.
     *
     * <p>Absent fields are left out rather than written as null. An amendment changes terms
     * rather than establishing them, so a field missing from an MT707 means "unchanged" —
     * writing null would clear a term the amendment never mentioned.
     */
    static Map<String, Object> of(Map<String, Object> read) {
        Map<String, Object> out = new LinkedHashMap<>();
        put(out, "credit_ref", read.get("creditRef"));
        put(out, "issued_date", date(read.get("issuedDate")));
        put(out, "applicant", read.get("applicant"));
        put(out, "beneficiary", read.get("beneficiary"));
        put(out, "currency", trim(read.get("currency"), 3));
        put(out, "amount", decimal(read.get("amount")));
        put(out, "tolerance_pct", decimal(read.get("tolerancePct")));
        put(out, "latest_shipment", date(read.get("latestShipment")));
        put(out, "expiry", date(read.get("expiry")));
        put(out, "expiry_place", read.get("expiryPlace"));
        put(out, "presentation_days", integer(read.get("presentationDays")));
        put(out, "tenor", read.get("tenor"));
        put(out, "goods", read.get("goods"));
        return out;
    }

    /**
     * ISO text to a real date.
     *
     * <p>A DATE column will not take a String parameter — the driver binds it as varchar and
     * Postgres refuses the comparison.
     */
    private static Date date(Object iso) {
        if (iso == null) return null;
        try {
            return Date.valueOf(LocalDate.parse(String.valueOf(iso).substring(0, 10)));
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * A number, however it was written.
     *
     * <p><b>SWIFT uses the comma as the decimal separator.</b> {@code :32B:GBP100,00} is one
     * hundred pounds, not ten thousand. Stripping the comma — which is what a naive "keep
     * digits and dots" clean does — multiplies the credit by a hundred, and the examination
     * then measures every invoice against the wrong amount with nothing looking broken.
     *
     * <p>So the separators are read rather than removed: whichever of {@code .} or {@code ,}
     * appears last is the decimal point, and everything before it is grouping.
     */
    private static BigDecimal decimal(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return new BigDecimal(n.toString());

        String s = String.valueOf(value).strip().replaceAll("[^0-9.,\\-]", "");
        if (s.isBlank()) return null;

        int lastDot = s.lastIndexOf('.');
        int lastComma = s.lastIndexOf(',');
        int decimalAt = Math.max(lastDot, lastComma);

        String normalised;
        if (decimalAt < 0) {
            normalised = s;
        } else {
            // A trailing group of three digits after the only separator is ambiguous — 1,000
            // is a thousand in one convention and one in the other. SWIFT amounts always
            // carry their decimals, so treat it as grouping only when it is the sole
            // separator and leaves exactly three digits.
            String tail = s.substring(decimalAt + 1);
            boolean grouping = tail.length() == 3 && lastDot < 0 != lastComma < 0;
            normalised = grouping
                    ? s.replaceAll("[.,]", "")
                    : s.substring(0, decimalAt).replaceAll("[.,]", "") + "." + tail;
        }
        try {
            return new BigDecimal(normalised);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer integer(Object value) {
        BigDecimal d = decimal(value);
        return d == null ? null : d.intValue();
    }

    /** A fixed-width column will not take an over-long value; CHAR(3) means CHAR(3). */
    private static String trim(Object value, int max) {
        if (value == null) return null;
        String s = String.valueOf(value).strip();
        return s.isEmpty() ? null : s.substring(0, Math.min(s.length(), max));
    }

    /** A null must stay out of the map entirely, or it overwrites a value parsed earlier. */
    private static void put(Map<String, Object> map, String key, Object value) {
        if (value != null) map.put(key, value instanceof String s && s.isBlank() ? null : value);
    }
}
