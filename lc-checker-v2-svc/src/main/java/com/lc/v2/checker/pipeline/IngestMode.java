package com.lc.v2.checker.pipeline;

/** How files arrived in {@link com.lc.v2.checker.pipeline.StageContext}. */
public enum IngestMode {
    /** One lc.txt + one deal-NN.pdf — segmentation splits by page map. */
    DEAL_BUNDLE,
    /** Legacy: multiple PDFs classified by filename. */
    LEGACY_MULTI_FILE
}
