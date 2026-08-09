package com.tb.helix.harness.expr;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * How a value written on a document is read as a value.
 *
 * <p>This lived beside the rule engine, on the argument that SWIFT punctuation is examination
 * behaviour and an engine knowing it would stop being general. That was right while only a run
 * read facts. It stopped being right the moment the console could try a condition out: the
 * console is on the other side of a module boundary and could not reach it, so it bound what
 * an author typed as plain text — and {@code {CS.presentation_date} <= #datePlus(expiry, 5)}
 * compared a String with a LocalDate and came back "could not be answered". A simulator that
 * answers differently from the run is worse than no simulator, because it is believed.
 *
 * <p>So it sits at the floor both sides can reach, and there is <b>one reading</b>: the same
 * text becomes the same value whether it arrives from a fact, from a verb's argument, or from
 * a box somebody typed into. {@link Verbs} coerces through here too — it had grown its own
 * copy of the comma rule and none of the written-date forms, so a date a run compared happily
 * was one a verb could not use.
 *
 * <p>No state, no collaborators, nothing to inject.
 */
public final class Values {

    private Values() {
    }

    /** Case and spacing are not a discrepancy. Anything more than that is a judgement. */
    public static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    /**
     * A number, however the document wrote it.
     *
     * <p>Strips a currency code and thousands separators. <b>The comma is not always a
     * thousands separator</b> — SWIFT writes {@code USD60000,00} for sixty thousand — so a
     * comma with exactly two digits after it and no dot present is read as the decimal
     * point. Getting this backwards multiplies a credit by a hundred and every comparison
     * against it still looks like it worked.
     */
    public static BigDecimal number(String raw) {
        if (raw == null) return null;
        String s = raw.replaceAll("[A-Za-z]", "").replaceAll("[^0-9,.\\-]", "").trim();
        if (s.isEmpty()) return null;
        if (!s.contains(".") && s.matches(".*,\\d{2}$")) {
            s = s.replace(".", "").replace(',', '.');
        } else {
            s = s.replace(",", "");
        }
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * How a date is written once it is ours: eight digits, {@code 20241231}.
     *
     * <p>SWIFT's own form, without SWIFT's two-digit year. Extraction is asked for it, every
     * date we render back is in it, and {@link #date(String)} still reads everything else
     * because a <em>document</em> writes what it likes.
     *
     * <p>Eight and not six. {@code 241231} is a year of 24 or a day of 24 depending on who
     * printed it, and a century that has to be guessed is a century that will be guessed
     * wrong on a credit issued in 1999 or maturing in 2099.
     */
    public static final java.time.format.DateTimeFormatter CANONICAL =
            java.time.format.DateTimeFormatter.BASIC_ISO_DATE;

    /** A date as it is written back to anyone — an operand, a reading, a row. */
    public static String text(LocalDate d) {
        return d == null ? null : d.format(CANONICAL);
    }

    /**
     * Any value, as it is written back. Dates take the canonical form; nothing else changes.
     *
     * <p>Here rather than at each call site because there are four — the engine's reading,
     * the operand on a row, the simulator's leaves and the finding's comparison — and a
     * {@code String.valueOf} on a LocalDate quietly produces {@code 2025-04-18} instead. One
     * of the four keeping the old form is how a screen comes to show two date formats.
     */
    public static String show(Object o) {
        if (o == null) return null;
        return o instanceof LocalDate d ? text(d) : String.valueOf(o);
    }

    /**
     * A date, however the document wrote it.
     *
     * <p>This accepted ISO and nothing else, on the reasonable assumption that extraction
     * normalises. It does not always: a bill of lading came back as {@code 20 – August –
     * 2010} — en dashes, spaces, a spelt-out month — and the comparison that decides whether
     * shipment was in time reported that it could not read a date it had been given. The
     * value was on the page, we had it in hand, and the check went unanswered on punctuation.
     *
     * <p><b>What it deliberately will not do is guess.</b> {@code 03/04/2010} is the third of
     * April to half the world and the fourth of March to the other half, and no examination
     * should pick one. An all-numeric ambiguous date yields nothing and the row stays
     * UNPARSEABLE, which is the honest answer — a wrong date here is a shipment declared late
     * that was not, or in time when it was not.
     */
    public static LocalDate date(String raw) {
        if (raw == null) return null;
        // Dashes an author or a model might use where a hyphen was meant, and the separators
        // collapsed to one space so every pattern below sees the same shape.
        String s = raw.trim()
                .replace('\u2010', '-').replace('\u2011', '-').replace('\u2012', '-')
                .replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-')
                .replaceAll("[,]", " ")
                .replaceAll("\\s*-\\s*", " ")
                .replaceAll("\\s+", " ")
                .trim();
        if (s.isEmpty()) return null;

        // The canonical eight digits first — it is what extraction produces when it is
        // working, and it must not become slower or looser because the fallbacks exist.
        // Checked before the separators are collapsed, since it has none.
        if (s.length() == 8 && s.chars().allMatch(Character::isDigit)) {
            try {
                return LocalDate.parse(s, CANONICAL);
            } catch (RuntimeException ignored) {
                // eight digits that are not a date — fall through
            }
        }

        // ISO with dashes, which a document may still print and which older facts hold.
        try {
            return LocalDate.parse(s.substring(0, Math.min(10, s.length())));
        } catch (RuntimeException ignored) {
            // fall through to the written forms
        }

        for (java.time.format.DateTimeFormatter f : WRITTEN_DATES) {
            try {
                return LocalDate.parse(s, f);
            } catch (RuntimeException ignored) {
                // try the next
            }
        }
        return null;
    }

    /**
     * The unambiguous written forms, and only those.
     *
     * <p>Every one of these names its month in letters, which is what makes it safe: there is
     * no reading of "20 AUGUST 2010" that is not the twentieth of August. Nothing here parses
     * {@code dd/MM/yyyy} or {@code MM/dd/yyyy}, and nothing should — see {@link #date(String)}.
     */
    private static final List<java.time.format.DateTimeFormatter> WRITTEN_DATES = List.of(
            written("d MMMM yyyy"), written("d MMM yyyy"),
            written("MMMM d yyyy"), written("MMM d yyyy"),
            written("yyyy MMMM d"), written("yyyy MMM d"),
            written("yyyy M d"));

    private static java.time.format.DateTimeFormatter written(String pattern) {
        return new java.time.format.DateTimeFormatterBuilder()
                .parseCaseInsensitive()
                .appendPattern(pattern)
                .toFormatter(Locale.ENGLISH);
    }
}
