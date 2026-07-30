package com.tb.helix.infra.stream;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * Subscribing to a case's progress.
 *
 * <p>Separate from {@link EventBus} because they are opposite ends of the same pipe and
 * have different callers: a stage publishes and never subscribes; a controller subscribes
 * and never publishes. One interface carrying both would hand every stage the ability to
 * open an HTTP stream.
 *
 * <p>{@code SseEmitter} appears in the signature and that is deliberate — this is the
 * HTTP-facing side, and pretending otherwise would mean inventing a transport-neutral
 * abstraction with exactly one implementation.
 */
public interface EventStream {

    /**
     * Subscribes, replaying anything after {@code lastSeq}.
     *
     * @param lastSeq the client's last received sequence; 0 replays the run so far
     */
    SseEmitter subscribe(String caseId, long lastSeq);

    /** The same events as a plain list, for a client that would rather poll. */
    List<Map<String, Object>> history(String caseId, long afterSeq);
}
