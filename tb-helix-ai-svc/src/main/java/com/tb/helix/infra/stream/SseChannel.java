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
public class SseChannel implements EventBus {

    private static final Logger log = LoggerFactory.getLogger(SseChannel.class);

    private static final int REPLAY_BUFFER = 200;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    private final Map<String, List<SseEmitter>> subscribers = new ConcurrentHashMap<>();
    private final Map<String, Deque<Sequenced>> recent = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> sequences = new ConcurrentHashMap<>();

    private record Sequenced(long seq, HelixEvent event) {
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
            persist(event, seq);

            Deque<Sequenced> buffer = recent.computeIfAbsent(event.caseId(), k -> new ArrayDeque<>());
            synchronized (buffer) {
                buffer.addLast(new Sequenced(seq, event));
                while (buffer.size() > REPLAY_BUFFER) buffer.removeFirst();
            }
            fanOut(event.caseId(), new Sequenced(seq, event));

        } catch (RuntimeException e) {
            log.warn("Event {} for case {} not published: {}", event.type(), event.caseId(), e.toString());
        }
    }

    /**
     * Subscribes, replaying anything after {@code lastSeq}.
     *
     * @param lastSeq the client's last received sequence; 0 replays the whole run so far
     */
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
    public List<Map<String, Object>> history(String caseId, long afterSeq) {
        return jdbc.query("""
                SELECT seq, event::text FROM helix_check.lc_event
                 WHERE case_id = ?::uuid AND seq > ? ORDER BY seq
                """,
                (rs, i) -> Map.of("seq", rs.getLong(1), "event", readTree(rs.getString(2))),
                caseId, afterSeq);
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
        emitter.send(SseEmitter.event()
                .id(String.valueOf(s.seq()))
                .name(s.event().type())
                .data(s.event().payload()));
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
        return jdbc.query("""
                SELECT seq, event::text FROM helix_check.lc_event
                 WHERE case_id = ?::uuid AND seq > ? ORDER BY seq
                """,
                (rs, i) -> new Sequenced(rs.getLong(1), fromJson(rs.getString(2), caseId)),
                caseId, lastSeq);
    }

    private void persist(HelixEvent event, long seq) {
        try {
            jdbc.update("""
                    INSERT INTO helix_check.lc_event (case_id, seq, event) VALUES (?::uuid, ?, ?::jsonb)
                    ON CONFLICT (case_id, seq) DO NOTHING
                    """,
                    event.caseId(), seq,
                    json.writeValueAsString(Map.of("type", event.type(), "payload", event.payload())));
        } catch (Exception e) {
            log.debug("Event tape write skipped for {}: {}", event.caseId(), e.toString());
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

    private Object readTree(String raw) {
        try {
            return json.readValue(raw, Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }
}
