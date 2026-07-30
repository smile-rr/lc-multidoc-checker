package com.tb.helix.app;

import com.tb.helix.infra.error.HelixException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unhandled(Exception e) {
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
