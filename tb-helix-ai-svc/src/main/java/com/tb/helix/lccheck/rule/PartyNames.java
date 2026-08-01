package com.tb.helix.lccheck.rule;

import java.util.List;
import java.util.Locale;

/**
 * Deciding, without a model, that two names are certainly the same party.
 *
 * <p>"ACME TRADING CO., LTD." and "Acme Trading Company Limited" are one company. Under UCP
 * 600 art. 14(d) data need not be identical but must not conflict, and four of the twenty
 * operators exist because that judgement is beyond a string comparison — so a check using one
 * goes to a model, on every presentation, for ever.
 *
 * <p>Most of the time it need not. The overwhelming majority of party comparisons are between
 * two spellings of one name that differ in case, punctuation and legal form, and that
 * difference is mechanical. So this is asked <em>first</em>:
 *
 * <ul>
 *   <li><b>Normalised alike → the row is settled, deterministically.</b> Two strings that
 *       reduce to the same characters cannot be different parties.
 *   <li><b>Otherwise nothing is claimed.</b> The row falls to an examiner exactly as before.
 * </ul>
 *
 * <p><b>The asymmetry is the whole design and it is not an accident.</b> This may only ever
 * turn INCONCLUSIVE into PASS. It never returns FAIL, because "these normalise differently"
 * is not evidence that they are different parties — a trading name, a branch, a transliterated
 * Chinese company name all normalise apart and are all the same party. A version of this that
 * reported a discrepancy would be exactly the mistake the four judgement operators exist to
 * prevent, wearing a cheaper hat.
 *
 * <p>Same reasoning for the suffix list: it holds forms whose removal cannot change which
 * company is meant. It is deliberately short. A suffix that is sometimes part of the name
 * does not belong here.
 */
public final class PartyNames {

    private PartyNames() {
    }

    /**
     * Legal forms, longest first so "SDN BHD" is taken before "BHD".
     *
     * <p>No punctuation and no dots — those are stripped before this is consulted, which is
     * what lets one entry cover {@code LTD}, {@code Ltd.} and {@code LTD,}.
     */
    private static final List<String> FORMS = List.of(
            "SOCIETE ANONYME", "SDN BHD", "PTE LTD", "PVT LTD", "CO LTD", "COMPANY LIMITED",
            "PRIVATE LIMITED", "PUBLIC LIMITED COMPANY", "LIMITED LIABILITY COMPANY",
            "INCORPORATED", "CORPORATION", "COMPANY", "LIMITED",
            "GMBH", "SARL", "SPA", "SRL", "BHD", "SDN", "PTE", "PVT", "PTY",
            "LTDA", "LTD", "LLC", "LLP", "PLC", "INC", "CORP", "CO",
            "AG", "AB", "AS", "BV", "NV", "OY", "SA", "KK", "KG", "OOO", "ZAO");

    /** Words that carry no identity. Dropped wherever they appear. */
    private static final List<String> NOISE = List.of("THE", "AND");

    /**
     * A company name reduced to what identifies it.
     *
     * <p>Case, punctuation, legal form and connecting words removed; spacing collapsed. Empty
     * when nothing is left, and an empty result never matches anything — two blanks are not
     * the same party, they are two absences.
     */
    public static String normalise(String raw) {
        if (raw == null) return "";
        String s = raw.toUpperCase(Locale.ROOT)
                // Ampersand before punctuation goes, so "A & B" and "A AND B" meet.
                .replace("&", " AND ")
                .replaceAll("[^A-Z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        if (s.isEmpty()) return "";

        // Repeatedly, because "ACME TRADING CO LTD" carries two.
        boolean cut = true;
        while (cut) {
            cut = false;
            for (String form : FORMS) {
                if (s.equals(form)) continue;              // a name that is only its form
                if (s.endsWith(" " + form)) {
                    s = s.substring(0, s.length() - form.length() - 1).trim();
                    cut = true;
                    break;
                }
            }
        }

        StringBuilder out = new StringBuilder();
        for (String word : s.split(" ")) {
            if (word.isEmpty() || NOISE.contains(word)) continue;
            if (out.length() > 0) out.append(' ');
            out.append(word);
        }
        return out.toString();
    }

    /**
     * Whether two names are <em>certainly</em> the same party.
     *
     * <p>False means "not certainly", never "certainly not". Every caller has to treat it that
     * way, and the one caller does: a false here sends the row to an examiner.
     */
    public static boolean certainlySame(String a, String b) {
        String x = normalise(a);
        return !x.isEmpty() && x.equals(normalise(b));
    }

    /**
     * Whether two free-text values are certainly identical once case and spacing are ignored.
     *
     * <p>Used for {@code noconflict} and {@code same_country}, where no reduction beyond that
     * is safe: identical data cannot conflict, and that is the only thing a comparison can
     * settle about either of them.
     */
    public static boolean certainlyIdentical(String a, String b) {
        String x = plain(a);
        return !x.isEmpty() && x.equals(plain(b));
    }

    private static String plain(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }
}
