package com.lc.v2.checker.infra.presets;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties("presets")
public class PresetProperties {
    /** Filesystem dir holding test-case bundle subdirectories. */
    private String dir = "../test/cases";
    /** Maximum number of preset bundles to expose (alphabetical order, top-N). */
    private int maxCount = 3;

    public String getDir() { return dir; }
    public void setDir(String dir) { this.dir = dir; }

    public int getMaxCount() { return maxCount; }
    public void setMaxCount(int maxCount) { this.maxCount = maxCount; }
}
