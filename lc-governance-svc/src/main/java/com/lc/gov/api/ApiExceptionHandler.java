package com.lc.gov.api;

import com.lc.gov.dictionary.SheetException;
import com.lc.gov.library.PdfRejectedException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * Turns the failures these endpoints actually produce into responses a person
 * can act on.
 *
 * <p>A rejected upload is a normal outcome here, not an incident: the message is
 * read by whoever prepared the spreadsheet or scanned the PDF, so it says what
 * was wrong and what to do instead.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    /** A spreadsheet that did not validate. Every row problem is returned at
     *  once — fixing a 200-row sheet one error per round trip is not a workflow. */
    @ExceptionHandler(SheetException.class)
    public ResponseEntity<Map<String, Object>> sheet(SheetException e) {
        return ResponseEntity.badRequest().body(body(e.getMessage(), e.getErrors()));
    }

    /** A scan, an encrypted file, or not a PDF. 422 rather than 400: the request
     *  was well-formed, the content is the problem. */
    @ExceptionHandler(PdfRejectedException.class)
    public ResponseEntity<Map<String, Object>> pdf(PdfRejectedException e) {
        return ResponseEntity.unprocessableEntity().body(body(e.getMessage(), List.of()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(body(e.getMessage(), List.of()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> invalidBody(MethodArgumentNotValidException e) {
        List<String> errors = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .toList();
        return ResponseEntity.badRequest().body(body("the request body is not valid", errors));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> tooLarge(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(body("the uploaded file is larger than this service accepts", List.of()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception e) {
        log.error("Unhandled failure", e);
        return ResponseEntity.internalServerError()
                .body(body("unexpected failure: " + e.getClass().getSimpleName(), List.of()));
    }

    private Map<String, Object> body(String message, List<String> errors) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("message", message);
        if (!errors.isEmpty()) out.put("errors", errors);
        return out;
    }
}
