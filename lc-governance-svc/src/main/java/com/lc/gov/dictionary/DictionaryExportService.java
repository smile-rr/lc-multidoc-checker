package com.lc.gov.dictionary;

import com.lc.gov.domain.dictionary.DictField;
import com.lc.gov.domain.dictionary.DocTypeDef;
import com.lc.gov.infra.persistence.DictionaryStore;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

/**
 * Downloads the Dictionary in exactly the shape {@link DictionaryImportService}
 * accepts.
 *
 * <p>This is what makes replace-all workable: the author exports current state,
 * edits it, and uploads it back. Without it the first upload has to be written
 * from scratch and quietly drops whatever was forgotten.
 */
@Service
public class DictionaryExportService {

    private final DictionaryStore dictionary;

    public DictionaryExportService(DictionaryStore dictionary) {
        this.dictionary = dictionary;
    }

    // ── row projection — the single place a domain object becomes a sheet row ──

    private List<String> fieldRow(DictField f) {
        return List.of(
                nz(f.key()), nz(f.nameEn()), nz(f.nameZh()), nz(f.kind()),
                nz(f.valueType()), nz(f.fieldGroup()),
                String.join(", ", f.sourceTags()),
                String.join(", ", f.appliesTo()),
                String.valueOf(f.ruleRelevant()),
                nz(f.description()));
    }

    private List<String> docTypeRow(DocTypeDef d) {
        return List.of(
                nz(d.code()), nz(d.nameEn()), nz(d.nameZh()), nz(d.description()),
                String.valueOf(d.ordinal()));
    }

    // ── XLSX ────────────────────────────────────────────────────────────────

    public byte[] fieldsXlsx() throws IOException {
        List<List<String>> rows = dictionary.listFields().stream().map(this::fieldRow).toList();
        return xlsx("Dictionary fields", SheetSchema.FIELD_COLUMNS, rows);
    }

    public byte[] docTypesXlsx() throws IOException {
        List<List<String>> rows = dictionary.listDocTypes().stream().map(this::docTypeRow).toList();
        return xlsx("Document types", SheetSchema.DOC_TYPE_COLUMNS, rows);
    }

    private byte[] xlsx(String sheetName, List<String> headers, List<List<String>> rows) throws IOException {
        try (XSSFWorkbook workbook = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            Sheet sheet = workbook.createSheet(sheetName);

            Font bold = workbook.createFont();
            bold.setBold(true);
            CellStyle headerStyle = workbook.createCellStyle();
            headerStyle.setFont(bold);

            Row headerRow = sheet.createRow(0);
            for (int c = 0; c < headers.size(); c++) {
                Cell cell = headerRow.createCell(c);
                cell.setCellValue(headers.get(c));
                cell.setCellStyle(headerStyle);
            }

            int r = 1;
            for (List<String> values : rows) {
                Row row = sheet.createRow(r++);
                for (int c = 0; c < values.size(); c++) {
                    // Everything is written as text. An LC field code like "31D"
                    // or a tag list must not be coerced into a number by Excel.
                    row.createCell(c).setCellValue(values.get(c));
                }
            }

            for (int c = 0; c < headers.size(); c++) sheet.autoSizeColumn(c);
            sheet.createFreezePane(0, 1);

            workbook.write(out);
            return out.toByteArray();
        }
    }

    // ── CSV ─────────────────────────────────────────────────────────────────

    public String fieldsCsv() {
        List<List<String>> rows = dictionary.listFields().stream().map(this::fieldRow).toList();
        return csv(SheetSchema.FIELD_COLUMNS, rows);
    }

    public String docTypesCsv() {
        List<List<String>> rows = dictionary.listDocTypes().stream().map(this::docTypeRow).toList();
        return csv(SheetSchema.DOC_TYPE_COLUMNS, rows);
    }

    private String csv(List<String> headers, List<List<String>> rows) {
        List<String> lines = new ArrayList<>(rows.size() + 1);
        lines.add(String.join(",", headers.stream().map(this::quote).toList()));
        for (List<String> values : rows) {
            lines.add(String.join(",", values.stream().map(this::quote).toList()));
        }
        // A leading BOM so Excel on Windows opens UTF-8 without mangling the
        // Chinese name_zh column.
        return "﻿" + String.join("\n", lines) + "\n";
    }

    private String quote(String value) {
        String v = value == null ? "" : value;
        if (v.contains(",") || v.contains("\"") || v.contains("\n")) {
            return '"' + v.replace("\"", "\"\"") + '"';
        }
        return v;
    }

    private static String nz(String v) {
        return v == null ? "" : v;
    }
}
