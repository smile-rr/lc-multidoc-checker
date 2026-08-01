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
 * @param halted a threshold check stopped the examination under the behaviour that preceded
 *               a planner able to read the credit's own terms. Nothing sets it now; a case
 *               parked before the change still reports it, and still has its way out.
 * @param haltedBy the check that stopped it, by id — the officer overrides *that*, not the
 *               case in general.
 * @param stoppedAfterPlan the plan weighed a threshold failure against this credit and
 *               decided the remaining checks were spend on a settled question. Not a halt:
 *               the case parks at {@code execute} like any other and the ordinary run button
 *               finishes it. What it changes is that Auto stops chaining — a run that carried
 *               on regardless would make the decision pointless.
 * @param stoppedBecause the planner's reason, in the words the officer reads on screen.
 * @param remaining how many planned checks have not been run. Nought once they have.
 * @param humanReview how many planned checks nothing but a person can settle.
 * @param destination where Auto should leave the officer: {@code decision} normally, and
 *               {@code review} when something on the plan needs a person. Answered here
 *               rather than worked out in the browser, because it follows from the plan and
 *               the browser would be re-deriving it from a copy of the plan.
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
        boolean stoppedAfterPlan,
        String stoppedBecause,
        int remaining,
        int humanReview,
        String destination,
        /**
         * Who presses next — {@code auto} or {@code step}.
         *
         * <p>On the case rather than in the browser, because it is a fact about how this
         * examination is being conducted. It lived in one tab's reducer, initialised to
         * {@code auto} on every mount, so the one mode you choose <em>because</em> you want
         * to be asked was the one that did not survive a reload.
         */
        String mode,
        List<String> completedAreaIds) {
}
