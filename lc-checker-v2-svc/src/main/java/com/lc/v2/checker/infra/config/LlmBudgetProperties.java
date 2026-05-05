package com.lc.v2.checker.infra.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Project-level hard cap for the agentic LLM loop. One iteration = one chat
 * completion + (optionally) one round of tool execution. {@code Rule.maxIterations}
 * may override per rule; when null, this default applies.
 */
@ConfigurationProperties(prefix = "app.llm")
public class LlmBudgetProperties {

    private int maxIterations = 3;

    public int getMaxIterations() { return maxIterations; }
    public void setMaxIterations(int maxIterations) { this.maxIterations = maxIterations; }
}
