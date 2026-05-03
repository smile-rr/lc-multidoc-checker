package com.lc.v2.checker.infra.config;

/**
 * Config for one vision LLM slot (slot-1 through slot-4).
 * Populated via nested YAML properties: vision-llm.slot-N.{field}.
 */
public class ExtractorSlotProperties {

    private boolean enabled = false;
    private String baseUrl = "http://localhost:11434/v1";
    private String apiKey = "";
    private String model = "qwen3-vl:4b-instruct";
    private int renderDpi = 200;
    private int maxPages = 10;
    private int maxLongEdgePx = 2048;
    private int timeoutSeconds = 120;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public int getRenderDpi() { return renderDpi; }
    public void setRenderDpi(int renderDpi) { this.renderDpi = renderDpi; }
    public int getMaxPages() { return maxPages; }
    public void setMaxPages(int maxPages) { this.maxPages = maxPages; }
    public int getMaxLongEdgePx() { return maxLongEdgePx; }
    public void setMaxLongEdgePx(int maxLongEdgePx) { this.maxLongEdgePx = maxLongEdgePx; }
    public int getTimeoutSeconds() { return timeoutSeconds; }
    public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
}
