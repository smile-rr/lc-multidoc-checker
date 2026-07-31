package com.tb.helix.infra.stream;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Progress, streamed to the browser and kept on a tape.
 *
 * <p>A run takes minutes. Without this the officer watches a spinner and cannot tell a slow
 * extraction from a hung one, so the stream is part of the product rather than
 * instrumentation.
 *
 * <p>Four details that are only obvious after getting them wrong:
 *
 * <ul>
 *   <li><b>A replay buffer.</b> A browser that connects a moment after a run starts, or
 *       reconnects after a network blip, would otherwise see an examination that appears to
 *       have done nothing. Every subscriber is sent what it missed, from the buffer or the
 *       database.
 *   <li><b>Persisted, sequenced.</b> The buffer is bounded; the tape is not. A reconnect
 *       after the buffer has rolled still replays correctly.
 *   <li><b>A heartbeat.</b> Proxies and load balancers close idle connections, and a
 *       thirty-second extraction is idle. A comment line every fifteen seconds keeps it open
 *       and is ignored by the client.
 *   <li><b>Padding on open.</b> Some proxies buffer a response until they have a few
 *       kilobytes, which delays every event until enough have accumulated. A comment block
 *       up front pushes past that threshold.
 * </ul>
 *
 * <p>Publishing never throws. A stage that failed because nobody was listening to its
 * progress has been defeated by its own telemetry.
 */
@Component
public class SseChannel implements EventBus, EventStream {

    private static final Logger log = LoggerFactory.getLogger(SseChannel.class);

    private static final int REPLAY_BUFFER = 200;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    private final Map<String, List<SseEmitter>> subscribers = new ConcurrentHashMap<>();
    private final Map<String, Deque<Sequenced>> recent = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> sequences = new ConcurrentHashMap<>();

    /**
     * An event with the two things only the channel can say about it: where it falls in the
     * order, and when it happened.
     *
     * <p>The instant is taken once, at publish, and used for both the wire and the tape.
     * Reading it back off {@code created_at} instead would have been a second clock reading
     * of the same moment — near enough always, and the one time it was not would be a step
     * that appeared to finish before it started.
     */
    private record Sequenced(long seq, java.time.Instant at, HelixEvent event) {

        /**
         * The event as the browser sees it: envelope and payload, flat.
         *
         * <p>Flat rather than {@code {seq, at, event:{...}}}, and self-describing: the type
         * is a field of the body, not the SSE event name. Live and replayed events are then
         * byte-for-byte the same shape, which is what lets the run log fold one list without
         * caring which half of it came from where.
         */
        Map<String, Object> wire() {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("seq", seq);
            out.put("type", event.type());
            out.put("at", at.toString());
            out.putAll(event.payload());
            return out;
        }
    }

    public SseChannel(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public void publish(HelixEvent event) {
        try {
            long seq = sequences.computeIfAbsent(event.caseId(), k -> new AtomicLong(nextSeqFromDb(k)))
                    .incrementAndGet();
            Sequenced s = new Sequenced(seq, java.time.Instant.now(), event);
            persist(s);

            Deque<Sequenced> buffer = recent.computeIfAbsent(event.caseId(), k -> new ArrayDeque<>());
            synchronized (buffer) {
                buffer.addLast(s);
                while (buffer.size() > REPLAY_BUFFER) buffer.removeFirst();
            }
            fanOut(event.caseId(), s);

        } catch (RuntimeException e) {
            log.warn("Event {} for case {} not published: {}", event.type(), event.caseId(), e.toString());
        }
    }

    /**
     * Subscribes, replaying anything after {@code lastSeq}.
     *
     * @param lastSeq the client's last received sequence; 0 replays the whole run so far
     */
    @Override
    public SseEmitter subscribe(String caseId, long lastSeq) {
        SseEmitter emitter = new SseEmitter(0L);   // no server-side timeout; the heartbeat holds it
        subscribers.computeIfAbsent(caseId, k -> new CopyOnWriteArrayList<>()).add(emitter);

        emitter.onCompletion(() -> remove(caseId, emitter));
        emitter.onTimeout(() -> remove(caseId, emitter));
        emitter.onError(e -> remove(caseId, emitter));

        try {
            emitter.send(SseEmitter.event().comment(" ".repeat(2048)));
            for (Sequenced s : replayFrom(caseId, lastSeq)) send(emitter, s);
        } catch (IOException e) {
            remove(caseId, emitter);
        }
        return emitter;
    }

    /** Everything recorded for a case — for a client that would rather poll than stream. */
    @Override
    public List<Map<String, Object>> history(String caseId, long afterSeq) {
        return fromTape(caseId, afterSeq).stream().map(Sequenced::wire).toList();
    }

    // --- Internals ----------------------------------------------------------

    private void fanOut(String caseId, Sequenced s) {
        List<SseEmitter> list = subscribers.get(caseId);
        if (list == null) return;
        for (SseEmitter emitter : list) {
            try {
                send(emitter, s);
            } catch (IOException | IllegalStateException e) {
                // The client went away. Normal, and not worth a stack trace.
                remove(caseId, emitter);
            }
        }
    }

    private void send(SseEmitter emitter, Sequenced s) throws IOException {
        // The id is the SSE protocol's own — it is what a reconnecting browser sends back
        // as Last-Event-ID.
        //
        // Deliberately *unnamed*. Naming each event by its type reads well and cost us
        // `llm_call`: `EventSource` dispatches a named event only to a listener registered
        // for that exact name and offers no wildcard, so the browser has to enumerate every
        // type it wants — and an event missing from that list is delivered to nobody, with
        // no error anywhere. It still reached the tape, so the run log showed it on reload
        // and never live. Unnamed, every event arrives on one handler and the type is read
        // from the body, where {@link Sequenced#wire()} has always put it.
        emitter.send(SseEmitter.event()
                .id(String.valueOf(s.seq()))
                .data(s.wire()));
    }

    private List<Sequenced> replayFrom(String caseId, long lastSeq) {
        Deque<Sequenced> buffer = recent.get(caseId);
        if (buffer != null) {
            synchronized (buffer) {
                // Only if the buffer still reaches back far enough; otherwise the database
                // has the part that rolled off.
                if (!buffer.isEmpty() && buffer.getFirst().seq() <= lastSeq + 1) {
                    return buffer.stream().filter(s -> s.seq() > lastSeq).toList();
                }
            }
        }
        return fromTape(caseId, lastSeq);
    }

    /** The tape, read back into the same shape the buffer holds. */
    private List<Sequenced> fromTape(String caseId, long afterSeq) {
        return jdbc.query("""
                SELECT seq, created_at, event::text FROM helix_check.lc_event
                 WHERE case_id = ?::uuid AND seq > ? ORDER BY seq
                """,
                (rs, i) -> new Sequenced(
                        rs.getLong(1),
                        rs.getTimestamp(2).toInstant(),
                        fromJson(rs.getString(3), caseId)),
                caseId, afterSeq);
    }

    private void persist(Sequenced s) {
        try {
            jdbc.update("""
                    INSERT INTO helix_check.lc_event (case_id, seq, event, created_at)
                    VALUES (?::uuid, ?, ?::jsonb, ?)
                    ON CONFLICT (case_id, seq) DO NOTHING
                    """,
                    s.event().caseId(), s.seq(),
                    json.writeValueAsString(Map.of("type", s.event().type(), "payload", s.event().payload())),
                    java.sql.Timestamp.from(s.at()));
        } catch (Exception e) {
            log.debug("Event tape write skipped for {}: {}", s.event().caseId(), e.toString());
        }
    }

    private long nextSeqFromDb(String caseId) {
        try {
            Long max = jdbc.queryForObject(
                    "SELECT COALESCE(MAX(seq), 0) FROM helix_check.lc_event WHERE case_id = ?::uuid",
                    Long.class, caseId);
            return max == null ? 0 : max;
        } catch (RuntimeException e) {
            return 0;
        }
    }

    private void remove(String caseId, SseEmitter emitter) {
        List<SseEmitter> list = subscribers.get(caseId);
        if (list != null) list.remove(emitter);
    }

    /**
     * Keeps idle connections open.
     *
     * <p>Fifteen seconds is comfortably inside the thirty a default proxy allows, and a
     * comment line costs nothing.
     */
    @Scheduled(fixedRate = 15_000)
    void heartbeat() {
        subscribers.forEach((caseId, list) -> {
            for (SseEmitter emitter : list) {
                try {
                    emitter.send(SseEmitter.event().comment("keep-alive"));
                } catch (IOException | IllegalStateException e) {
                    remove(caseId, emitter);
                }
            }
        });
    }

    private HelixEvent fromJson(String raw, String caseId) {
        try {
            var node = json.readTree(raw);
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = json.convertValue(node.path("payload"), Map.class);
            return HelixEvent.of(caseId, node.path("type").asText(), payload);
        } catch (Exception e) {
            return HelixEvent.of(caseId, "unknown");
        }
    }
}
