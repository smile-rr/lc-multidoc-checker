package com.lc.v2.checker.infra.stream;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.PipelineEvent;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * SSE fan-out: subscribes to Spring ApplicationEvents from PipelineEventBus,
 * delivers to all registered SseEmitters for the session, and persists every
 * event to {@code lc_v2.pipeline_events} via SessionStore.
 *
 * One SessionChannel per active session: holds a ring buffer (last 512 events)
 * for late-joining subscribers, and a live emitter list.
 */
@Component
public class PipelineEventChannel {

    private static final Logger log = LoggerFactory.getLogger(PipelineEventChannel.class);
    private static final int RING_BUFFER_SIZE = 512;

    private final Map<String, SessionChannel> channels = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper()
            .findAndRegisterModules();
    private final SessionStore sessionStore;

    public PipelineEventChannel(SessionStore sessionStore) {
        this.sessionStore = sessionStore;
    }

    /** Create (or return existing) channel for a session. */
    public SessionChannel channel(String sessionId) {
        return channels.computeIfAbsent(sessionId, id -> new SessionChannel(id, RING_BUFFER_SIZE));
    }

    /** Register a new SSE subscriber; replays buffered events immediately.
     *  Timeout is set to {@link Long#MAX_VALUE} — the heartbeat keeps the
     *  connection alive indefinitely, and the EventSource on the client side
     *  closes the stream when the user navigates away. A short timeout caused
     *  long-running stages (60s+ vision LLM extraction) to disconnect the UI
     *  silently behind tunnels. */
    public SseEmitter subscribe(String sessionId) {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        SessionChannel ch = channel(sessionId);

        emitter.onCompletion(() -> ch.removeEmitter(emitter));
        emitter.onTimeout(() -> ch.removeEmitter(emitter));
        emitter.onError(e -> ch.removeEmitter(emitter));

        // Initial padding flush — many proxies buffer until ~2KB or a flush
        // boundary. A leading comment + 2KB of NUL-comment padding forces
        // intermediate proxies to commit the response headers and start
        // streaming, so the first real event isn't held back for ~30s.
        try {
            emitter.send(SseEmitter.event().comment("ok"));
            emitter.send(SseEmitter.event().comment(" ".repeat(2048)));
        } catch (IOException e) {
            ch.removeEmitter(emitter);
            return emitter;
        }

        ch.addEmitter(emitter);
        ch.replayHistory(emitter, objectMapper);
        return emitter;
    }

    /**
     * Heartbeat — every 15s, send an SSE comment line to every live emitter.
     * Comments are ignored by EventSource but keep proxies (Cloudflare 100s,
     * many corporate proxies 30s) from dropping idle connections during long
     * silent gaps (e.g. while the vision LLM is generating).
     */
    @Scheduled(fixedDelay = 15_000L, initialDelay = 15_000L)
    public void heartbeat() {
        for (SessionChannel ch : channels.values()) {
            ch.heartbeat();
        }
    }

    @Async
    @EventListener
    public void onPipelineEvent(PipelineEvent event) {
        SessionChannel ch = channels.get(event.sessionId());
        if (ch == null) return;

        // Assign seq BEFORE serialising so it's stable for both SSE and DB.
        long seq = ch.nextSeq();

        try {
            String json = objectMapper.writeValueAsString(Map.of(
                    "type", event.getClass().getSimpleName(),
                    "sessionId", event.sessionId(),
                    "ts", event.timestamp().toEpochMilli(),
                    "seq", seq,
                    "data", event));

            ch.publish(json);
            sessionStore.appendEvent(event.sessionId(), seq, json);

        } catch (Exception e) {
            log.warn("[SSE] Failed to serialise event: {}", e.getMessage());
        }
    }

    public void complete(String sessionId) {
        SessionChannel ch = channels.remove(sessionId);
        if (ch != null) ch.closeAll();
    }

    public static class SessionChannel {
        private final String sessionId;
        private final String[] ringBuffer;
        private final AtomicLong seq = new AtomicLong(0);
        private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

        SessionChannel(String sessionId, int bufferSize) {
            this.sessionId = sessionId;
            this.ringBuffer = new String[bufferSize];
        }

        /** Returns the next sequence number (atomically incremented). */
        synchronized long nextSeq() {
            return seq.getAndIncrement();
        }

        void publish(String json) {
            ringBuffer[(int) (seq.get() % ringBuffer.length)] = json;
            deliver(json);
        }

        void replayHistory(SseEmitter emitter, ObjectMapper mapper) {
            long current = seq.get();
            long start = Math.max(0, current - ringBuffer.length);
            for (long i = start; i < current; i++) {
                String event = ringBuffer[(int) (i % ringBuffer.length)];
                if (event != null) sendTo(emitter, event);
            }
        }

        void addEmitter(SseEmitter emitter) { emitters.add(emitter); }
        void removeEmitter(SseEmitter emitter) { emitters.remove(emitter); }

        private void deliver(String json) {
            List<SseEmitter> dead = new java.util.ArrayList<>();
            for (SseEmitter emitter : emitters) {
                if (!sendTo(emitter, json)) dead.add(emitter);
            }
            emitters.removeAll(dead);
        }

        private boolean sendTo(SseEmitter emitter, String json) {
            try {
                emitter.send(SseEmitter.event().data(json));
                return true;
            } catch (IOException e) {
                return false;
            }
        }

        void heartbeat() {
            if (emitters.isEmpty()) return;
            List<SseEmitter> dead = new java.util.ArrayList<>();
            for (SseEmitter emitter : emitters) {
                try {
                    emitter.send(SseEmitter.event().comment("hb"));
                } catch (Exception e) {
                    dead.add(emitter);
                }
            }
            emitters.removeAll(dead);
        }

        void closeAll() {
            for (SseEmitter emitter : emitters) {
                try { emitter.complete(); } catch (Exception ignored) {}
            }
            emitters.clear();
        }
    }
}
