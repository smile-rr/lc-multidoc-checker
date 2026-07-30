package com.tb.helix.core.error;

/**
 * The thing addressed does not exist.
 *
 * <p>Names the kind and the id, because "not found" on its own sends whoever reads the
 * log looking for which of the four ids in the URL was the wrong one.
 */
public class NotFoundException extends HelixException {

    public NotFoundException(String kind, String id) {
        super(kind + " not found: " + id);
    }

    @Override
    public int status() {
        return 404;
    }

    @Override
    public String code() {
        return "not_found";
    }
}
