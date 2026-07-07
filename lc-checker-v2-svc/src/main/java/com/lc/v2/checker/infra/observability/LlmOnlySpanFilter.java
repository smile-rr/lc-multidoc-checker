package com.lc.v2.checker.infra.observability;

import io.micrometer.tracing.exporter.FinishedSpan;
import io.micrometer.tracing.exporter.SpanExportingPredicate;
import com.lc.v2.checker.pipeline.PipelineStageId;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Drops every span before OTLP export except:
 *   - session / parse / examine / vision.generate (manual spans we own)
 *   - any span carrying a {@code gen_ai.*} attribute (Spring AI ChatClient observations)
 *
 * Result: Langfuse only sees session-grouped LLM activity. HTTP-server, JDBC, MinIO,
 * RestClient and SSE spans are silently dropped without disabling Spring AI's
 * auto-instrumentation.
 */
@Component
public class LlmOnlySpanFilter implements SpanExportingPredicate {

    private static final Set<String> ALLOWED_NAMES = Set.of(
            PipelineStageId.PARSE.id(),
            PipelineStageId.COMPLIANCE_CHECK.id());

    @Override
    public boolean isExportable(FinishedSpan span) {
        String name = span.getName();
        if (name != null) {
            if (ALLOWED_NAMES.contains(name)) return true;
            if (name.startsWith("lc-session-")) return true;
            if (name.startsWith("vision.generate")) return true;
            if (name.startsWith("rule.")) return true;
        }
        if (span.getTags() != null) {
            for (String key : span.getTags().keySet()) {
                if (key != null && key.startsWith("gen_ai.")) return true;
            }
        }
        return false;
    }
}
