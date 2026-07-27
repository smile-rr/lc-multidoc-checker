package com.lc.gov.infra.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Binds the {@code governance.*} block of application.yml. */
@ConfigurationProperties(prefix = "governance")
public class GovernanceProperties {

    private Seed seed = new Seed();
    private Library library = new Library();
    private Difference difference = new Difference();

    public Seed getSeed() { return seed; }
    public void setSeed(Seed seed) { this.seed = seed; }
    public Library getLibrary() { return library; }
    public void setLibrary(Library library) { this.library = library; }
    public Difference getDifference() { return difference; }
    public void setDifference(Difference difference) { this.difference = difference; }

    public static class Seed {
        private boolean enabled = true;
        private String fieldPool;
        private String docTypes;
        private List<BookSeed> books = new ArrayList<>();

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getFieldPool() { return fieldPool; }
        public void setFieldPool(String fieldPool) { this.fieldPool = fieldPool; }
        public String getDocTypes() { return docTypes; }
        public void setDocTypes(String docTypes) { this.docTypes = docTypes; }
        public List<BookSeed> getBooks() { return books; }
        public void setBooks(List<BookSeed> books) { this.books = books; }
    }

    public static class BookSeed {
        private String id;
        private String name;
        private String edition;
        private String path;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getEdition() { return edition; }
        public void setEdition(String edition) { this.edition = edition; }
        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }
    }

    public static class Library {
        private int minTotalChars = 200;
        private int minCharsPerPage = 20;
        private int maxPages = 500;
        private int stagedTtlMinutes = 30;

        public int getMinTotalChars() { return minTotalChars; }
        public void setMinTotalChars(int v) { this.minTotalChars = v; }
        public int getMinCharsPerPage() { return minCharsPerPage; }
        public void setMinCharsPerPage(int v) { this.minCharsPerPage = v; }
        public int getMaxPages() { return maxPages; }
        public void setMaxPages(int v) { this.maxPages = v; }
        public int getStagedTtlMinutes() { return stagedTtlMinutes; }
        public void setStagedTtlMinutes(int v) { this.stagedTtlMinutes = v; }
    }

    public static class Difference {
        private double minFieldJaccard = 0.34;
        private int maxCandidatesPerCheck = 8;

        public double getMinFieldJaccard() { return minFieldJaccard; }
        public void setMinFieldJaccard(double v) { this.minFieldJaccard = v; }
        public int getMaxCandidatesPerCheck() { return maxCandidatesPerCheck; }
        public void setMaxCandidatesPerCheck(int v) { this.maxCandidatesPerCheck = v; }
    }
}
