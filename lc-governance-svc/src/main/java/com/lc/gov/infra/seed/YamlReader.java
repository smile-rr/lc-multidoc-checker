package com.lc.gov.infra.seed;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/**
 * Reads the seed YAML.
 *
 * <p>Owns its own {@link ObjectMapper} rather than publishing one as a bean.
 * A YAML-backed {@code ObjectMapper} bean would satisfy Spring Boot's
 * {@code @ConditionalOnMissingBean} and become the mapper behind
 * {@code MappingJackson2HttpMessageConverter} — every REST response would then
 * serialise as YAML. Keeping it private is the fix.
 */
@Component
public class YamlReader {

    private final ObjectMapper mapper = new ObjectMapper(new YAMLFactory())
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private final ResourceLoader resources;

    public YamlReader(ResourceLoader resources) {
        this.resources = resources;
    }

    /** Reads a classpath or file location into a plain map. */
    public Map<String, Object> readMap(String location) throws IOException {
        Resource resource = resources.getResource(location);
        if (!resource.exists()) throw new IOException("seed file not found: " + location);
        try (InputStream in = resource.getInputStream()) {
            return mapper.readValue(in, new TypeReference<Map<String, Object>>() {});
        }
    }
}
