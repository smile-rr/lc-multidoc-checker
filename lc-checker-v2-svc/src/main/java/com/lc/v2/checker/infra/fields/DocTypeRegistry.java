package com.lc.v2.checker.infra.fields;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.lc.v2.checker.domain.common.DocType;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/**
 * Loads doc-type-registry.yaml at startup.
 * Provides: filename keyword detection order, extraction prompt path per doc type.
 */
@Component
public class DocTypeRegistry {

    private static final Logger log = LoggerFactory.getLogger(DocTypeRegistry.class);

    private final ResourceLoader resourceLoader;
    private final String registryPath;
    private Map<String, DocTypeEntry> byCode;
    private List<DocTypeEntry> filenameDetectionOrder;

    public DocTypeRegistry(
            ResourceLoader resourceLoader,
            @Value("${fields.doc-type-registry-path:classpath:/fields/doc-type-registry.yaml}") String registryPath) {
        this.resourceLoader = resourceLoader;
        this.registryPath = registryPath;
    }

    @PostConstruct
    public void load() throws IOException {
        Resource resource = resourceLoader.getResource(registryPath);
        if (!resource.exists()) {
            throw new IllegalStateException("Doc type registry not found at " + registryPath);
        }

        ObjectMapper mapper = new ObjectMapper(new YAMLFactory())
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        DocTypeRegistryFile parsed;
        try (InputStream in = resource.getInputStream()) {
            parsed = mapper.readValue(in, DocTypeRegistryFile.class);
        }

        Map<String, DocTypeEntry> codeMap = new java.util.LinkedHashMap<>();
        List<DocTypeEntry> detectionList = new java.util.ArrayList<>();

        for (DocTypeEntry entry : parsed.docTypes().values()) {
            codeMap.put(entry.code(), entry);
            if ("FILENAME".equals(entry.detection())) {
                detectionList.add(entry);
            }
        }

        this.byCode = Collections.unmodifiableMap(codeMap);
        this.filenameDetectionOrder = List.copyOf(detectionList);

        log.info("DocTypeRegistry loaded {} doc types ({} filename-detectable)",
                byCode.size(), filenameDetectionOrder.size());
    }

    /** Classify a filename to a DocType using keyword matching (longest match wins). */
    public DocType classifyFilename(String filename) {
        if (filename == null || filename.isBlank()) return DocType.UNKNOWN;
        String lower = filename.toLowerCase();
        for (DocTypeEntry entry : filenameDetectionOrder) {
            for (String kw : entry.filenameKeywords()) {
                if (lower.contains(kw.toLowerCase())) {
                    return DocType.valueOf(entry.code());
                }
            }
        }
        return DocType.UNKNOWN;
    }

    public Optional<DocTypeEntry> byDocType(DocType docType) {
        return Optional.ofNullable(byCode.get(docType.name()));
    }

    /** Officer-facing label for segmentation UI; falls back to {@code nameEn}. */
    public String descFor(DocType docType) {
        return byDocType(docType)
                .map(e -> e.descEn() != null && !e.descEn().isBlank() ? e.descEn() : e.nameEn())
                .orElse(docType.name());
    }

    public List<DocTypeEntry> filenameDetectionOrder() { return filenameDetectionOrder; }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DocTypeRegistryFile(Map<String, DocTypeEntry> docTypes) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DocTypeEntry(
            String code,
            String nameEn,
            String nameZh,
            String descEn,
            String detection,
            List<String> filenameKeywords,
            String extractionPrompt,
            List<String> fieldKeys
    ) {
        public DocTypeEntry {
            filenameKeywords = filenameKeywords == null ? List.of() : List.copyOf(filenameKeywords);
            fieldKeys = fieldKeys == null ? List.of() : List.copyOf(fieldKeys);
        }
    }
}
