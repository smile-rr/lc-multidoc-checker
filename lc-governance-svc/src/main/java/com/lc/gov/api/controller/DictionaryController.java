package com.lc.gov.api.controller;

import com.lc.gov.api.dto.DictionaryDtos.DocTypeRequest;
import com.lc.gov.api.dto.DictionaryDtos.FieldRequest;
import com.lc.gov.dictionary.DictionaryExportService;
import com.lc.gov.dictionary.DictionaryImportService;
import com.lc.gov.dictionary.DictionaryImportService.ImportResult;
import com.lc.gov.dictionary.SheetSchema;
import com.lc.gov.domain.dictionary.DictField;
import com.lc.gov.domain.dictionary.DocTypeDef;
import com.lc.gov.infra.persistence.DictionaryStore;
import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The Dictionary — the vocabulary a check may name.
 *
 * <pre>
 *   GET    /api/gov/dictionary/fields[?docType=INV]   the field pool
 *   POST   /api/gov/dictionary/fields                 create or update one entry
 *   DELETE /api/gov/dictionary/fields/{key}
 *   POST   /api/gov/dictionary/fields/upload          replace ALL from .csv/.xlsx
 *   GET    /api/gov/dictionary/fields/export?format=  download in upload's shape
 *
 *   …and the same five for /doc-types.
 *
 *   GET    /api/gov/dictionary/keys                   for editor lint/autocomplete
 *   GET    /api/gov/dictionary/schema                 the column contract
 * </pre>
 *
 * <p>Upload is <b>replace-all</b>: every row is deleted and the sheet inserted.
 * The sheet is therefore the whole dictionary, DERIVED and EXTERNAL entries
 * included — that is what the {@code kind} column is for. Export first, edit,
 * upload back.
 */
@RestController
@RequestMapping("/api/gov/dictionary")
public class DictionaryController {

    private final DictionaryStore dictionary;
    private final DictionaryImportService importer;
    private final DictionaryExportService exporter;

    public DictionaryController(DictionaryStore dictionary,
                                DictionaryImportService importer,
                                DictionaryExportService exporter) {
        this.dictionary = dictionary;
        this.importer = importer;
        this.exporter = exporter;
    }

    // ── fields ──────────────────────────────────────────────────────────────

    @GetMapping("/fields")
    public Map<String, Object> fields(@RequestParam(required = false) String docType) {
        List<DictField> fields = (docType == null || docType.isBlank())
                ? dictionary.listFields()
                : dictionary.listFieldsForDocType(docType);
        return Map.of("count", fields.size(), "fields", fields);
    }

    @PostMapping("/fields")
    public ResponseEntity<DictField> upsertField(@Valid @RequestBody FieldRequest request) {
        DictField field = request.toDomain();
        if (!SheetSchema.KINDS.contains(field.kind())) {
            throw new IllegalArgumentException("kind must be one of " + SheetSchema.KINDS);
        }
        boolean existed = dictionary.findField(field.key()) != null;
        dictionary.upsert(field);
        return existed
                ? ResponseEntity.ok(dictionary.findField(field.key()))
                : ResponseEntity.status(201).body(dictionary.findField(field.key()));
    }

    @DeleteMapping("/fields/{key}")
    public ResponseEntity<Void> deleteField(@PathVariable String key) {
        return dictionary.deleteField(key)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    @PostMapping("/fields/upload")
    public Map<String, Object> uploadFields(@RequestParam("file") MultipartFile file) throws IOException {
        ImportResult result = importer.replaceFields(file.getOriginalFilename(), file.getInputStream());
        return replaceResponse("fields", result);
    }

    @GetMapping("/fields/export")
    public ResponseEntity<byte[]> exportFields(
            @RequestParam(defaultValue = "xlsx") String format) throws IOException {
        return "csv".equalsIgnoreCase(format)
                ? csv("dictionary-fields.csv", exporter.fieldsCsv())
                : xlsx("dictionary-fields.xlsx", exporter.fieldsXlsx());
    }

    // ── doc types ───────────────────────────────────────────────────────────

    @GetMapping("/doc-types")
    public Map<String, Object> docTypes() {
        List<DocTypeDef> types = dictionary.listDocTypes();
        return Map.of("count", types.size(), "docTypes", types);
    }

    @PostMapping("/doc-types")
    public ResponseEntity<DocTypeDef> upsertDocType(@Valid @RequestBody DocTypeRequest request) {
        DocTypeDef docType = request.toDomain();
        boolean existed = dictionary.findDocType(docType.code()) != null;
        dictionary.upsertDocType(docType);
        return ResponseEntity.status(existed ? 200 : 201).body(dictionary.findDocType(docType.code()));
    }

    @DeleteMapping("/doc-types/{code}")
    public ResponseEntity<Void> deleteDocType(@PathVariable String code) {
        return dictionary.deleteDocType(code)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    @PostMapping("/doc-types/upload")
    public Map<String, Object> uploadDocTypes(@RequestParam("file") MultipartFile file) throws IOException {
        ImportResult result = importer.replaceDocTypes(file.getOriginalFilename(), file.getInputStream());
        return replaceResponse("docTypes", result);
    }

    @GetMapping("/doc-types/export")
    public ResponseEntity<byte[]> exportDocTypes(
            @RequestParam(defaultValue = "xlsx") String format) throws IOException {
        return "csv".equalsIgnoreCase(format)
                ? csv("doc-types.csv", exporter.docTypesCsv())
                : xlsx("doc-types.xlsx", exporter.docTypesXlsx());
    }

    // ── helpers for the editor ──────────────────────────────────────────────

    @GetMapping("/keys")
    public Map<String, Object> keys() {
        return Map.of("keys", dictionary.fieldKeys().stream().sorted().toList());
    }

    /** The columns an upload accepts — so a client can render the contract
     *  instead of hard-coding a copy of it that drifts. */
    @GetMapping("/schema")
    public Map<String, Object> schema() {
        return Map.of(
                "fieldColumns", SheetSchema.FIELD_COLUMNS,
                "docTypeColumns", SheetSchema.DOC_TYPE_COLUMNS,
                "kinds", SheetSchema.KINDS,
                "required", Map.of("fields", List.of("key", "name_en"),
                                   "docTypes", List.of("code", "name_en")),
                "multiValueColumns", List.of("source_tags", "applies_to"),
                "multiValueSeparators", List.of(",", ";", "|"),
                "semantics", "upload replaces every row; export first, edit, upload back");
    }

    // ── responses ───────────────────────────────────────────────────────────

    private Map<String, Object> replaceResponse(String what, ImportResult result) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("replaced", what);
        out.put("removed", result.removed());
        out.put("inserted", result.inserted());
        out.put("warnings", result.warnings());
        return out;
    }

    private ResponseEntity<byte[]> xlsx(String filename, byte[] body) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename).build().toString())
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(body);
    }

    private ResponseEntity<byte[]> csv(String filename, String body) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename).build().toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(body.getBytes(StandardCharsets.UTF_8));
    }
}
