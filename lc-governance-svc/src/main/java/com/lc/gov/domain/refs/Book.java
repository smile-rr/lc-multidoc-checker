package com.lc.gov.domain.refs;

/**
 * A reference book in the Library — UCP 600, ISBP 821, or an internal handbook
 * imported from PDF.
 *
 * @param kind STANDARD (an ICC publication, seeded) or INTERNAL (imported).
 */
public record Book(
        String id,
        String name,
        String kind,
        String edition,
        int articleCount) {

    public static final String STANDARD = "STANDARD";
    public static final String INTERNAL = "INTERNAL";
}
