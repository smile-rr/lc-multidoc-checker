package com.tb.helix.harness.doc;

import com.tb.helix.infra.error.DocumentException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Plain text, text-layer PDF and Word ({@code .docx}).
 *
 * <p>Detection prefers magic bytes over the filename. A PDF with almost no extractable
 * characters becomes {@link CreditMaterial.ScannedPdf} rather than an error — intake will
 * read the pages with vision. Legacy {@code .doc} (OLE) is still refused.
 */
@Component
public class MultiFormatCreditTextExtractor implements CreditTextExtractor {

    /** Below this, a PDF is treated as a scan. A real MT700 dump is far longer. */
    private static final int MIN_PDF_CHARS = 40;

    private static final byte[] PDF_MAGIC = {'%', 'P', 'D', 'F'};
    private static final byte[] ZIP_MAGIC = {'P', 'K'};
    private static final byte[] OLE_MAGIC = {
            (byte) 0xD0, (byte) 0xCF, (byte) 0x11, (byte) 0xE0
    };

    @Override
    public CreditMaterial materialize(byte[] bytes, String fileName) {
        if (bytes == null || bytes.length == 0) {
            throw new DocumentException("The credit file is empty.");
        }

        String name = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        return switch (detect(bytes, name)) {
            case TEXT -> new CreditMaterial.PlainText(asText(bytes));
            case PDF -> fromPdf(bytes);
            case DOCX -> new CreditMaterial.PlainText(fromDocx(bytes));
            case DOC -> throw new DocumentException(
                    "Legacy .doc is not supported. Save the credit as .docx, .pdf or .txt and upload again.");
            case UNKNOWN -> throw new DocumentException(
                    "Unsupported credit format. Upload a .txt, .swift, .pdf or .docx.");
        };
    }

    private Kind detect(byte[] bytes, String name) {
        if (startsWith(bytes, PDF_MAGIC) || name.endsWith(".pdf")) {
            return Kind.PDF;
        }
        if (startsWith(bytes, OLE_MAGIC)) {
            return Kind.DOC;
        }
        if (startsWith(bytes, ZIP_MAGIC) || name.endsWith(".docx")) {
            return Kind.DOCX;
        }
        if (name.endsWith(".doc")) {
            return Kind.DOC;
        }
        if (name.endsWith(".txt") || name.endsWith(".swift") || name.isEmpty()
                || name.endsWith(".mt700") || name.endsWith(".mt")) {
            return Kind.TEXT;
        }
        if (!looksBinary(bytes)) {
            return Kind.TEXT;
        }
        return Kind.UNKNOWN;
    }

    private String asText(byte[] bytes) {
        int offset = 0;
        if (bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xEF
                && (bytes[1] & 0xFF) == 0xBB
                && (bytes[2] & 0xFF) == 0xBF) {
            offset = 3;
        }
        String text = new String(bytes, offset, bytes.length - offset, StandardCharsets.UTF_8);
        if (text.isBlank()) {
            throw new DocumentException("The credit file has no text.");
        }
        return text;
    }

    private CreditMaterial fromPdf(byte[] bytes) {
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            if (doc.getNumberOfPages() == 0) {
                throw new DocumentException("This PDF has no pages.");
            }
            String text = new PDFTextStripper().getText(doc);
            if (text == null || text.strip().length() < MIN_PDF_CHARS) {
                return new CreditMaterial.ScannedPdf();
            }
            return new CreditMaterial.PlainText(text);
        } catch (DocumentException e) {
            throw e;
        } catch (IOException e) {
            throw new DocumentException("Could not read the credit PDF.", e);
        }
    }

    private String fromDocx(byte[] bytes) {
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            StringBuilder out = new StringBuilder();
            for (XWPFParagraph p : doc.getParagraphs()) {
                String line = p.getText();
                if (line != null && !line.isEmpty()) {
                    if (!out.isEmpty()) out.append('\n');
                    out.append(line);
                }
            }
            String text = out.toString();
            if (text.isBlank()) {
                throw new DocumentException("This Word file has no extractable text.");
            }
            return text;
        } catch (DocumentException e) {
            throw e;
        } catch (IOException e) {
            throw new DocumentException(
                    "Could not read the Word file. If this is a legacy .doc, "
                            + "save it as .docx and upload again.",
                    e);
        }
    }

    private static boolean startsWith(byte[] bytes, byte[] magic) {
        if (bytes.length < magic.length) return false;
        for (int i = 0; i < magic.length; i++) {
            if (bytes[i] != magic[i]) return false;
        }
        return true;
    }

    private static boolean looksBinary(byte[] bytes) {
        int n = Math.min(bytes.length, 512);
        int control = 0;
        for (int i = 0; i < n; i++) {
            int b = bytes[i] & 0xFF;
            if (b < 0x09 || (b > 0x0D && b < 0x20) || b == 0x7F) control++;
        }
        return control > n / 8;
    }

    private enum Kind { TEXT, PDF, DOCX, DOC, UNKNOWN }
}
