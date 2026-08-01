// tb-helix-ai-svc — the backend for the TB Helix AI workbench.
//
// One service, two business modules (lc-check, governance), one shared platform.
// The layout is a single Gradle module with package boundaries; ArchUnit makes
// those boundaries a build failure rather than a review note — see
// src/test/java/com/tb/helix/ArchitectureTest.java.
//
// Deliberately absent, and they should stay absent:
//
//   spring-ai-*            One OpenAI-compatible gateway serves text and vision
//                          alike (infra/model). v2 used Spring AI for text and a
//                          RestClient for vision, then bypassed Spring AI's tool
//                          execution anyway — two HTTP stacks for one job.
//   software.amazon.awssdk Blobs live on disk behind core.blob.BlobStore. An S3
//                          adapter is a second implementation of that port, not
//                          a dependency of the service.

plugins {
    java
    id("org.springframework.boot") version "3.5.14"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.tb.helix"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // --- Spring Boot core ---------------------------------------------------
    developmentOnly("org.springframework.boot:spring-boot-devtools")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-aop")

    // --- Persistence: Spring JDBC + Flyway (no JPA) --------------------------
    // Flyway rather than spring.sql.init: v2's schema.sql opens with a
    // DROP VIEW … CASCADE preamble purely to stay idempotent. A migration tool
    // removes the need for that trick.
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    // --- Cache tiers ---------------------------------------------------------
    // L1 Caffeine (bounded — v2's PdfBytesCache was an unbounded ConcurrentHashMap
    // of PDF byte arrays). L2 Redis ships but its bean is conditional and its
    // autoconfiguration is excluded while helix.cache.l2.enabled is false.
    implementation("com.github.ben-manes.caffeine:caffeine")
    implementation("org.springframework.boot:spring-boot-starter-data-redis")

    // --- Documents -----------------------------------------------------------
    // TwelveMonkeys teaches ImageIO to read TIFF, which the JDK cannot do for the
    // CCITT G4 and LZW frames that scanned bank documents actually arrive as.
    // POI reads the Word form a credit sometimes arrives in (pasted SWIFT dump);
    // PDFBox already covers the text-layer PDF case via PDFTextStripper.
    implementation("org.apache.pdfbox:pdfbox:3.0.7")
    implementation("com.twelvemonkeys.imageio:imageio-tiff:3.12.0")
    implementation("org.apache.poi:poi-ooxml:5.4.1")

    // No SWIFT library. A message is split on `:NN[A]:` by SwiftReader — twenty lines of
    // regex — and what the fields *mean* is read by a model, so a parser that models the
    // whole SRU field catalogue would be carried for nothing. pw-swift-core was declared
    // here and never imported.

    // --- Exact rules (SpEL over extracted facts) -----------------------------
    implementation("org.springframework:spring-expression")

    // --- YAML content assets (refs, field pool, doc registry, seeds) ---------
    implementation("org.yaml:snakeyaml")

    // --- Observability (Langfuse via OTLP) ----------------------------------
    implementation("io.micrometer:micrometer-registry-prometheus")
    implementation("net.logstash.logback:logstash-logback-encoder:8.0")
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")

    // --- OpenAPI spec (/v3/api-docs) -----------------------------------------
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:2.8.11")

    // --- Tests ---------------------------------------------------------------
    // ArchUnit is the point of the test source set: the package boundaries this
    // service is organised around are only real if the build enforces them.
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("com.tngtech.archunit:archunit-junit5:1.3.0")
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.add("-parameters")
}

tasks.withType<Test> {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}

tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
    jvmArgs("-Djava.net.preferIPv4Stack=true")
    // Serve prompts (and the rest of resources) from src/, not a stale copy under
    // build/resources. Without this, editing segment-bundle.st leaves the classpath
    // on the old text, promptSha stays put, and the derivation cache keeps hitting.
    sourceResources(sourceSets["main"])
}
