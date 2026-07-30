package com.tb.helix.lccheck.types;

import java.util.List;

/**
 * How far an examination has got.
 *
 * <p>Carried on the case so one examined earlier opens with its findings in place, rather
 * than the workbench assuming every case it loads starts unexamined.
 *
 * @param stage  where the case is sitting, by key
 * @param busy   a stage is running <em>now</em>. The browser opens a progress stream on
 *               this, which is what lets it be told rather than having to ask: a case can
 *               be opened, reloaded or shared mid-run and the new tab picks the run up.
 * @param error  what went wrong, if the last stage failed. A stopped run has to say so, or
 *               it is indistinguishable from a slow one.
 */
public record RunState(
        String stage,
        boolean busy,
        String error,
        boolean started,
        boolean finished,
        int segmented,
        List<String> completedAreaIds) {
}
