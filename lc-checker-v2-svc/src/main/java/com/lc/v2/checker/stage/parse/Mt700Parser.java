package com.lc.v2.checker.stage.parse;

import com.lc.v2.checker.domain.common.DocumentRequirement;
import com.lc.v2.checker.domain.common.FieldEnvelope;
import com.lc.v2.checker.domain.common.ParsedRow;
import com.lc.v2.checker.domain.lc.LcConsistencyWarning;
import com.lc.v2.checker.domain.lc.LcDerived;
import com.lc.v2.checker.domain.lc.LcParseResult;
import com.lc.v2.checker.infra.fields.TagMappingRegistry;
import com.lc.v2.checker.stage.parse.subfield.DocumentListParser;
import com.lc.v2.checker.stage.parse.subfield.IncotermsExtractor;
import com.prowidesoftware.swift.io.parser.SwiftParser;
import com.prowidesoftware.swift.model.SwiftBlock1;
import com.prowidesoftware.swift.model.SwiftBlock2;
import com.prowidesoftware.swift.model.SwiftBlock3;
import com.prowidesoftware.swift.model.SwiftBlock4;
import com.prowidesoftware.swift.model.SwiftMessage;
import com.prowidesoftware.swift.model.Tag;
import com.prowidesoftware.swift.model.field.Field20;
import com.prowidesoftware.swift.model.field.Field31C;
import com.prowidesoftware.swift.model.field.Field31D;
import com.prowidesoftware.swift.model.field.Field32B;
import com.prowidesoftware.swift.model.field.Field39A;
import com.prowidesoftware.swift.model.field.Field44C;
import com.prowidesoftware.swift.model.field.Field48;
import com.prowidesoftware.swift.model.mt.mt7xx.MT700;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * MT700 parser for v2. Produces LcParseResult (FieldEnvelope only, no typed scalars).
 * Backed by Prowide Core. Reuses v1 tag-mapping.yaml and field-pool.yaml registries.
 */
@Component
public class Mt700Parser {

    private static final Logger log = LoggerFactory.getLogger(Mt700Parser.class);

    private static final Set<String> APPLICANT_TAGS = Set.of("50", "50B", "50F");
    private static final Set<String> BENEFICIARY_TAGS = Set.of("59", "59A", "59F");

    private static final Pattern F48_DIGITS = Pattern.compile("^\\s*(\\d+).*$");
    private static final Pattern FIELD32B_ABOUT =
            Pattern.compile("^(ABOUT |APPROXIMATELY )?([A-Z]{3})[0-9.,]+$");

    private final TagMappingRegistry tagMappings;
    private final DocumentListParser documentListParser;
    private final IncotermsExtractor incotermsExtractor;
    private final ParsedRowProjector rowProjector;
    private final LcConsistencyChecker consistencyChecker;

    public Mt700Parser(TagMappingRegistry tagMappings,
                       DocumentListParser documentListParser,
                       IncotermsExtractor incotermsExtractor,
                       ParsedRowProjector rowProjector,
                       LcConsistencyChecker consistencyChecker) {
        this.tagMappings = tagMappings;
        this.documentListParser = documentListParser;
        this.incotermsExtractor = incotermsExtractor;
        this.rowProjector = rowProjector;
        this.consistencyChecker = consistencyChecker;
    }

    public LcParseResult parse(String mt700Text) {
        if (mt700Text == null || mt700Text.isBlank()) {
            throw new LcParseException("MT700 input is null or blank");
        }

        SwiftMessage swift = parseSwiftMessage(mt700Text);
        MT700 mt = new MT700(swift);

        SwiftBlock4 b4 = swift.getBlock4();
        if (b4 == null) throw new LcParseException(":4:", "MT700 has no Block 4");

        Map<String, String> raw = new LinkedHashMap<>();
        for (Tag t : b4.getTags()) raw.put(t.getName(), t.getValue());

        Map<String, String> header = new LinkedHashMap<>();
        SwiftBlock3 b3 = swift.getBlock3();
        if (b3 != null) for (Tag t : b3.getTags()) header.put(t.getName(), t.getValue());

        applyTagValidation(raw);

        Field20 f20 = mt.getField20();
        String lcNumber = (f20 == null || f20.getValue() == null) ? null : f20.getValue().trim();
        if (lcNumber != null && lcNumber.isBlank()) lcNumber = null;

        LocalDate issueDate = toLocalDate(mt.getField31C());
        Field31D f31d = mt.getField31D();
        LocalDate expiryDate = f31d == null ? null : toLocalDate(f31d);
        String expiryPlace = f31d == null ? null : safe(f31d.getPlace());

        Field32B f32b = mt.getField32B();
        String field32BRaw = f32b == null ? null : f32b.getValue();
        boolean aboutCreditAmount = false;
        String currency = null;
        if (field32BRaw != null) {
            String upper = field32BRaw.toUpperCase();
            if (upper.contains("ABOUT") || upper.contains("APPROXIMATELY")) {
                aboutCreditAmount = true;
                Matcher m = FIELD32B_ABOUT.matcher(upper);
                if (m.matches()) currency = m.group(2);
            }
        }
        if (!aboutCreditAmount) currency = f32b == null ? null : safe(f32b.getCurrency());
        if (currency != null && currency.isBlank()) currency = null;
        BigDecimal amount = f32b == null ? null : f32b.getAmountAsBigDecimal();

        int tolerancePlus = 0, toleranceMinus = 0;
        Field39A f39a = mt.getField39A();
        if (f39a != null) {
            tolerancePlus = toInt(f39a.getComponent1AsLong(), 0);
            toleranceMinus = toInt(f39a.getComponent2AsLong(), 0);
        }

        int presentationDays = 21;
        Field48 f48 = mt.getField48();
        if (f48 != null) {
            Long days = f48.getComponent1AsLong();
            if (days != null) {
                presentationDays = days.intValue();
            } else if (f48.getValue() != null) {
                Matcher m = F48_DIGITS.matcher(f48.getValue());
                if (m.matches()) presentationDays = Integer.parseInt(m.group(1));
            }
        }

        LocalDate latestShipmentDate = toLocalDate(mt.getField44C());

        String[] applicant = extractParty(raw, APPLICANT_TAGS);
        String[] beneficiary = extractParty(raw, BENEFICIARY_TAGS);

        List<DocumentRequirement> documentsRequired = documentListParser.parse(raw.get("46A"));
        String goodsDescriptionRaw = raw.get("45A");
        String availableRaw = raw.containsKey("41A") ? raw.get("41A") : raw.get("41D");

        ParsedScalars scalars = new ParsedScalars(lcNumber, issueDate, expiryDate, expiryPlace,
                currency, amount, aboutCreditAmount, tolerancePlus, toleranceMinus,
                latestShipmentDate, presentationDays, applicant, beneficiary,
                documentsRequired, goodsDescriptionRaw, splitAvailableWithBy(availableRaw));

        Set<String> notInRegistry = new LinkedHashSet<>();
        for (String t : raw.keySet()) if (tagMappings.byTag(t).isEmpty()) notInRegistry.add(t);
        if (!notInRegistry.isEmpty()) {
            log.info("Mt700Parser: unregistered tags (not in lc-tag-mapping.yaml): {}", notInRegistry);
        }

        FieldEnvelope envelope = buildEnvelope(raw, header, swift.getBlock1(), swift.getBlock2(), scalars);

        List<LcConsistencyWarning> warnings = consistencyChecker.check(envelope);
        List<ParsedRow> parsedRows = rowProjector.project(envelope, raw);
        LcDerived derived = deriveLc(raw, scalars);

        return new LcParseResult(envelope, mt700Text, Map.copyOf(raw), warnings, parsedRows, derived);
    }

    private static final Pattern INCOTERMS_PATTERN = Pattern.compile(
            "\\b(EXW|FOB|FCA|CFR|CIF|CPT|CIP|DAP|DDP)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern TENOR_DAYS_PATTERN = Pattern.compile(
            "\\b(\\d+)\\s*DAYS?\\b", Pattern.CASE_INSENSITIVE);

    /**
     * Re-derive LC envelope from raw MT700 tags + structured fields.
     * Public so ComplianceCheckStage can refresh derived values at re-run time without
     * needing to replay the full MT700 parse.
     */
    public static LcDerived deriveFromRaw(Map<String, String> raw,
                                           com.lc.v2.checker.domain.common.FieldEnvelope envelope) {
        Object tpObj = envelope == null ? null : envelope.fields().get("tolerance_plus");
        Object tmObj = envelope == null ? null : envelope.fields().get("tolerance_minus");
        Object aboutObj = envelope == null ? null : envelope.fields().get("about_credit_amount");
        int tp = tpObj instanceof Number n ? n.intValue() : 0;
        int tm = tmObj instanceof Number n ? n.intValue() : 0;
        boolean about = Boolean.TRUE.equals(aboutObj);
        return doDerive(raw, tp, tm, about);
    }

    private LcDerived deriveLc(Map<String, String> raw, ParsedScalars s) {
        return doDerive(raw, s.tolerancePlus(), s.toleranceMinus(), s.aboutCreditAmount());
    }

    private static LcDerived doDerive(Map<String, String> raw,
                                       int tolerancePlus, int toleranceMinus,
                                       boolean aboutCreditAmount) {
        // Incoterms: scan :45A: text.
        String incotermsClass = "UNKNOWN";
        String f45a = raw.get("45A");
        if (f45a != null) {
            Matcher m = INCOTERMS_PATTERN.matcher(f45a);
            if (m.find()) incotermsClass = m.group(1).toUpperCase();
        }

        // Tolerance precedence: explicit :39A: → about → exact (default).
        LcDerived.ToleranceSpec tol;
        if (tolerancePlus > 0 || toleranceMinus > 0) {
            int pct = Math.max(tolerancePlus, toleranceMinus);
            tol = new LcDerived.ToleranceSpec(BigDecimal.valueOf(pct), "EXPLICIT", "39A");
        } else if (aboutCreditAmount) {
            tol = new LcDerived.ToleranceSpec(BigDecimal.TEN, "ABOUT", "32B");
        } else {
            String f39a = raw.get("39A");
            if (f39a != null) {
                String upper = f39a.toUpperCase();
                if (upper.contains("ABOUT") || upper.contains("APPROXIMATELY")) {
                    tol = new LcDerived.ToleranceSpec(BigDecimal.TEN, "ABOUT", "39A");
                } else {
                    tol = new LcDerived.ToleranceSpec(BigDecimal.ZERO, "EXACT", "default");
                }
            } else {
                tol = new LcDerived.ToleranceSpec(BigDecimal.ZERO, "EXACT", "default");
                // TODO: BULK_DEFAULT (UCP 30(b) ±5%) inference from goods type — not implemented.
            }
        }

        // Tenor: parse :42C:.
        String tenorClass = "UNKNOWN";
        String f42c = raw.get("42C");
        if (f42c != null) {
            String upper = f42c.toUpperCase();
            boolean isSight = upper.contains("SIGHT");
            boolean isDeferred = upper.contains("DEFERRED");
            boolean isUsance = TENOR_DAYS_PATTERN.matcher(upper).find();
            if (isSight && (isDeferred || isUsance)) tenorClass = "MIXED";
            else if (isSight) tenorClass = "SIGHT";
            else if (isUsance) tenorClass = "USANCE_DAYS";
            else if (isDeferred) tenorClass = "DEFERRED";
        }

        boolean transhipmentProhibited = containsAny(raw.get("43T"),
                "PROHIBITED", "NOT ALLOWED", "NOT PERMITTED");
        boolean partialShipmentProhibited = containsAny(raw.get("43P"),
                "PROHIBITED", "NOT ALLOWED", "NOT PERMITTED");

        return new LcDerived(incotermsClass, tol, tenorClass,
                transhipmentProhibited, partialShipmentProhibited);
    }

    private static boolean containsAny(String text, String... needles) {
        if (text == null) return false;
        String upper = text.toUpperCase();
        for (String n : needles) if (upper.contains(n)) return true;
        return false;
    }

    private record ParsedScalars(
            String lcNumber, LocalDate issueDate, LocalDate expiryDate, String expiryPlace,
            String currency, BigDecimal amount, boolean aboutCreditAmount,
            int tolerancePlus, int toleranceMinus, LocalDate latestShipmentDate,
            int presentationDays, String[] applicant, String[] beneficiary,
            List<DocumentRequirement> documentsRequired, String goodsDescriptionRaw,
            String[] availableWithBy) {}

    private FieldEnvelope buildEnvelope(Map<String, String> raw, Map<String, String> header,
                                         SwiftBlock1 block1, SwiftBlock2 block2,
                                         ParsedScalars scalars) {
        // Seed registry defaults first (e.g. presentation_days=21, tolerance=0).
        // Actual tag values overwrite defaults — later put() wins in the LinkedHashMap builder.
        FieldEnvelope.Builder b = FieldEnvelope.builder();
        for (var mapping : tagMappings.all()) {
            for (var def : mapping.defaults().entrySet()) {
                b.put(def.getKey(), def.getValue());
            }
        }

        for (var entry : raw.entrySet()) {
            String tag = entry.getKey();
            String rawValue = entry.getValue();
            if (tagMappings.byTag(tag).isEmpty()) { b.putExtra(tag, rawValue); continue; }
            if (!projectSubFields(tag, scalars, b)) {
                for (String key : tagMappings.byTag(tag).get().fieldKeys()) {
                    b.put(key, rawValue);
                }
            }
        }

        // SWIFT envelope fields
        if (block1 != null) b.put("sender_bic", toBic11(block1.getLogicalTerminal()));
        if (block2 != null) {
            String b2v = block2.getValue();
            if (b2v != null && b2v.length() >= 4) {
                b.put("message_type", b2v.substring(1, 4));
                if (b2v.length() >= 16) b.put("receiver_bic", toBic11(b2v.substring(4, 16)));
            }
        }
        String userRef = header.get("108");
        if (userRef != null) b.put("user_reference", userRef.trim());
        b.put("about_credit_amount", scalars.aboutCreditAmount() ? "true" : "false");

        return b.build();
    }

    private boolean projectSubFields(String tag, ParsedScalars s, FieldEnvelope.Builder b) {
        switch (tag) {
            case "20"  -> b.put("lc_number",            s.lcNumber());
            case "31C" -> b.put("issue_date",            s.issueDate());
            case "44C" -> b.put("latest_shipment_date",  s.latestShipmentDate());
            case "46A" -> b.put("documents_required",    s.documentsRequired());
            case "48"  -> b.put("presentation_days",     s.presentationDays());
            case "31D" -> { b.put("expiry_date", s.expiryDate()); b.put("expiry_place", s.expiryPlace()); }
            case "32B" -> { b.put("credit_currency", s.currency()); b.put("credit_amount", s.amount()); }
            case "39A" -> { b.put("tolerance_plus", s.tolerancePlus()); b.put("tolerance_minus", s.toleranceMinus()); }
            case "50", "50B", "50F" -> { b.put("applicant_name", s.applicant()[0]); b.put("applicant_address", s.applicant()[1]); }
            case "59", "59A", "59F" -> { b.put("beneficiary_name", s.beneficiary()[0]); b.put("beneficiary_address", s.beneficiary()[1]); }
            case "41A", "41D" -> { b.put("available_with", s.availableWithBy()[0]); b.put("available_by", s.availableWithBy()[1]); }
            case "45A" -> { b.put("goods_description", s.goodsDescriptionRaw()); String inco = incotermsExtractor.extract(s.goodsDescriptionRaw()); if (inco != null) b.put("incoterms", inco); }
            default -> { return false; }
        }
        return true;
    }

    private static String[] splitAvailableWithBy(String raw) {
        if (raw == null) return new String[]{null, null};
        String t = raw.trim();
        int byIdx = t.toUpperCase().indexOf(" BY ");
        if (byIdx > 0) return new String[]{t.substring(0, byIdx).trim(), "BY " + t.substring(byIdx + 4).trim()};
        int nl = t.indexOf('\n');
        if (nl > 0) return new String[]{t.substring(0, nl).trim(), t.substring(nl + 1).trim()};
        return new String[]{t, null};
    }

    private SwiftMessage parseSwiftMessage(String fin) {
        try {
            SwiftMessage swift = new SwiftParser(ensureEnvelope(fin)).message();
            if (swift == null) throw new LcParseException("SWIFT parser returned null");
            return swift;
        } catch (LcParseException e) { throw e; }
        catch (Exception e) { throw new LcParseException("Failed to parse SWIFT: " + e.getMessage(), e); }
    }

    private String ensureEnvelope(String fin) {
        String trimmed = fin.trim();
        if (trimmed.contains("{1:") || trimmed.contains("{4:")) return trimmed;
        String body = trimmed;
        if (!body.endsWith("-")) body = body + "\n-";
        return "{1:F01BANKBICAAXXX0000000000}{2:I700BANKBICBXXXXN}{4:\n" + body + "}";
    }

    private String[] extractParty(Map<String, String> raw, Set<String> tags) {
        for (String tag : tags) {
            String value = raw.get(tag);
            if (value != null && !value.isBlank()) return splitPartyValue(value, tag);
        }
        return new String[]{null, null};
    }

    private String[] splitPartyValue(String raw, String tag) {
        String[] lines = raw.split("\\r?\\n");
        if ("50F".equals(tag) || "59F".equals(tag)) {
            StringBuilder name = new StringBuilder(), addr = new StringBuilder();
            String current = null;
            for (String line : lines) {
                String l = line.trim();
                if (l.isEmpty()) continue;
                if (l.startsWith("/")) {
                    int endCode = l.indexOf('/', 1);
                    if (endCode > 0) { current = l.substring(1, endCode); appendTo(current, name, addr, l.substring(endCode + 1)); continue; }
                    current = null; continue;
                }
                if (current != null) appendTo(current, name, addr, l);
            }
            return new String[]{name.length() == 0 ? null : name.toString().trim(),
                    addr.length() == 0 ? null : addr.toString().trim()};
        }
        int nameIdx = 0;
        while (nameIdx < lines.length && lines[nameIdx].trim().startsWith("/")) nameIdx++;
        if (nameIdx >= lines.length) return new String[]{null, null};
        String name = lines[nameIdx].trim();
        StringBuilder addr = new StringBuilder();
        for (int i = nameIdx + 1; i < lines.length; i++) { if (addr.length() > 0) addr.append('\n'); addr.append(lines[i].trim()); }
        return new String[]{name.isEmpty() ? null : name, addr.length() == 0 ? null : addr.toString()};
    }

    private void appendTo(String code, StringBuilder name, StringBuilder addr, String text) {
        if (text == null) return;
        String t = text.trim(); if (t.isEmpty()) return;
        if ("NAME".equalsIgnoreCase(code)) { if (name.length() > 0) name.append(' '); name.append(t); }
        else if ("ADDR".equalsIgnoreCase(code) || "ADDRESS".equalsIgnoreCase(code)) { if (addr.length() > 0) addr.append('\n'); addr.append(t); }
        else if (name.length() == 0) { name.append(t); }
        else { if (addr.length() > 0) addr.append('\n'); addr.append(t); }
    }

    private void applyTagValidation(Map<String, String> raw) {
        for (var entry : raw.entrySet()) {
            var mapping = tagMappings.byTag(entry.getKey()).orElse(null);
            if (mapping == null || mapping.validation() == null) continue;
            var v = mapping.validation();
            String trimmed = entry.getValue() == null ? "" : entry.getValue().trim();
            if (v.minLength() != null && trimmed.length() < v.minLength())
                throw new LcParseException(":" + entry.getKey() + ":", "Tag length " + trimmed.length() + " < min " + v.minLength());
            if (v.maxLength() != null && trimmed.length() > v.maxLength())
                throw new LcParseException(":" + entry.getKey() + ":", "Tag length " + trimmed.length() + " > max " + v.maxLength());
            if (v.pattern() != null && !v.pattern().isBlank()
                    && !Pattern.compile(v.pattern()).matcher(trimmed).matches())
                throw new LcParseException(":" + entry.getKey() + ":", "Tag does not match pattern " + v.pattern());
        }
    }

    private static LocalDate toLocalDate(Field31C f) { return f == null ? null : toLocalDate(f.getComponent1AsCalendar()); }
    private static LocalDate toLocalDate(Field31D f) { return f == null ? null : toLocalDate(f.getComponent1AsCalendar()); }
    private static LocalDate toLocalDate(Field44C f) { return f == null ? null : toLocalDate(f.getComponent1AsCalendar()); }
    private static LocalDate toLocalDate(Calendar cal) {
        if (cal == null) return null;
        return cal.getTime().toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
    }
    private static int toInt(Long v, int fallback) { return v == null ? fallback : v.intValue(); }
    private static String safe(String s) { return s == null ? null : s.trim(); }
    private static String toBic11(String lt) { if (lt == null || lt.length() != 12) return lt; return lt.substring(0, 8) + lt.substring(9, 12); }
}
