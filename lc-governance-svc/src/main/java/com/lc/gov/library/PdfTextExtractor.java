package com.lc.gov.library;

import com.lc.gov.infra.config.GovernanceProperties;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

/**
 * Pulls text out of a rulebook PDF, and refuses the ones that have none.
 *
 * <p>Text extraction only — no rendering, no rasterising, no OCR. A scanned
 * rulebook is rejected rather than imported as a book of empty articles, because
 * an article with no body is a citation target that silently resolves to
 * nothing.
 */
@Component
public class PdfTextExtractor {

    private final GovernanceProperties props;

    public PdfTextExtractor(GovernanceProperties props) {
        this.props = props;
    }

    /** One page's text and where it starts in the concatenated document. */
    public record PageText(int page, String text, int charCount, int offset) {}

    public record ExtractedPdf(
            int pageCount,
            int totalChars,
            int emptyPages,
            String fullText,
            List<PageText> pages) {

        /** Maps a character offset in {@link #fullText} back to a page number. */
        public int pageAt(int offset) {
            int page = 1;
            for (PageText p : pages) {
                if (offset >= p.offset()) page = p.page();
                else break;
            }
            return page;
        }
    }

    public ExtractedPdf extract(String filename, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new PdfRejectedException("the uploaded file is empty");
        }
        // Trust the bytes, not the extension.
        if (!(bytes.length > 4 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F')) {
            throw new PdfRejectedException(
                    "'" + filename + "' is not a PDF — upload a text-based PDF rulebook");
        }

        try (PDDocument document = Loader.loadPDF(bytes)) {
            int pageCount = document.getNumberOfPages();
            if (pageCount == 0) throw new PdfRejectedException("the PDF has no pages");
            if (pageCount > props.getLibrary().getMaxPages()) {
                throw new PdfRejectedException("the PDF has " + pageCount + " pages; the limit is "
                        + props.getLibrary().getMaxPages());
            }

            StringBuilder full = new StringBuilder();
            List<PageText> pages = new ArrayList<>(pageCount);
            int emptyPages = 0;

            for (int p = 1; p <= pageCount; p++) {
                PDFTextStripper stripper = new PDFTextStripper();
                stripper.setStartPage(p);
                stripper.setEndPage(p);
                String text = stripper.getText(document);
                String trimmed = text == null ? "" : text.strip();
                if (trimmed.isEmpty()) emptyPages++;

                pages.add(new PageText(p, text == null ? "" : text, trimmed.length(), full.length()));
                full.append(text == null ? "" : text).append('\n');
            }

            int totalChars = pages.stream().mapToInt(PageText::charCount).sum();
            reject(pageCount, totalChars, emptyPages);

            return new ExtractedPdf(pageCount, totalChars, emptyPages, full.toString(), pages);

        } catch (InvalidPasswordException e) {
            throw new PdfRejectedException("the PDF is password-protected — remove the protection and retry");
        } catch (IOException e) {
            throw new PdfRejectedException("the PDF could not be read: " + e.getMessage());
        }
    }

    /**
     * The scan test. Both floors matter: a short handbook can pass the per-page
     * average while carrying almost nothing, and a long scan with a text cover
     * page can pass the total while being unusable.
     */
    private void reject(int pageCount, int totalChars, int emptyPages) {
        GovernanceProperties.Library cfg = props.getLibrary();
        String scanned = "No extractable text — this looks like a scanned or image-only PDF. "
                + "OCR is out of scope; upload a text-based PDF.";

        if (totalChars < cfg.getMinTotalChars()) {
            throw new PdfRejectedException(scanned + " (found " + totalChars + " characters across "
                    + pageCount + " page(s); the minimum is " + cfg.getMinTotalChars() + ")");
        }
        int perPage = totalChars / pageCount;
        if (perPage < cfg.getMinCharsPerPage()) {
            throw new PdfRejectedException(scanned + " (averaging " + perPage + " characters per page across "
                    + pageCount + " pages, with " + emptyPages + " page(s) carrying no text at all; "
                    + "the minimum is " + cfg.getMinCharsPerPage() + " per page)");
        }
    }
}
