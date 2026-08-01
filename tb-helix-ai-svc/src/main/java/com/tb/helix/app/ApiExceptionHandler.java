package com.tb.helix.app;

import com.tb.helix.infra.error.HelixException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * One place that turns a failure into a response.
 *
 * <p>Every typed failure already knows its own status and code, so this does not translate
 * anything — it reads what the exception says. That is the point: two controllers cannot
 * disagree about what "document unreadable" means over HTTP.
 *
 * <p>Messages on {@link HelixException} are written to be read by an officer and go out as
 * they are. Anything else is a bug, so its message does not: it is logged with a stack
 * trace and the client is told only that something broke. A leaked provider error code
 * helps nobody using the workbench and tells anyone else more than they should know.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(HelixException.class)
    public ResponseEntity<Map<String, Object>> handled(HelixException e) {
        // Expected. Logged at warn without a trace — a corrupt upload is not an incident.
        log.warn("{} ({}): {}", e.getClass().getSimpleName(), e.code(), e.getMessage());
        return ResponseEntity.status(e.status()).body(body(e.code(), e.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(body("bad_request", e.getMessage()));
    }

    /**
     * Browser closed the SSE (or any async) connection. Expected — refresh, navigate away,
     * HMR. No body: the response is already {@code text/event-stream} and unusable.
     */
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public ResponseEntity<Void> clientGone(AsyncRequestNotUsableException e) {
        Throwable cause = e.getCause();
        String detail = cause != null && cause.getMessage() != null ? cause.getMessage() : e.getMessage();
        log.warn("Client disconnected: {}", detail);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unhandled(Exception e) {
        // Spring's own failures about the request itself — no such endpoint, wrong method,
        // unsupported media type, a missing parameter — all implement ErrorResponse and
        // already carry the status Spring chose. Reported as that status rather than as a
        // 500, because a caller told "something went wrong" goes looking for a server fault
        // over what is usually a typo in a URL.
        //
        // Branched here rather than given its own @ExceptionHandler because ErrorResponse is
        // an interface and not a Throwable — the annotation will not take it, and listing
        // the dozen concrete subclasses instead is a list that goes stale.
        if (e instanceof ErrorResponse typed) {
            String reason = e.getMessage() == null ? "The request did not match an endpoint." : e.getMessage();
            log.warn("{} → {}", typed.getStatusCode(), reason);
            return ResponseEntity.status(typed.getStatusCode()).body(body("bad_request", reason));
        }
        log.error("Unhandled failure", e);
        return ResponseEntity.internalServerError()
                .body(body("internal_error", "Something went wrong. The failure has been logged."));
    }

    private Map<String, Object> body(String code, String message) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("message", message);
        return out;
    }
}
