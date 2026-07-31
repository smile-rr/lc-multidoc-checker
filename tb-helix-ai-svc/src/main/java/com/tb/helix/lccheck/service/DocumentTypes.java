package com.tb.helix.lccheck.service;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.governance.spi.CheckCatalog.DocTypeDef;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * What a document can be, asked of the dictionary.
 *
 * <p>There used to be a static map here — ten codes with their labels, abbreviations and
 * icons, in Java — while Governance kept fourteen different ones in a table someone could
 * edit. Both called themselves the shared vocabulary. Nothing joined them, so five of eleven
 * authored checks were skipped on a presentation containing exactly the documents they asked
 * for, and the skip reason read like a considered judgement.
 *
 * <p>So: the dictionary is the definition, and this is the only way lc-check reads it.
 * Nothing here branches on a code — {@link #credit()} and {@link #schedule()} ask by
 * <em>role</em>, which is authored beside the name. An examination that hardcoded
 * {@code "CS"} to find the presentation date was working around not asking.
 *
 * <p>Not cached. The catalogue is small, the query is indexed, and a vocabulary that can be
 * edited in one window must be current in the next — a stale copy would mean a document type
 * added at 10:00 is unknown to a case opened at 10:01, which is exactly the kind of thing
 * nobody thinks to look for.
 */
@Component
public class DocumentTypes {

    /**
     * A page that belongs to none of the authored types.
     *
     * <p>Reserved, and deliberately not a dictionary row: it is the <em>absence</em> of a
     * type, so it must not be renameable, deletable, or bindable to a field. A classifier
     * that cannot place a page has to be able to say so — the alternative is guessing, and a
     * wrong type sends the wrong rules at the document.
     */
    public static final String UNKNOWN = "UNKNOWN";

    private final CheckCatalog catalog;

    public DocumentTypes(CheckCatalog catalog) {
        this.catalog = catalog;
    }

    public List<DocTypeDef> all() {
        return catalog.docTypes();
    }

    public boolean known(String code) {
        return all().stream().anyMatch(d -> d.code().equals(code));
    }

    /** The definition, or a stand-in for a page nobody could place. */
    public DocTypeDef of(String code) {
        return all().stream().filter(d -> d.code().equals(code)).findFirst()
                .orElse(new DocTypeDef(UNKNOWN, "Unidentified", "", null, false));
    }

    public String label(String code) {
        return of(code).name();
    }

    /**
     * A short badge for the rail — the code itself.
     *
     * <p>Codes are already short by this bank's convention, and using them is the one
     * derivation that cannot collide: two letters off the front turned BOL and BOE into the
     * same "BO". An author who wants something else can put {@code abbr} in the type's
     * attrs; nothing here needs to change for that.
     */
    public String abbr(String code) {
        if (code == null || code.isBlank()) return "??";
        return code.length() <= 4 ? code.toUpperCase() : code.substring(0, 4).toUpperCase();
    }

    /** The document carrying the terms. Empty when nobody has said which that is. */
    public Optional<DocTypeDef> credit() {
        return all().stream().filter(DocTypeDef::isCredit).findFirst();
    }

    /** The presenting bank's covering letter — where the presentation date is stated. */
    public Optional<DocTypeDef> schedule() {
        return all().stream().filter(DocTypeDef::isSchedule).findFirst();
    }

    /** The code the credit is filed under, or {@code UNKNOWN} if the dictionary has none. */
    public String creditCode() {
        return credit().map(DocTypeDef::code).orElse(UNKNOWN);
    }

    public String scheduleCode() {
        return schedule().map(DocTypeDef::code).orElse(UNKNOWN);
    }

    /**
     * The classifier's vocabulary, as a prompt fragment.
     *
     * <p>Code, name and the author's own description — which is what makes the description
     * load-bearing rather than decoration. The credit is left out: it arrives as its own
     * file and is never a page of the presentation, so offering it as an answer only invites
     * a copy of the credit inside the bundle to be labelled as the credit itself.
     */
    public String vocabulary() {
        StringBuilder sb = new StringBuilder();
        for (DocTypeDef d : all()) {
            if (d.isCredit()) continue;
            sb.append("  ").append(d.code()).append(" — ").append(d.name());
            if (d.description() != null && !d.description().isBlank()) {
                sb.append(": ").append(d.description().strip().replaceAll("\\s+", " "));
            }
            sb.append('\n');
        }
        return sb.toString();
    }
}
