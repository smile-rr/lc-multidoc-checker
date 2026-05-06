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
     * Spring Resource location for the BASE system prompt — persona, UCP/ISBP
     * principles, verdict semantics, output contract. Used by every rule
     * check tier. Accepts {@code classpath:} / {@code file:} / any prefix
     * Spring's {@code ResourceLoader} understands.
     */
    private String checkSystemPrompt = "classpath:prompts/system/check-system-base.st";

    /**
     * Addendum appended to the base prompt for AGENT_TOOL rules — single-round
     * compute-tool policy. Empty string = no addendum.
     */
    private String checkSystemPromptTools = "classpath:prompts/system/check-system-tools.st";

    /**
     * Addendum appended to the base prompt for AGENTIC rules — iteration
     * budget + parallel-tool pacing. Empty string = no addendum.
     */
    private String checkSystemPromptAgentic = "classpath:prompts/system/check-system-agentic.st";

    public int getMaxIterations() { return maxIterations; }
    public void setMaxIterations(int maxIterations) { this.maxIterations = maxIterations; }

    public String getCheckSystemPrompt() { return checkSystemPrompt; }
    public void setCheckSystemPrompt(String checkSystemPrompt) { this.checkSystemPrompt = checkSystemPrompt; }

    public String getCheckSystemPromptTools() { return checkSystemPromptTools; }
    public void setCheckSystemPromptTools(String checkSystemPromptTools) { this.checkSystemPromptTools = checkSystemPromptTools; }

    public String getCheckSystemPromptAgentic() { return checkSystemPromptAgentic; }
    public void setCheckSystemPromptAgentic(String checkSystemPromptAgentic) { this.checkSystemPromptAgentic = checkSystemPromptAgentic; }
}
