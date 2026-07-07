package com.lc.v2.checker.infra.presets;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Discovers preset test-case bundles from the filesystem at startup and serves
 * their files to the UI. Bundles are subdirectories of {@code presets.dir}.
 *
 * Each file is classified by extension + filename:
 *   *.txt with "mt700" + "pass" → mt700-pass
 *   *.txt with "mt700" + "fail" → mt700-fail
 *   *.txt with "mt700"          → mt700
 *   *.pdf                        → pdf
 *
 * Subdirectories are listed alphabetically; only the first {@code presets.maxCount}
 * are exposed. Other bundles remain on disk but aren't shown — officers can still
 * upload them manually through the file picker.
 */
@Service
public class PresetService {

    private static final Logger log = LoggerFactory.getLogger(PresetService.class);

    private final PresetProperties props;
    private List<Bundle> bundles = List.of();
    private Path resolvedDir;

    public PresetService(PresetProperties props) {
        this.props = props;
    }

    @PostConstruct
    public void scan() {
        Path dir = resolveDir();
        this.resolvedDir = dir;
        if (!Files.isDirectory(dir)) {
            log.warn("[Presets] dir not found: {} — preset endpoints will be empty", dir);
            return;
        }
        List<Bundle> out = new ArrayList<>();
        try (Stream<Path> entries = Files.list(dir)) {
            entries
                    .filter(Files::isDirectory)
                    .sorted()
                    .limit(Math.max(0, props.getMaxCount()))
                    .forEach(sub -> {
                        try {
                            out.add(loadBundle(sub));
                        } catch (IOException e) {
                            log.warn("[Presets] failed to load {}: {}", sub.getFileName(), e.getMessage());
                        }
                    });
        } catch (IOException e) {
            log.warn("[Presets] dir scan failed: {}", e.getMessage());
        }
        this.bundles = Collections.unmodifiableList(out);
        log.info("[Presets] loaded {} bundles from {}", bundles.size(), dir);
    }

    /**
     * Resolve {@code presets.dir}. {@code PRESETS_DIR} / application.yml may be relative to
     * the JVM working directory; when that path is missing, try common repo layouts.
     */
    private Path resolveDir() {
        Path configured = Path.of(props.getDir()).toAbsolutePath().normalize();
        if (Files.isDirectory(configured)) {
            return configured;
        }
        String userDir = System.getProperty("user.dir");
        Path[] fallbacks = {
                Path.of(userDir, "test", "cases"),
                Path.of(userDir, "..", "test", "cases"),
        };
        for (Path candidate : fallbacks) {
            Path abs = candidate.toAbsolutePath().normalize();
            if (Files.isDirectory(abs)) {
                log.info("[Presets] configured dir {} not found; using {}", configured, abs);
                return abs;
            }
        }
        return configured;
    }

    private Bundle loadBundle(Path sub) throws IOException {
        String id = sub.getFileName().toString();
        String label = humaniseLabel(id);
        List<FileEntry> files = new ArrayList<>();
        try (Stream<Path> children = Files.list(sub)) {
            children
                    .filter(Files::isRegularFile)
                    .sorted()
                    .forEach(p -> {
                        String name = p.getFileName().toString();
                        String type = classify(name);
                        long size = 0;
                        try { size = Files.size(p); } catch (IOException ignored) {}
                        files.add(new FileEntry(name, type, size));
                    });
        }
        return new Bundle(id, label, files);
    }

    private static String humaniseLabel(String id) {
        // "01-widgets-singapore" → "01 · Widgets · Singapore"
        String[] parts = id.split("-");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i == 0) sb.append(parts[i]);
            else sb.append(" · ").append(capitalise(parts[i]));
        }
        return sb.toString();
    }

    private static String capitalise(String s) {
        if (s == null || s.isEmpty()) return s;
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static String classify(String filename) {
        String lower = filename.toLowerCase();
        if (lower.endsWith(".txt")) {
            if (lower.contains("mt700") && lower.contains("pass")) return "mt700-pass";
            if (lower.contains("mt700") && lower.contains("fail")) return "mt700-fail";
            if (lower.contains("mt700")) return "mt700";
            return "txt";
        }
        if (lower.endsWith(".pdf")) return "pdf";
        return "other";
    }

    public List<Bundle> bundles() { return bundles; }

    public Optional<Bundle> bundle(String id) {
        return bundles.stream().filter(b -> b.id().equals(id)).findFirst();
    }

    /** Read the file bytes for a preset bundle entry. */
    public Optional<FileBytes> readFile(String bundleId, String filename) {
        Optional<Bundle> b = bundle(bundleId);
        if (b.isEmpty()) return Optional.empty();
        Path filePath = resolvedDir.resolve(bundleId).resolve(filename).normalize();
        // Defensive: ensure the file is within the preset bundle dir
        Path bundlePath = resolvedDir.resolve(bundleId).normalize();
        if (!filePath.startsWith(bundlePath) || !Files.isRegularFile(filePath)) {
            return Optional.empty();
        }
        try {
            byte[] bytes = Files.readAllBytes(filePath);
            String contentType = filename.toLowerCase().endsWith(".pdf")
                    ? "application/pdf" : "text/plain;charset=UTF-8";
            return Optional.of(new FileBytes(filename, contentType, bytes));
        } catch (IOException e) {
            log.warn("[Presets] read {} / {} failed: {}", bundleId, filename, e.getMessage());
            return Optional.empty();
        }
    }

    public List<Map<String, Object>> bundlesAsMap() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Bundle b : bundles) {
            List<Map<String, Object>> files = new ArrayList<>();
            for (FileEntry f : b.files()) {
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("name", f.name());
                e.put("type", f.type());
                e.put("size", f.size());
                files.add(e);
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", b.id());
            entry.put("label", b.label());
            entry.put("files", files);
            out.add(entry);
        }
        return out;
    }

    public record Bundle(String id, String label, List<FileEntry> files) {}
    public record FileEntry(String name, String type, long size) {}
    public record FileBytes(String name, String contentType, byte[] bytes) {}
}
