package com.tb.helix.harness.llm.backend;

import java.util.Optional;

/**
 * Something that can put one exchange to one model and return what it said.
 *
 * <p>Two methods. That is the point: everything else a model call needs — which model answers a
 * role, how many vote, what it cost, what to do when the answer is not the JSON it promised, how
 * many turns a tool conversation may take — is settled above this line and cannot be forgotten
 * here. See the package note for the four things a backend must honour.
 *
 * <p><b>Implementations do not have to speak HTTP.</b> A backend may wrap a framework, an SDK,
 * an in-process model or a queue. Nothing on {@link Exchange} or {@link Completion} is a wire
 * concept: turns, ordered content parts, tokens and latency are what every model API has.
 *
 * <p>Backends are Spring beans and the gateway collects all of them. Which one answers is not
 * decided here and not decided in code: {@code helix.models.roles} names a handle, the gateway
 * asks each backend whether that name is theirs, and the first to claim it wins. So moving one
 * role onto a new backend is a line of configuration, and moving it back is the same line.
 */
public interface ModelBackend {

    /** For logs and startup diagnostics — {@code chat-completions}, and whatever joins it. */
    String name();

    /**
     * The handle this backend knows by that name, if any.
     *
     * <p>Names are unique across backends. Two backends claiming one name is a configuration
     * mistake, and the gateway reports it at startup rather than letting whichever bean happened
     * to be first quietly win.
     */
    Optional<ModelHandle> handle(String id);

    /**
     * One round trip.
     *
     * <p>May retry internally — transport failures and rate limits are the backend's business,
     * because only it knows what its transport does. It must not retry a refusal, and it must
     * not swallow a failure: a caller that gets no answer needs to know, and a rule that
     * concludes "pass" because the model was unreachable is the worst failure here.
     *
     * @throws RuntimeException when the model could not be reached or would not answer. The
     *                          gateway records the attempt, its latency and its error before
     *                          deciding whether the call as a whole has failed
     */
    Completion call(ModelHandle handle, Exchange exchange);
}
