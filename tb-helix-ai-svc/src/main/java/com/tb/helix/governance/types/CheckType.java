package com.tb.helix.governance.types;

/**
 * How a check reaches its answer, escalating in cost and autonomy.
 *
 * <p>Authored in Governance, executed by lc-check. Do not give a check a higher type than
 * its question needs — a comparison of two dates does not want an agent, and an agent that
 * runs where an expression would do costs money on every presentation forever.
 */
public enum CheckType {

    /** An expression over extracted fields. Deterministic, no model, free. */
    PROGRAMMATIC(Tier.EXACT),

    /** One structured model call, no tools. */
    AGENT(Tier.JUDGED),

    /** A model plus compute tools — date arithmetic, currency. Bounded at three turns. */
    AGENT_TOOL(Tier.JUDGED),

    /** A multi-turn tool-using loop, hard-capped. For free text a rule cannot anticipate. */
    AGENTIC(Tier.JUDGED);

    private final Tier tier;

    CheckType(Tier tier) {
        this.tier = tier;
    }

    /**
     * Exact or judged.
     *
     * <p>Derived, never stored beside the type: two columns that must agree are two columns
     * that will eventually disagree, and the officer reads the tier to decide how much
     * scrutiny a finding deserves.
     */
    public Tier tier() {
        return tier;
    }

    public boolean exact() {
        return tier == Tier.EXACT;
    }

    public static CheckType of(String value) {
        if (value == null) return AGENT;
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            // An unknown type is treated as judged: assuming an unrecognised check is free
            // and deterministic is the more dangerous of the two guesses.
            return AGENT;
        }
    }
}
