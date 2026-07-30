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

                // The two products are siblings, not a hierarchy.
                .whereLayer("lccheck").mayOnlyAccessLayers("harness", "infra")
                .whereLayer("lccheck").mayOnlyBeAccessedByLayers("app")
                .whereLayer("governance").mayOnlyAccessLayers("harness", "infra")
                .whereLayer("governance").mayOnlyBeAccessedByLayers("app")

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
        noClasses()
                .that().resideInAnyPackage(
                        "com.tb.helix.lccheck..",
                        "com.tb.helix.governance..")
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
        noClasses()
                .that().resideInAnyPackage(
                        "com.tb.helix.lccheck..",
                        "com.tb.helix.governance..")
                .should().dependOnClassesThat()
                .areAnnotatedWith(org.springframework.stereotype.Component.class)
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
    @DisplayName("lc-check and governance never reach into each other")
    void businessModulesAreSiblings() {
        noClasses()
                .that().resideInAPackage("com.tb.helix.lccheck..")
                .should().dependOnClassesThat().resideInAPackage("com.tb.helix.governance..")
                .because("lc-check reads the rulebook through a port it declares, so governance "
                        + "can move behind a network boundary without lc-check changing")
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
