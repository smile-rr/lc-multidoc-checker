package com.lc.v2.checker.api.controller;

import com.lc.v2.checker.infra.presets.PresetService;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Preset bundles loaded from the test/cases directory.
 *
 *   GET /api/v2/presets                          → {presets: [{id, label, files: [{name, type, size}]}]}
 *   GET /api/v2/presets/{id}/files/{filename}    → raw file bytes
 *
 * The UI calls these to populate the HomePage "Load preset" buttons.
 */
@RestController
@RequestMapping("/api/v2/presets")
public class PresetsController {

    private final PresetService presetService;

    public PresetsController(PresetService presetService) {
        this.presetService = presetService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> list() {
        return ResponseEntity.ok(Map.of("presets", presetService.bundlesAsMap()));
    }

    @GetMapping("/{id}/files/{filename}")
    public ResponseEntity<byte[]> file(@PathVariable String id, @PathVariable String filename) {
        return presetService.readFile(id, filename)
                .map(fb -> {
                    HttpHeaders headers = new HttpHeaders();
                    headers.setContentType(MediaType.parseMediaType(fb.contentType()));
                    headers.setContentLength(fb.bytes().length);
                    headers.setContentDispositionFormData("inline", fb.name());
                    return new ResponseEntity<>(fb.bytes(), headers, 200);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
