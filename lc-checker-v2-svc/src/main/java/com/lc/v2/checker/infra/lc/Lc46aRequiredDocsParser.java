package com.lc.v2.checker.infra.lc;

import com.lc.v2.checker.domain.common.DocType;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Best-effort parser of MT700 :46A: (Documents Required) free text.
 *
 * Recognises common document phrasings and maps them to v2 DocTypes. Does NOT call
 * an LLM — keyword-based, deterministic, fail-soft.
 *
 * Output drives the right-rail "Required per LC :46A:" checklist in the Intake UI.
 */
@Component
public class Lc46aRequiredDocsParser {

    /** Recognised phrasings → DocType. Order matters; first match wins per pattern. */
    private static final List<Pattern[]> RULES = List.of(
            new Pattern[]{ Pattern.compile("(?i)signed[\\s\\-]+commercial[\\s\\-]+invoice"), Pattern.compile("INV") },
            new Pattern[]{ Pattern.compile("(?i)commercial[\\s\\-]+invoice"),                Pattern.compile("INV") },
            new Pattern[]{ Pattern.compile("(?i)full[\\s\\-]+set[\\s\\-]+(?:of[\\s\\-]+)?"
                    + "(?:original\\s+)?(?:clean\\s+)?(?:on[\\s\\-]+board\\s+)?(?:ocean\\s+)?bills?[\\s\\-]+of[\\s\\-]+lading"),
                                                                                              Pattern.compile("BOL") },
            new Pattern[]{ Pattern.compile("(?i)bills?[\\s\\-]+of[\\s\\-]+lading"),          Pattern.compile("BOL") },
            new Pattern[]{ Pattern.compile("(?i)b/?l\\b"),                                    Pattern.compile("BOL") },
            new Pattern[]{ Pattern.compile("(?i)packing[\\s\\-]+lists?"),                    Pattern.compile("PKL") },
            new Pattern[]{ Pattern.compile("(?i)bills?[\\s\\-]+of[\\s\\-]+exchange"),        Pattern.compile("BOE") },
            new Pattern[]{ Pattern.compile("(?i)\\bdrafts?\\b"),                              Pattern.compile("BOE") },
            new Pattern[]{ Pattern.compile("(?i)beneficiary['\\s]?s?[\\s\\-]+certificate"),  Pattern.compile("BC") },
            new Pattern[]{ Pattern.compile("(?i)warrant(?:y|ies)[\\s\\-]+certificate"),      Pattern.compile("WC") }
    );

    /** Try to extract the copies count from phrases like "in 3 copies" / "3 originals". */
    private static final Pattern COPIES_HINT = Pattern.compile(
            "(?i)(?:in\\s+)?(\\d+)\\s+(?:copies|originals|copy|original)");

    public record RequiredDoc(String type, String copies, String label) {}

    public record Result(String parsed46A, List<RequiredDoc> required) {}

    /**
     * @param lcText  raw MT700 text (may be null/empty)
     * @return  parsed :46A: block (or empty) + ordered required-doc entries
     */
    public Result parse(String lcText) {
        if (lcText == null || lcText.isBlank()) {
            return new Result("", List.of());
        }
        String block = extract46aBlock(lcText);
        if (block.isBlank()) {
            return new Result("", List.of());
        }

        // Split into bullets — one phrase per line is common in real MT700 text
        String[] lines = block.split("\\r?\\n");
        Map<String, RequiredDoc> seen = new LinkedHashMap<>();

        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty()) continue;
            String type = matchDocType(line);
            if (type == null) continue;
            String copies = extractCopies(line);
            String label = friendlyLabel(type);
            // Last entry per type wins so multi-line phrasing collapses cleanly
            seen.put(type, new RequiredDoc(type, copies, label));
        }

        // Always require LC itself in the checklist
        seen.put("LC", new RequiredDoc("LC", "1", friendlyLabel("LC")));

        return new Result(block.trim(), new ArrayList<>(seen.values()));
    }

    /** Pull text between :46A: and the next :NN: tag (or EOF). */
    private String extract46aBlock(String lcText) {
        Matcher start = Pattern.compile(":46A:", Pattern.CASE_INSENSITIVE).matcher(lcText);
        if (!start.find()) return "";
        int from = start.end();
        Matcher end = Pattern.compile("^:\\d{2}[A-Z]?:", Pattern.MULTILINE).matcher(lcText);
        end.region(from, lcText.length());
        if (end.find()) return lcText.substring(from, end.start());
        return lcText.substring(from);
    }

    private String matchDocType(String line) {
        for (Pattern[] rule : RULES) {
            if (rule[0].matcher(line).find()) {
                return rule[1].pattern();
            }
        }
        return null;
    }

    private String extractCopies(String line) {
        Matcher m = COPIES_HINT.matcher(line);
        return m.find() ? m.group(1) : "1";
    }

    private static String friendlyLabel(String type) {
        return switch (type) {
            case "LC" -> "Letter of Credit";
            case "INV" -> "Commercial Invoice";
            case "BOL" -> "Bill of Lading";
            case "PKL" -> "Packing List";
            case "BOE" -> "Bill of Exchange / Draft";
            case "BC" -> "Beneficiary Certificate";
            case "WC" -> "Warranty Certificate";
            default -> type;
        };
    }

    @SuppressWarnings("unused")
    private static DocType safeDocType(String name) {
        try { return DocType.valueOf(name); }
        catch (IllegalArgumentException e) { return null; }
    }
}
