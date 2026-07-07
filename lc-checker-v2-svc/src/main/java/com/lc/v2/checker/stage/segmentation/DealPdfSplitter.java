package com.lc.v2.checker.stage.segmentation;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.stereotype.Component;

/**
 * Splits a merged deal PDF into per-segment PDFs by selecting exact 1-based page numbers.
 *
 * <p>Used for the simplified deal-bundle path where Python already emits {@code deal-NN.pdf}
 * and the pipeline should avoid TIFF-specific Java handling.</p>
 */
@Component
public class DealPdfSplitter {

    public byte[] segmentToPdf(byte[] pdfBytes, List<Integer> pageNumbers) throws IOException {
        if (pdfBytes == null || pdfBytes.length == 0) throw new IOException("Deal PDF bytes missing");
        if (pageNumbers == null || pageNumbers.isEmpty()) throw new IOException("Segment pages list is empty");

        try (PDDocument src = Loader.loadPDF(pdfBytes); PDDocument out = new PDDocument()) {
            int total = src.getNumberOfPages();
            for (int pageNum : pageNumbers) {
                if (pageNum < 1 || pageNum > total) {
                    throw new IOException("Page " + pageNum + " out of range (1.." + total + ")");
                }
                PDPage page = src.getPage(pageNum - 1);
                out.addPage(page);
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            out.save(bos);
            return bos.toByteArray();
        }
    }

    public int pageCount(byte[] pdfBytes) throws IOException {
        if (pdfBytes == null || pdfBytes.length == 0) return 0;
        try (PDDocument src = Loader.loadPDF(pdfBytes)) {
            return src.getNumberOfPages();
        }
    }
}

