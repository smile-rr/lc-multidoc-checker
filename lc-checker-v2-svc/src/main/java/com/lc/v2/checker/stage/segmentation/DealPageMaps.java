package com.lc.v2.checker.stage.segmentation;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.infra.presets.PresetProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

/**
 * v1 hardcoded page maps for preset deals 01–03. Loads {@code deal.manifest.yml}
 * from the preset bundle directory; falls back to embedded maps when missing.
 */
@Component
public class DealPageMaps {

    private static final Logger log = LoggerFactory.getLogger(DealPageMaps.class);

    private static final Map<String, String> DEAL_NO_TO_CASE = Map.of(
            "01", "01-widgets-singapore",
            "02", "02-apparel-acme",
            "03", "03-painting-artfinder");

    private final Path presetsDir;

    public DealPageMaps(PresetProperties props) {
        this.presetsDir = Path.of(props.getDir()).toAbsolutePath().normalize();
    }

    public Optional<DealManifest> resolve(String dealNo) {
        if (dealNo == null || dealNo.isBlank()) return Optional.empty();
        String norm = dealNo.trim();
        String caseId = DEAL_NO_TO_CASE.get(norm);
        if (caseId == null) {
            log.warn("No case mapping for deal_no={}", norm);
            return Optional.empty();
        }
        Path manifestPath = presetsDir.resolve(caseId).resolve("deal.manifest.yml");
        if (Files.isRegularFile(manifestPath)) {
            try {
                return Optional.of(parseYaml(Files.readString(manifestPath), caseId));
            } catch (IOException e) {
                log.warn("Failed to read {}: {}", manifestPath, e.getMessage());
            }
        }
        log.warn("deal.manifest.yml missing for case {} — run build-deal-tiff.py (PDF bundle generator)", caseId);
        return Optional.empty();
    }

    @SuppressWarnings("unchecked")
    private DealManifest parseYaml(String yamlText, String caseId) {
        Map<String, Object> root = new Yaml().load(yamlText);
        if (root == null) root = Map.of();
        String dealNo = String.valueOf(root.getOrDefault("deal_no", ""));
        // Backward compatible: older manifests only have 'tiff'. Newer ones may provide 'pdf'.
        String tiff = String.valueOf(root.getOrDefault("tiff", ""));
        String pdf = String.valueOf(root.getOrDefault("pdf", ""));
        String lc = String.valueOf(root.getOrDefault("lc", "lc.txt"));
        int total = ((Number) root.getOrDefault("total_pages", 0)).intValue();
        List<DealManifest.Segment> segments = new ArrayList<>();
        Object raw = root.get("segments");
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> segMap)) continue;
                @SuppressWarnings("unchecked")
                Map<String, Object> m = (Map<String, Object>) segMap;
                String dt = String.valueOf(m.get("doc_type"));
                DocType docType;
                try {
                    docType = DocType.valueOf(dt);
                } catch (IllegalArgumentException e) {
                    continue;
                }
                Object pagesObj = m.get("pages");
                List<Integer> pages = new ArrayList<>();
                if (pagesObj instanceof List<?> pageList) {
                    for (Object p : pageList) {
                        if (p instanceof Number n) pages.add(n.intValue());
                    }
                }
                if (pages.isEmpty()) {
                    log.warn("Segment {} missing pages list — skipped", dt);
                    continue;
                }
                String source = String.valueOf(m.getOrDefault("source", ""));
                Object descObj = m.get("desc");
                String desc = descObj != null ? String.valueOf(descObj).strip() : "";
                if (desc.isEmpty() || "null".equals(desc)) desc = null;
                segments.add(new DealManifest.Segment(docType, List.copyOf(pages), source, desc));
            }
        }
        // DealManifest keeps the legacy 'tiff' field; when 'pdf' is provided,
        // we prefer it as the deal bundle source file name for display.
        String source = (pdf != null && !pdf.isBlank() && !"null".equals(pdf)) ? pdf : tiff;
        return new DealManifest(dealNo, caseId, source, lc, total, List.copyOf(segments));
    }

    /** Exposed for tests / diagnostics. */
    public static Map<String, String> presetCaseIds() {
        return Map.copyOf(DEAL_NO_TO_CASE);
    }
}
