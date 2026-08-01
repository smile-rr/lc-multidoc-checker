package com.tb.helix.app;

import com.tb.helix.infra.cost.ModelPrices;

import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The model price book — what spend accounting charges each family.
 *
 * <p>Lives in {@code app} because the book is infrastructure ({@link ModelPrices}) and the
 * console that edits it sits in Governance only as a host. ArchUnit keeps controllers out of
 * {@code infra}, and governance must not name an infra {@code @Component}, so the wire edge
 * sits here. Disposable with the tab if a fuller ops surface replaces it.
 */
@RestController
@RequestMapping("/api/v1/infra/prices")
public class PricesController {

    private static final List<String> TIERS = List.of("none", "economy", "balanced", "frontier");

    private final ModelPrices prices;

    public PricesController(ModelPrices prices) {
        this.prices = prices;
    }

    /** Every family, vendor then family — what the console lists. */
    @GetMapping
    public List<Map<String, Object>> list() {
        return prices.all().stream()
                .sorted(Comparator.comparing(ModelPrices.Price::vendor)
                        .thenComparing(ModelPrices.Price::family))
                .map(PricesController::toWire)
                .toList();
    }

    /** Insert or replace one family. Path and body family must agree. */
    @PutMapping("/{family}")
    public Map<String, Object> save(@PathVariable String family, @RequestBody Map<String, Object> body) {
        String key = family.trim();
        if (key.isEmpty()) throw new IllegalArgumentException("family is required");
        body.put("family", key);
        ModelPrices.Price price = fromWire(body);
        if (!TIERS.contains(price.tier())) {
            throw new IllegalArgumentException("tier must be one of " + TIERS);
        }
        prices.upsert(price);
        return Map.of("family", key, "saved", true);
    }

    @DeleteMapping("/{family}")
    public Map<String, Object> delete(@PathVariable String family) {
        prices.delete(family);
        return Map.of("deleted", family);
    }

    private static Map<String, Object> toWire(ModelPrices.Price p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("family", p.family());
        m.put("label", p.label());
        m.put("vendor", p.vendor());
        m.put("tier", p.tier());
        m.put("inPerMillion", p.in());
        m.put("outPerMillion", p.out());
        m.put("cachedInPerMillion", p.cachedIn());
        m.put("patterns", p.patterns());
        m.put("note", p.note());
        m.put("quotedOn", p.quotedOn() == null ? null : p.quotedOn().toString());
        m.put("bands", p.bands().stream().map(b -> {
            Map<String, Object> band = new LinkedHashMap<>();
            band.put("upToPromptTokens", b.upToPromptTokens());
            band.put("inPerMillion", b.in());
            band.put("outPerMillion", b.out());
            band.put("cachedInPerMillion", b.cachedIn());
            return band;
        }).toList());
        return m;
    }

    @SuppressWarnings("unchecked")
    private static ModelPrices.Price fromWire(Map<String, Object> body) {
        String family = str(body.get("family"));
        String label = str(body.getOrDefault("label", family));
        String vendor = str(body.getOrDefault("vendor", "unknown"));
        String tier = str(body.getOrDefault("tier", "economy"));
        BigDecimal in = decimal(body.get("inPerMillion"));
        BigDecimal out = decimal(body.get("outPerMillion"));
        BigDecimal cached = body.get("cachedInPerMillion") == null || "".equals(body.get("cachedInPerMillion"))
                ? null : decimal(body.get("cachedInPerMillion"));
        List<String> patterns = strings(body.get("patterns"));
        String note = body.get("note") == null || "".equals(body.get("note")) ? null : str(body.get("note"));
        LocalDate quotedOn = parseDate(body.get("quotedOn"));

        List<ModelPrices.Band> bands = new ArrayList<>();
        Object rawBands = body.get("bands");
        if (rawBands instanceof List<?> list) {
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> raw)) continue;
                Map<String, Object> b = (Map<String, Object>) raw;
                if (b.get("upToPromptTokens") == null) continue;
                bands.add(new ModelPrices.Band(
                        ((Number) b.get("upToPromptTokens")).intValue(),
                        decimal(b.get("inPerMillion")),
                        decimal(b.get("outPerMillion")),
                        b.get("cachedInPerMillion") == null || "".equals(b.get("cachedInPerMillion"))
                                ? null : decimal(b.get("cachedInPerMillion"))));
            }
        }
        return new ModelPrices.Price(family, label, vendor, tier, in, out, cached,
                List.copyOf(bands), List.copyOf(patterns), note, quotedOn);
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static BigDecimal decimal(Object o) {
        if (o == null || "".equals(o)) return BigDecimal.ZERO;
        if (o instanceof BigDecimal bd) return bd;
        if (o instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        return new BigDecimal(String.valueOf(o).trim());
    }

    private static List<String> strings(Object o) {
        if (o == null) return List.of();
        if (o instanceof List<?> list) {
            return list.stream().map(v -> String.valueOf(v).trim()).filter(s -> !s.isEmpty()).toList();
        }
        // Comma-separated from a single field.
        return java.util.Arrays.stream(String.valueOf(o).split("[,\\n]"))
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    private static LocalDate parseDate(Object o) {
        if (o == null || "".equals(o)) return LocalDate.now();
        return LocalDate.parse(String.valueOf(o).trim());
    }
}
