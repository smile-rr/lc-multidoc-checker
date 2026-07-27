package com.lc.gov.dictionary;

import java.util.List;

/**
 * The column contract, declared once.
 *
 * <p>Import and export both read this, so a sheet downloaded from
 * {@code /export} can be edited and uploaded back to {@code /upload} without
 * anything being lost in the round trip. That loop is the whole point of
 * replace-all semantics: you start from current state rather than authoring a
 * replacement from memory.
 */
public final class SheetSchema {

    private SheetSchema() {}

    public static final List<String> FIELD_COLUMNS = List.of(
            "key", "name_en", "name_zh", "kind", "value_type", "field_group",
            "source_tags", "applies_to", "rule_relevant", "description");

    public static final List<String> DOC_TYPE_COLUMNS = List.of(
            "code", "name_en", "name_zh", "description", "ordinal");

    /** The four kinds a dictionary entry can be. DERIVED and EXTERNAL never come
     *  from a source system, which is why the sheet carries this column at all —
     *  without it, replace-all would delete them on every upload. */
    public static final List<String> KINDS = List.of(
            "LC_FIELD", "DOC_DATA_POINT", "DERIVED", "EXTERNAL");
}
