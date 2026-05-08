package com.lc.v2.checker.domain.common;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Optional bounding box for a field value or off-schema item.
 * All fields nullable — not every vision provider returns coordinates.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record BBox(Integer x, Integer y, Integer w, Integer h) {
    public static BBox of(int x, int y, int w, int h) {
        return new BBox(x, y, w, h);
    }
}
