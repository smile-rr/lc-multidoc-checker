package com.lc.gov.dictionary;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

/**
 * Reads an uploaded CSV or XLSX into rows keyed by normalised header.
 *
 * <p>Headers are matched case- and punctuation-insensitively, so {@code "Name EN"},
 * {@code name-en} and {@code name_en} are the same column, and column order does
 * not matter. Unknown columns are carried through and ignored rather than
 * rejected — a sheet exported from someone else's system usually has extras.
 */
@Component
public class SheetParser {

    /** A single data row. {@code number} is 1-based and counts the header, so it
     *  matches what the author sees in Excel. */
    public record SheetRow(int number, Map<String, String> values) {

        public String get(String column) {
            String v = values.get(column);
            return v == null || v.isBlank() ? null : v.trim();
        }

        public String require(String column) {
            String v = get(column);
            if (v == null) throw new IllegalArgumentException("missing " + column);
            return v;
        }

        /** Multi-value cell: {@code "INV, BOL; PKL"} → three entries. */
        public List<String> list(String column) {
            String v = get(column);
            if (v == null) return List.of();
            List<String> out = new ArrayList<>();
            for (String part : v.split("[,;|]")) {
                String s = part.trim();
                if (!s.isEmpty()) out.add(s);
            }
            return out;
        }

        /** Tolerant boolean: true/yes/y/1 are true, false/no/n/0 are false. */
        public boolean bool(String column, boolean fallback) {
            String v = get(column);
            if (v == null) return fallback;
            return switch (v.toLowerCase()) {
                case "true", "yes", "y", "1", "t" -> true;
                case "false", "no", "n", "0", "f" -> false;
                default -> fallback;
            };
        }

        public Integer integer(String column) {
            String v = get(column);
            if (v == null) return null;
            try {
                return (int) Double.parseDouble(v);
            } catch (NumberFormatException e) {
                return null;
            }
        }
    }

    public List<SheetRow> parse(String filename, InputStream in) throws IOException {
        String lower = filename == null ? "" : filename.toLowerCase();
        if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return parseXlsx(in);
        if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(in);
        throw new IllegalArgumentException(
                "unsupported file type: " + filename + " — upload .csv or .xlsx");
    }

    // ── CSV ─────────────────────────────────────────────────────────────────

    private List<SheetRow> parseCsv(InputStream in) throws IOException {
        List<SheetRow> rows = new ArrayList<>();
        // BOM-tolerant: Excel writes UTF-8 CSV with a byte-order mark, which
        // would otherwise become part of the first header name.
        Reader reader = new InputStreamReader(new BomStrippingStream(in), StandardCharsets.UTF_8);
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setHeader()
                .setSkipHeaderRecord(true)
                .setIgnoreEmptyLines(true)
                .setTrim(true)
                .get();
        try (CSVParser parser = CSVParser.parse(reader, format)) {
            List<String> headers = parser.getHeaderNames().stream().map(SheetParser::normalise).toList();
            int n = 1;
            for (CSVRecord record : parser) {
                n++;
                Map<String, String> values = new LinkedHashMap<>();
                for (int i = 0; i < headers.size() && i < record.size(); i++) {
                    values.put(headers.get(i), record.get(i));
                }
                if (values.values().stream().allMatch(v -> v == null || v.isBlank())) continue;
                rows.add(new SheetRow(n, values));
            }
        }
        return rows;
    }

    /** Strips a UTF-8 BOM if present, passing everything else through. */
    private static final class BomStrippingStream extends InputStream {
        private final InputStream delegate;
        private boolean checked = false;
        private int[] buffer = new int[0];
        private int pos = 0;

        BomStrippingStream(InputStream delegate) { this.delegate = delegate; }

        @Override
        public int read() throws IOException {
            if (!checked) {
                checked = true;
                int a = delegate.read();
                if (a == 0xEF) {
                    int b = delegate.read(), c = delegate.read();
                    if (b == 0xBB && c == 0xBF) return delegate.read();
                    buffer = new int[] {b, c};
                    pos = 0;
                    return a;
                }
                return a;
            }
            if (pos < buffer.length) return buffer[pos++];
            return delegate.read();
        }
    }

    // ── XLSX ────────────────────────────────────────────────────────────────

    private List<SheetRow> parseXlsx(InputStream in) throws IOException {
        List<SheetRow> rows = new ArrayList<>();
        try (Workbook workbook = new XSSFWorkbook(in)) {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null) return rows;

            Row headerRow = sheet.getRow(sheet.getFirstRowNum());
            if (headerRow == null) throw new IllegalArgumentException("the sheet has no header row");

            // DataFormatter renders what Excel shows, so an ordinal typed as a
            // number does not arrive as "3.0".
            DataFormatter formatter = new DataFormatter();
            List<String> headers = new ArrayList<>();
            for (int c = 0; c < headerRow.getLastCellNum(); c++) {
                Cell cell = headerRow.getCell(c);
                headers.add(normalise(cell == null ? "" : formatter.formatCellValue(cell)));
            }

            for (int r = sheet.getFirstRowNum() + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                Map<String, String> values = new LinkedHashMap<>();
                boolean empty = true;
                for (int c = 0; c < headers.size(); c++) {
                    String header = headers.get(c);
                    if (header.isEmpty()) continue;
                    Cell cell = row.getCell(c);
                    String value = cell == null ? "" : formatter.formatCellValue(cell).trim();
                    if (!value.isEmpty()) empty = false;
                    values.put(header, value);
                }
                if (empty) continue;
                rows.add(new SheetRow(r + 1, values));
            }
        }
        return rows;
    }

    /** {@code "Rule Relevant?"} → {@code rule_relevant}. */
    private static String normalise(String header) {
        if (header == null) return "";
        return header.trim().toLowerCase()
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_|_$", "");
    }
}
