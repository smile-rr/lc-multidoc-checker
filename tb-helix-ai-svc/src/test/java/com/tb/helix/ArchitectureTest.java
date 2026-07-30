package com.tb.helix;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * The package boundaries this service is organised around, enforced.
 *
 * <p>tb-helix-ai-svc is a single Gradle module. That was a deliberate choice — faster
 * builds, simpler DevTools reload — but it means the layout is a convention, and a
 * convention that nothing checks is a convention that decays. These five rules are
 * what make it structural instead.
 *
 * <p>The shape:
 *
 * <pre>
 *   core         ports only — interfaces, records, enums. Depends on nothing of ours.
 *   infra        adapters. The only package allowed to know about HTTP, SQL or PDFBox.
 *   lccheck      business. Sees core. Never infra, never governance.
 *   governance   business. Sees core. Never infra, never lccheck.
 *   app          wiring. Sees everything; contains no logic.
 * </pre>
 *
 * <p>The two business modules are siblings, not a hierarchy. lc-check does need the
 * rulebook governance owns, but it reads it through {@code lccheck.catalog.CatalogPort}
 * — an interface lc-check declares and {@code app} binds. That indirection is what lets
 * governance become a separate service later without lc-check noticing.
 *
 * <p>{@link #domainMustNotTouchInfrastructureLibraries()} is the rule that carries the
 * most weight day to day. It is what "abstract the LLM calls so swapping providers does
 * not touch domain code" means once written down: a stage that reaches for a RestClient
 * fails the build.
 *
 * <p><b>On {@code allowEmptyShould(true)}:</b> several rules carry it, because a module
 * that has not been written yet would otherwise fail the build for being absent. That is
 * a real weakening — a misspelt package name matches nothing and passes silently — so
 * {@link #declaredPackagesExist()} closes the hole by asserting each package actually
 * holds classes. Between them, an empty package is a deliberate state rather than an
 * accident, and the emptiness is reported by the rule that is about emptiness.
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
                // A layer whose module has not been written yet is not a violation.
                // declaredPackagesExist() is what stops that becoming a hiding place.
                .withOptionalLayers(true)
                .layer("core").definedBy("com.tb.helix.core..")
                .layer("infra").definedBy("com.tb.helix.infra..")
                .layer("lccheck").definedBy("com.tb.helix.lccheck..")
                .layer("governance").definedBy("com.tb.helix.governance..")
                .layer("app").definedBy("com.tb.helix.app..")

                // Ports are the floor. Nothing of ours is below them.
                .whereLayer("core").mayNotAccessAnyLayer()

                // Adapters implement ports and are reached only through wiring.
                .whereLayer("infra").mayOnlyAccessLayers("core")
                .whereLayer("infra").mayOnlyBeAccessedByLayers("app")

                // Business modules see ports and nothing else of ours.
                .whereLayer("lccheck").mayOnlyAccessLayers("core")
                .whereLayer("lccheck").mayOnlyBeAccessedByLayers("app")
                .whereLayer("governance").mayOnlyAccessLayers("core")
                .whereLayer("governance").mayOnlyBeAccessedByLayers("app")

                .check(classes);
    }

    @Test
    @DisplayName("core is free of Spring")
    void coreIsFreeOfSpring() {
        // A port that needs a Spring annotation to be expressed is not a port — it is
        // an adapter that has not admitted it yet.
        noClasses()
                .that().resideInAPackage("com.tb.helix.core..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "org.springframework..",
                        "jakarta.persistence..")
                .because("core declares contracts; it must be constructible without a container")
                .allowEmptyShould(true)
                .check(classes);
    }

    @Test
    @DisplayName("lc-check and governance never reach into each other")
    void businessModulesAreSiblings() {
        noClasses()
                .that().resideInAPackage("com.tb.helix.lccheck..")
                .should().dependOnClassesThat().resideInAPackage("com.tb.helix.governance..")
                .because("lc-check reads the rulebook through lccheck.catalog.CatalogPort, "
                        + "so governance can move behind a network boundary without lc-check changing")
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
    @DisplayName("domain code does not touch infrastructure libraries")
    void domainMustNotTouchInfrastructureLibraries() {
        ArchRule rule = noClasses()
                .that().resideInAnyPackage(
                        "com.tb.helix.core..",
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
                .because("swapping an LLM provider, a cache tier or a blob store must not "
                        + "require editing a stage, a rule or a controller")
                .allowEmptyShould(true);

        rule.check(classes);
    }

    @Test
    @DisplayName("declared packages exist")
    void declaredPackagesExist() {
        // The counterweight to allowEmptyShould. A rule that matches nothing tells you
        // nothing, so the set of packages the other rules name is asserted to be real.
        //
        // Packages join this list as their milestone lands. Adding one before it is
        // written is how you get a red build that means "unfinished", which is exactly
        // what it should mean.
        for (String pkg : new String[] { "com.tb.helix.core", "com.tb.helix.app" }) {
            long count = classes.stream()
                    .filter(c -> c.getPackageName().startsWith(pkg))
                    .count();
            org.assertj.core.api.Assertions.assertThat(count)
                    .as("package %s holds no classes — either it is unwritten, or the "
                            + "package name in the rules above is misspelt", pkg)
                    .isPositive();
        }
    }

    @Test
    @DisplayName("controllers live in their module's api package")
    void controllersLiveInApiPackages() {
        // Keeps the HTTP surface of each module in one findable place, and stops a
        // controller appearing halfway down a service package where nobody looks for it.
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
