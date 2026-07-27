package com.lc.gov.api.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

public final class LibraryDtos {

    private LibraryDtos() {}

    /**
     * Step 2 of the PDF import.
     *
     * @param acceptedIndexes candidate indexes to keep — omit or leave empty to
     *                        accept every candidate the splitter proposed
     */
    public record ConfirmImportRequest(
            @NotBlank String bookId,
            @NotBlank String name,
            String edition,
            List<Integer> acceptedIndexes) {}
}
