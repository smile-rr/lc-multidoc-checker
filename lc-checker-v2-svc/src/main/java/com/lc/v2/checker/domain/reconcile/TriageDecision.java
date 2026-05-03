package com.lc.v2.checker.domain.reconcile;

/**
 * Officer triage decision on a reconcile discrepancy.
 * Recorded before the session proceeds to Examine.
 */
public enum TriageDecision {
    GENUINE,      // real discrepancy — carry forward to Examine
    PARSE_ERROR,  // extraction artifact — ignore for rule evaluation
}
