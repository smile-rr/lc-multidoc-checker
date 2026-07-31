package com.tb.helix.infra.cache;

import com.tb.helix.infra.config.CacheProperties;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * L3 on disk — for local testing where opening the answer in an editor beats a SQL console.
 *
 * <pre>
 *   &lt;disk-root&gt;/
 *     &lt;op&gt;/&lt;aa&gt;/&lt;bb&gt;/&lt;cache_key&gt;.json     structured envelope (reloadable)
 *     &lt;op&gt;/&lt;aa&gt;/&lt;bb&gt;/&lt;cache_key&gt;.md       raw model text, when write-md=true
 * </pre>
 *
 * <p>Same contract as {@link PgDerivationStore}: failures degrade to a miss. The layout
 * is created at construction — operators do not pre-mkdir.
 */
@Component
@ConditionalOnProperty(name = "helix.cache.l3.storage", havingValue = "DISK", matchIfMissing = true)
public class DiskDerivationStore implements DerivationStore {

    private static final Logger log = LoggerFactory.getLogger(DiskDerivationStore.class);

    private final ObjectMapper json;
    private final CacheProperties.L3 cfg;
    private final Path root;

    public DiskDerivationStore(ObjectMapper json, CacheProperties props) {
        this.json = json;
        this.cfg = props.l3();
        this.root = Path.of(cfg.diskRoot()).toAbsolutePath().normalize();
        ensureLayout();
        log.info("L3 derivation store: disk at {} (writeMd={})", root, cfg.writeMd());
    }

    private void ensureLayout() {
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot create derivation cache at " + root, e);
        }
    }

    @Override
    public boolean enabled() {
        return cfg.enabled();
    }

    @Override
    public Optional<Row> lookup(String cacheKey) {
        if (!cfg.enabled()) return Optional.empty();
        try {
            Optional<Path> file = findJson(cacheKey);
            if (file.isEmpty()) return Optional.empty();

            ObjectNode node = (ObjectNode) json.readTree(Files.readString(file.get()));
            if (expired(node)) {
                deleteQuietly(file.get());
                deleteQuietly(mdPath(file.get()));
                return Optional.empty();
            }

            int hits = node.path("hitCount").asInt(0) + 1;
            node.put("hitCount", hits);
            node.put("lastHitAt", Instant.now().toString());
            Files.writeString(file.get(), json.writerWithDefaultPrettyPrinter().writeValueAsString(node));

            String resultJson = node.has("result") && !node.get("result").isNull()
                    ? json.writeValueAsString(node.get("result")) : null;
            String blobSha = textOrNull(node, "resultBlobSha");
            var usage = node.path("usage");
            return Optional.of(new Row(resultJson, blobSha, hits,
                    textOrNull(node, "modelId"),
                    usage.has("promptTokens") ? usage.get("promptTokens").asInt() : null,
                    usage.has("completionTokens") ? usage.get("completionTokens").asInt() : null));
        } catch (Exception e) {
            log.warn("L3 disk lookup failed, treating as miss: {}", e.toString());
            return Optional.empty();
        }
    }

    @Override
    public void store(DerivationKey key, Object value, String blobSha,
                      String rawResponse, DerivationCache.Usage usage) {
        if (!cfg.enabled()) return;
        try {
            Path jsonFile = pathFor(key.op(), key.hash());
            Files.createDirectories(jsonFile.getParent());

            Duration ttl = cfg.ttlFor(key.op());
            Instant expires = (ttl == null || ttl.isZero() || ttl.isNegative())
                    ? null : Instant.now().plus(ttl);

            ObjectNode node = json.createObjectNode();
            node.put("cacheKey", key.hash());
            node.put("op", key.op());
            node.put("opVersion", key.opVersion());
            node.put("inputSha", key.inputSha());
            if (key.inputScope() != null) node.put("inputScope", key.inputScope());
            if (key.promptSha() != null) node.put("promptSha", key.promptSha());
            String modelId = usage != null && usage.modelId() != null ? usage.modelId() : key.modelId();
            if (modelId != null) node.put("modelId", modelId);
            if (key.providerUrl() != null) node.put("providerUrl", key.providerUrl());
            node.set("params", json.valueToTree(key.params()));
            node.set("result", value == null ? null : json.valueToTree(value));
            if (blobSha != null) node.put("resultBlobSha", blobSha);
            // Prose goes to the .md and a pointer stays here; JSON stays here and gets no
            // .md at all. Writing the raw response to both was two copies of the same text
            // in two files, and an .md holding a JSON object is a file nobody can read that
            // nobody needed. One body, one home.
            boolean asMarkdown = cfg.writeMd() && isProse(rawResponse);
            if (rawResponse != null && !asMarkdown) node.put("rawResponse", rawResponse);
            if (asMarkdown) node.put("rawResponseFile", key.hash() + ".md");
            if (usage != null) {
                ObjectNode u = node.putObject("usage");
                if (usage.promptTokens() != null) u.put("promptTokens", usage.promptTokens());
                if (usage.completionTokens() != null) u.put("completionTokens", usage.completionTokens());
                if (usage.totalTokens() != null) u.put("totalTokens", usage.totalTokens());
                if (usage.latencyMs() != null) u.put("latencyMs", usage.latencyMs());
            }
            node.put("hitCount", 0);
            node.put("createdAt", Instant.now().toString());
            if (expires != null) node.put("expiresAt", expires.toString());

            Files.writeString(jsonFile, json.writerWithDefaultPrettyPrinter().writeValueAsString(node));

            if (asMarkdown) {
                Path md = mdPath(jsonFile);
                String body = """
                        ---
                        op: %s
                        cacheKey: %s
                        modelId: %s
                        ---

                        %s
                        """.formatted(
                        key.op(),
                        key.hash(),
                        modelId == null ? "" : modelId,
                        rawResponse);
                Files.writeString(md, body);
            }
        } catch (Exception e) {
            log.warn("L3 disk write failed for {} ({}), continuing: {}", key.op(), key.hash(), e.toString());
        }
    }

    @Override
    public <T> Optional<T> decode(String resultJson, Class<T> type) {
        if (resultJson == null) return Optional.empty();
        try {
            return Optional.ofNullable(json.readValue(resultJson, type));
        } catch (Exception e) {
            log.warn("L3 disk entry no longer decodes to {} — treating as miss. Bump the op version. {}",
                    type.getSimpleName(), e.toString());
            return Optional.empty();
        }
    }

    @Override
    public int purgeExpired() {
        if (!Files.isDirectory(root)) return 0;
        int removed = 0;
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path p : walk.filter(f -> f.toString().endsWith(".json")).toList()) {
                try {
                    JsonNode node = json.readTree(Files.readString(p));
                    if (expired(node)) {
                        deleteQuietly(p);
                        deleteQuietly(mdPath(p));
                        removed++;
                    }
                } catch (Exception e) {
                    log.debug("skip purge {}: {}", p, e.toString());
                }
            }
        } catch (IOException e) {
            log.warn("L3 disk purge failed: {}", e.toString());
        }
        return removed;
    }

    // --- paths -------------------------------------------------------------

    /**
     * Fanout by cache key prefix so one op directory does not grow without bound.
     * Lookup without knowing the op walks the tree once for that key's leaf name —
     * fine for local; system testing should use DB.
     */
    private Path pathFor(String op, String cacheKey) {
        String safeOp = op.replaceAll("[^a-zA-Z0-9._-]", "_");
        return root.resolve(safeOp)
                .resolve(cacheKey.substring(0, 2))
                .resolve(cacheKey.substring(2, 4))
                .resolve(cacheKey + ".json");
    }

    private Optional<Path> findJson(String cacheKey) throws IOException {
        if (cacheKey == null || cacheKey.length() < 4) return Optional.empty();
        String leaf = cacheKey + ".json";
        String a = cacheKey.substring(0, 2);
        String b = cacheKey.substring(2, 4);
        if (!Files.isDirectory(root)) return Optional.empty();
        try (Stream<Path> ops = Files.list(root)) {
            for (Path opDir : ops.filter(Files::isDirectory).toList()) {
                Path candidate = opDir.resolve(a).resolve(b).resolve(leaf);
                if (Files.isRegularFile(candidate)) return Optional.of(candidate);
            }
        }
        return Optional.empty();
    }

    /**
     * Whether a response is prose rather than a JSON payload.
     *
     * <p>A structured answer is already in the {@code .json} in a form that can be queried;
     * copying it into a {@code .md} produces a markdown file containing a JSON object, which
     * serves no reader. Markdown earns its own file precisely because JSON is the wrong
     * container for it — escaped newlines, unreadable without decoding, twice the size.
     */
    private static boolean isProse(String raw) {
        if (raw == null || raw.isBlank()) return false;
        char first = raw.strip().charAt(0);
        return first != '{' && first != '[';
    }

    private static Path mdPath(Path jsonFile) {
        String name = jsonFile.getFileName().toString();
        String base = name.endsWith(".json") ? name.substring(0, name.length() - 5) : name;
        return jsonFile.resolveSibling(base + ".md");
    }

    private static boolean expired(JsonNode node) {
        String expires = textOrNull(node, "expiresAt");
        if (expires == null || expires.isBlank()) return false;
        try {
            return Instant.parse(expires).isBefore(Instant.now());
        } catch (Exception e) {
            return false;
        }
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode n = node.get(field);
        return n == null || n.isNull() ? null : n.asText();
    }

    private static void deleteQuietly(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignored) {
            // purge / expiry cleanup must not fail a lookup
        }
    }
}
