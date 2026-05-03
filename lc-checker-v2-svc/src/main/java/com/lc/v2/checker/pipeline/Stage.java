package com.lc.v2.checker.pipeline;

public interface Stage {
    String name();
    void execute(StageContext ctx);
}
