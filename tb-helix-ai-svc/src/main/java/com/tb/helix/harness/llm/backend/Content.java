package com.tb.helix.harness.llm.backend;

/**
 * One part of what a turn carries.
 *
 * <p>Parts rather than a string plus an attachment list, because <b>the order matters and is
 * ours to decide</b>. A page read sends images first and the instruction last so that the
 * second and third pass over the same pages ride the prefix cache the first paid for. A type
 * that modelled a turn as "text, with images attached" would leave that ordering to whatever
 * assembles the request, which is the one place it must not be decided.
 */
public sealed interface Content {

    /** Words. */
    record Text(String text) implements Content {
    }

    /**
     * An image, in memory.
     *
     * <p>Bytes and a MIME type — never a path. Pages are rendered on demand and never written
     * to disk, so a backend that could only take a {@code File} would mean writing a temporary
     * file per page per call, and there can be twelve of them.
     */
    record Image(String mimeType, byte[] bytes) implements Content {

        public static Image png(byte[] bytes) {
            return new Image("image/png", bytes);
        }
    }
}
