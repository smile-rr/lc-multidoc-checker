package com.tb.helix;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * The package boundaries, enforced.
 *
 * <p>Three layers, and the middle one is the one that took a second attempt to name:
 *
 * <pre>
 *   infra       bytes, rows, sockets. Blob storage, cache tiers, persistence, streams.
 *               Knows nothing about documents, models or letters of credit.
 *
 *   harness     domain-neutral capability. Convert a document, render a page, route to
 *               a model, run a capped tool loop. Knows about documents and models;
 *               knows nothing about letters of credit. This is the layer another
 *               product could take whole.
 *
 *   lccheck     the product. UCP 600, discrepancies, officers.
 *   governance  the rulebook that product runs on.
 * </pre>
 *
 * <p>Interfaces sit beside their implementations rather than in a separate {@code core}
 * tree. A single-implementation interface filed two directories from its only
 * implementation is the {@code Fluff}/{@code FluffImpl} smell, and the separation was not
 * paying for itself: the rule that actually protects the design is
 * {@link #domainMustNotTouchInfrastructureLibraries()}, which is stated against libraries
 * and works whatever the folders look like.
 *
 * <p>{@link #domainTalksToPortsNotBeans()} is what a flat layout costs and buys back. With
 * {@code BlobStore} and {@code DiskBlobStore} in one package, nothing structural stops a
 * stage reaching for the adapter — so the rule says it directly: domain code may depend on
 * a port, never on a Spring bean.
 *
 * <p>Tests are deliberately thin here. These rules and a clean compile are the whole
 * safety net until the structure settles.
 */
@DisplayName("Package boundaries")
class ArchitectureTest {

    private static JavaClasses classes;

    @BeforeAll
    static void importClasses() {
        classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.tb.helix");
    }

    @Test
    @DisplayName("layers depend only downward")
    void layersDependOnlyDownward() {
        layeredArchitecture()
                .consideringOnlyDependenciesInLayers()
                // A layer whose module is unwritten is not a violation.
                // declaredPackagesExist() stops that becoming a hiding place.
                .withOptionalLayers(true)
                .layer("infra").definedBy("com.tb.helix.infra..")
                .layer("harness").definedBy("com.tb.helix.harness..")
                .layer("lccheck").definedBy("com.tb.helix.lccheck..")
                .layer("governance").definedBy("com.tb.helix.governance..")
                .layer("app").definedBy("com.tb.helix.app..")

                // The floor. Infrastructure has no opinion about what is stored in it.
                .whereLayer("infra").mayNotAccessAnyLayer()

                // Capability. Uses infrastructure; must not learn what a letter of credit is.
                .whereLayer("harness").mayOnlyAccessLayers("infra")

                // Governance is upstream: it authors the rules lc-check runs. Modelling
                // that as two siblings meant a port in one and an adapter in `app`, which
                // dressed a real dependency up as an absent one. lc-check depends on
                // governance — but only on its model, which the rule below pins.
                .whereLayer("governance").mayOnlyAccessLayers("harness", "infra")
                .whereLayer("lccheck").mayOnlyAccessLayers("governance", "harness", "infra")
                .whereLayer("lccheck").mayOnlyBeAccessedByLayers("app")

                .check(classes);
    }

    @Test
    @DisplayName("domain code does not touch infrastructure libraries")
    void domainMustNotTouchInfrastructureLibraries() {
        // The rule the whole layout exists for. Swapping an LLM provider, a cache tier or
        // a blob store must never mean editing a stage, a rule or a controller.
        //
        // harness is absent from the `that()` clause on purpose: it is where PDFBox and
        // the HTTP client legitimately live. That is what makes it the harness.
        // `..persistence..` is exempt, and the exemption is narrow on purpose. The rule
        // protects against a *swappable provider* leaking into domain code — a model, a
        // cache, a blob store. A module's own SQL over its own tables is not that: nobody
        // is going to substitute a different implementation of lc_case, and hiding it
        // behind a port would be the false abstraction this layout was reorganised to
        // avoid. Everything else in the module still cannot see JDBC.
        noClasses()
                .that().resideInAnyPackage(
                        "com.tb.helix.lccheck..",
                        "com.tb.helix.governance..")
                .and().resideOutsideOfPackages(
                        "com.tb.helix.lccheck.persistence..",
                        "com.tb.helix.governance.persistence..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "org.springframework.web.client..",   // RestClient / RestTemplate
                        "org.springframework.jdbc..",         // JdbcTemplate
                        "org.apache.pdfbox..",                // PDF rendering and splitting
                        "com.twelvemonkeys..",                // TIFF decoding
                        "software.amazon.awssdk..",           // object storage
                        "com.github.benmanes.caffeine..",     // L1 cache
                        "org.springframework.data.redis..")   // L2 cache
                .because("a provider swap must be a configuration change, not a code change")
                .allowEmptyShould(true)
                .check(classes);
    }

    @Test
    @DisplayName("domain talks to ports, not to beans")
    void domainTalksToPortsNotBeans() {
        // With interfaces beside their implementations, the folder no longer says which is
        // which — so this does. A @Component in infra or harness is an adapter; domain code
        // depends on the interface it implements and lets wiring choose.
        //
        // The practical payoff: adding a DB blob store touches one package. Nothing in
        // lc-check can have named DiskBlobStore, so nothing in lc-check has to change.
        // Scoped to beans in infra and harness. A module collaborating with its own
        // components is not the problem this guards against — the problem is a stage
        // naming DiskBlobStore or OpenAiCompatGateway, which pins a choice that belongs
        // to configuration. Adding a DB blob store must touch one package, and it does
        // only if nothing in lc-check ever named the disk one.
        noClasses()
                .that().resideInAnyPackage(
                        "com.tb.helix.lccheck..",
                        "com.tb.helix.governance..")
                .should().dependOnClassesThat(
                        com.tngtech.archunit.base.DescribedPredicate.describe(
                                "are @Component beans in infra or harness",
                                (com.tngtech.archunit.core.domain.JavaClass c) ->
                                        (c.getPackageName().startsWith("com.tb.helix.infra")
                                                || c.getPackageName().startsWith("com.tb.helix.harness"))
                                        && c.isAnnotatedWith(org.springframework.stereotype.Component.class)))
                .because("an adapter is chosen by wiring; naming one in domain code pins it")
                .allowEmptyShould(true)
                .check(classes);
    }

    @Test
    @DisplayName("harness stays domain-neutral")
    void harnessStaysDomainNeutral() {
        // The harness is the layer another product could take whole. The moment it learns
        // what a bill of lading is, it stops being that and becomes more of lc-check.
        noClasses()
                .that().resideInAPackage("com.tb.helix.harness..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.tb.helix.lccheck..",
                        "com.tb.helix.governance..")
                .because("segmenting a bundle and routing to a model are not LC-specific ideas")
                .allowEmptyShould(true)
                .check(classes);
    }

    @Test
    @DisplayName("lc-check sees governance's model, not its machinery")
    void lcCheckSeesOnlyTheGovernanceModel() {
        // The dependency is real — an examination runs authored rules — so it is declared
        // rather than hidden behind a port. What is bounded is its width: lc-check reads
        // `governance.domain` and nothing else, so governance can change how it stores or
        // serves a check without an examination noticing, and could move behind a network
        // boundary by reimplementing one interface.
        noClasses()
                .that().resideInAPackage("com.tb.helix.lccheck..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.tb.helix.governance.api..",
                        "com.tb.helix.governance.persistence..",
                        "com.tb.helix.governance.service..",
                        "com.tb.helix.governance.seed..")
                .because("an examination reads the rulebook's model; how it is authored, "
                        + "stored or served is none of its business")
                .allowEmptyShould(true)
                .check(classes);

        noClasses()
                .that().resideInAPackage("com.tb.helix.governance..")
                .should().dependOnClassesThat().resideInAPackage("com.tb.helix.lccheck..")
                .because("governance authors rules; it has no business knowing they get executed")
                .allowEmptyShould(true)
                .check(classes);
    }

    @Test
    @DisplayName("no upward references, even in text")
    void noUpwardReferencesInSource() throws java.io.IOException {
        // ArchUnit reads bytecode, where an unused import has already been discarded — so a
        // governance file can carry `import ...lccheck...` for a javadoc {@link} and every
        // rule above still passes. It is wrong anyway: it tells the next reader that
        // governance knows about examinations, and the day someone uses the symbol the
        // build breaks somewhere that looks unrelated.
        var root = java.nio.file.Path.of("src/main/java/com/tb/helix");
        var offenders = new java.util.ArrayList<String>();
        try (var files = java.nio.file.Files.walk(root.resolve("governance"))) {
            files.filter(f -> f.toString().endsWith(".java")).forEach(f -> {
                try {
                    if (java.nio.file.Files.readString(f).contains("com.tb.helix.lccheck")) {
                        offenders.add(root.relativize(f).toString());
                    }
                } catch (java.io.IOException ignored) {
                }
            });
        }
        org.assertj.core.api.Assertions.assertThat(offenders)
                .as("governance source must not name lc-check anywhere, imports included")
                .isEmpty();
    }

    @Test
    @DisplayName("declared packages exist")
    void declaredPackagesExist() {
        // The counterweight to allowEmptyShould: a rule naming a misspelt package matches
        // nothing and passes. Packages join this list as their milestone lands, so a red
        // build here means "unwritten", which is what it should mean.
        for (String pkg : new String[] {
                "com.tb.helix.infra", "com.tb.helix.harness", "com.tb.helix.app" }) {
            long count = classes.stream().filter(c -> c.getPackageName().startsWith(pkg)).count();
            org.assertj.core.api.Assertions.assertThat(count)
                    .as("package %s holds no classes — either it is unwritten, or the package "
                            + "name in the rules above is misspelt", pkg)
                    .isPositive();
        }
    }

    @Test
    @DisplayName("controllers do not reach past their service")
    void controllersDoNotReachPastTheirService() {
        // A controller decides routes and status codes. The moment it can see the store it
        // starts assembling responses out of database rows, and the wire format quietly
        // becomes the schema — so a column rename turns into a breaking API change.
        //
        // Governance is exempt: it is CRUD over its own tables, and interposing a service
        // that only forwards would be ceremony. lc-check is not, because assembling a case
        // from six tables is real work with a real place to live.
        noClasses()
                .that().resideInAPackage("com.tb.helix.lccheck.api..")
                .should().dependOnClassesThat().resideInAPackage("com.tb.helix.lccheck.persistence..")
                .because("assembling a response from rows belongs in a service, not a controller")
                .allowEmptyShould(true)
                .check(classes);
    }

    @Test
    @DisplayName("controllers live in their module's api package")
    void controllersLiveInApiPackages() {
        noClasses()
                .that().haveSimpleNameEndingWith("Controller")
                .should().resideOutsideOfPackages(
                        "com.tb.helix.lccheck.api..",
                        "com.tb.helix.governance.api..",
                        "com.tb.helix.app..")
                .allowEmptyShould(true)
                .check(classes);
    }
}
