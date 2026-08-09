package com.tb.helix.lccheck.rule;

import com.tb.helix.harness.expr.VerbSpec;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The verbs that are about trade documents, contributed by the module that knows.
 *
 * <p>How many days apart two dates are is true everywhere and ships with the engine. Whether
 * "ACME TRADING LTD" and "Acme Trading Limited" denote the same party is a judgement about
 * documentary credits, and an engine holding an opinion on it would be an engine that had
 * stopped being general.
 *
 * <p><b>All four answer one way only.</b> Two spellings that reduce to the same characters are
 * certainly the same party and cannot conflict — so the verb returns true and the check is
 * settled for nothing. Two that reduce apart prove nothing at all: a trading name, a branch, a
 * transliteration all reduce apart and are all the same party. So the verb returns
 * <em>nothing</em>, the leaf is unknown, and the question goes to an examiner, which is where
 * it was going anyway. What it must never do is return false.
 *
 * <p>Declaring them {@link VerbSpec#judged} is what makes a check using one <b>judged</b>
 * however its author typed it, and therefore never a threshold check — the same narrowing the
 * tree language applies to its four judgement operators, arriving at the same place from the
 * other language.
 */
@Configuration
public class LcVerbs {

    @Bean
    VerbSpec sameParty() {
        return VerbSpec.judged("sameParty", 2,
                "two names denote the same party — proves yes, never no",
                a -> certainly(PartyNames.certainlySame(text(a.get(0)), text(a.get(1)))));
    }

    @Bean
    VerbSpec noConflict() {
        return VerbSpec.judged("noConflict", 2,
                "two descriptions do not conflict — proves yes, never no",
                a -> certainly(PartyNames.certainlyIdentical(text(a.get(0)), text(a.get(1)))));
    }

    @Bean
    VerbSpec sameCountry() {
        return VerbSpec.judged("sameCountry", 2,
                "two places are in the same country — proves yes, never no",
                a -> certainly(PartyNames.certainlySame(text(a.get(0)), text(a.get(1)))));
    }

    /**
     * Deliberately never settles.
     *
     * <p>Whether two addresses agree when only the country need match is a reading of both
     * addresses, and there is no reduction that proves it. Kept as a verb so an author can say
     * what they mean and the check is routed to an examiner with the question stated, rather
     * than approximated by a comparison that would sometimes be wrong.
     */
    @Bean
    VerbSpec addrSameCountry() {
        return VerbSpec.judged("addrSameCountry", 2,
                "two addresses agree, where the same country is enough — always an examiner's",
                a -> null);
    }

    private static Boolean certainly(boolean proved) {
        // True, or nothing. Never false: see the class note.
        return proved ? Boolean.TRUE : null;
    }

    private static String text(Object o) {
        return o == null ? "" : String.valueOf(o);
    }
}
