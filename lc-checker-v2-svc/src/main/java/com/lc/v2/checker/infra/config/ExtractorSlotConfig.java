package com.lc.v2.checker.infra.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Vision LLM slots 1–4 (uniform config, prefix vision-llm.slot-N).
 *
 * <p>Slots fire in parallel; consensus = majority vote; slot-1 wins on tie.
 * No local/cloud naming distinction — provider switch is URL + key only.
 * Source label pattern: {@code <model>_<slotNumber>} (e.g. {@code qwen3-vl:4b-instruct_1}).
 *
 * <p>Defaults: slots 1–2 enabled, slots 3–4 disabled.
 * Override via {@code VISION_N_ENABLED=true|false}.
 */
@Configuration
@ConfigurationProperties(prefix = "vision-llm")
public class ExtractorSlotConfig {

    private ExtractorSlotProperties slot1 = new ExtractorSlotProperties();
    private ExtractorSlotProperties slot2 = new ExtractorSlotProperties();
    private ExtractorSlotProperties slot3 = new ExtractorSlotProperties();
    private ExtractorSlotProperties slot4 = new ExtractorSlotProperties();

    public ExtractorSlotProperties getSlot1() { return slot1; }
    public void setSlot1(ExtractorSlotProperties slot1) { this.slot1 = slot1; }
    public ExtractorSlotProperties getSlot2() { return slot2; }
    public void setSlot2(ExtractorSlotProperties slot2) { this.slot2 = slot2; }
    public ExtractorSlotProperties getSlot3() { return slot3; }
    public void setSlot3(ExtractorSlotProperties slot3) { this.slot3 = slot3; }
    public ExtractorSlotProperties getSlot4() { return slot4; }
    public void setSlot4(ExtractorSlotProperties slot4) { this.slot4 = slot4; }

    /** Ordered list of enabled slots with their slot numbers (1-based). */
    public List<SlotEntry> enabledSlots() {
        List<SlotEntry> result = new ArrayList<>();
        if (slot1.isEnabled()) result.add(new SlotEntry(1, slot1));
        if (slot2.isEnabled()) result.add(new SlotEntry(2, slot2));
        if (slot3.isEnabled()) result.add(new SlotEntry(3, slot3));
        if (slot4.isEnabled()) result.add(new SlotEntry(4, slot4));
        return result;
    }

    /** Slot-1 is the primary; its result wins on consensus tie. */
    public ExtractorSlotProperties primarySlot() { return slot1; }

    public record SlotEntry(int number, ExtractorSlotProperties props) {
        public String sourceName() {
            return props.getModel() + "_" + number;
        }
    }
}
