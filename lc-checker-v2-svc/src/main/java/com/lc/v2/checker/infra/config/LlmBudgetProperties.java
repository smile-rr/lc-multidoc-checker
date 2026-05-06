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

    /**
     * Spring Resource location for the shared system prompt used by all
     * AGENT/AGENT_TOOL/AGENTIC rule checks. Accepts {@code classpath:},
     * {@code file:}, or any prefix Spring's {@code ResourceLoader} understands —
     * so operators can swap the prompt without rebuilding the jar.
     */
    private String checkSystemPrompt = "classpath:prompts/system/check-system.st";

    public int getMaxIterations() { return maxIterations; }
    public void setMaxIterations(int maxIterations) { this.maxIterations = maxIterations; }

    public String getCheckSystemPrompt() { return checkSystemPrompt; }
    public void setCheckSystemPrompt(String checkSystemPrompt) { this.checkSystemPrompt = checkSystemPrompt; }
}
