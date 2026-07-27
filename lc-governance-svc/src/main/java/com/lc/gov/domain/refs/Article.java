package com.lc.gov.domain.refs;

/**
 * One citable unit of a book. A check cites articles by id only; the text
 * resolves at read time, so a check can never drift from the corpus it cites.
 */
public record Article(
        String id,
        String bookId,
        String article,
        String paragraph,
        String heading,
        String body,
        int ordinal) {}
