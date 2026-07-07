package com.lc.v2.checker.stage.segmentation;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Splits a multi-page deal TIFF into per-segment PDFs for the vision parse path.
 */
@Component
public class DealTiffSplitter {

    private static final Logger log = LoggerFactory.getLogger(DealTiffSplitter.class);

    /** Extract exact 1-based page numbers from a deal TIFF as a single PDF. */
    public byte[] segmentToPdf(byte[] tiffBytes, List<Integer> pageNumbers) throws IOException {
        if (pageNumbers == null || pageNumbers.isEmpty()) {
            throw new IOException("Segment pages list is empty");
        }
        List<BufferedImage> pages = readTiffPages(tiffBytes);
        if (pages.isEmpty()) throw new IOException("Deal TIFF has no pages");

        try (PDDocument doc = new PDDocument()) {
            for (int pageNum : pageNumbers) {
                int idx = pageNum - 1;
                if (idx < 0 || idx >= pages.size()) {
                    throw new IOException("Page " + pageNum + " out of range (1.." + pages.size() + ")");
                }
                BufferedImage img = pages.get(idx);
                PDPage page = new PDPage(new PDRectangle(img.getWidth(), img.getHeight()));
                doc.addPage(page);
                PDImageXObject ximg = LosslessFactory.createFromImage(doc, img);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(ximg, 0, 0, img.getWidth(), img.getHeight());
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    public int pageCount(byte[] tiffBytes) throws IOException {
        return readTiffPages(tiffBytes).size();
    }

    private List<BufferedImage> readTiffPages(byte[] tiffBytes) throws IOException {
        List<BufferedImage> out = new ArrayList<>();
        try (ImageInputStream iis = ImageIO.createImageInputStream(new java.io.ByteArrayInputStream(tiffBytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) {
                throw new IOException("No TIFF ImageReader available — check imageio-tiff dependency");
            }
            ImageReader reader = readers.next();
            reader.setInput(iis);
            int count = reader.getNumImages(true);
            for (int i = 0; i < count; i++) {
                out.add(reader.read(i));
            }
            reader.dispose();
        }
        return out;
    }
}
