package com.tb.helix.lccheck.domain;

import java.util.List;

/**
 * How far an examination has got.
 *
 * <p>Carried on the case so one examined earlier opens with its findings in place, rather
 * than the workbench assuming every case it loads starts unexamined.
 */
public record RunState(
        boolean started,
        boolean finished,
        int segmented,
        List<String> completedAreaIds) {
}
