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
 * @param nextStage what pressing the button will run. Derived on the case, not guessed from
 *               the stage order, so a pipeline that skips or folds a stage does not need the
 *               browser to know that it did.
 * @param halted a hard check stopped the examination and it will not go on until an officer
 *               says so. Distinct from every other reason a case is idle: without it the
 *               workbench reports a blocked case as "Paused", which reads as "still going"
 *               and offers a button that runs the same gate into the same wall.
 * @param haltedBy the check that stopped it, by id — the officer overrides *that*, not the
 *               case in general.
 */
public record RunState(
        String stage,
        boolean busy,
        String error,
        boolean started,
        boolean finished,
        int segmented,
        String nextStage,
        boolean awaitingOfficer,
        boolean halted,
        String haltedBy,
        List<String> completedAreaIds) {
}
