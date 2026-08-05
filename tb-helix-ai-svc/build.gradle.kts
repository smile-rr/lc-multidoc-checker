// tb-helix-ai-svc — the backend for the TB Helix AI workbench.
//
// One service, two business modules (lc-check, governance), one shared platform.
// The layout is a single Gradle module with package boundaries; ArchUnit makes
// those boundaries a build failure rather than a review note — see
// src/test/java/com/tb/helix/ArchitectureTest.java.
//
// Deliberately absent, and they should stay absent:
//
//   software.amazon.awssdk Blobs live on disk behind core.blob.BlobStore. An S3
//                          adapter is a second implementation of that port, not
//                          a dependency of the service.
//
// `spring-ai-*` was on that list and is not any more. The old entry read: "One
// OpenAI-compatible gateway serves text and vision alike. v2 used Spring AI for text and
// a RestClient for vision, then bypassed Spring AI's tool execution anyway — two HTTP
// stacks for one job." Every word of that is still true of v2, and none of it is an
// argument against where Spring AI sits now: below ModelBackend, as one backend among
// others, running no loop of its own. See the dependency block for the full reasoning.

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

    // --- A second model backend, behind harness.llm.backend.ModelBackend -----
    //
    // This is the one dependency in the file whose absence used to be a stated design
    // decision, so the reversal is worth writing down.
    //
    // What changed is not the argument — one /chat/completions adapter really does serve
    // every OpenAI-shaped provider, and it still does; ChatCompletionsBackend stays and
    // still answers every configured role. What changed is the providers worth reaching.
    // Anthropic, Bedrock and Vertex are not OpenAI-shaped, and writing a wire adapter per
    // vendor means chasing each one's JSON field names for cache and reasoning counts for
    // ever. That is the wheel worth not rebuilding.
    //
    // The v2 mistake is not being repeated, because the seam is in a different place. v2
    // used a framework as its gateway and then bypassed the framework's tool execution to
    // get a turn budget back. Here Spring AI sits *below* ModelBackend: it does one
    // exchange and returns a completion, and the ledger, the consensus, the tool loop and
    // its budget stay in StandardLlmGateway where no backend can forget them.
    //
    // Version and module set are both deliberate:
    //   1.1.x    the line that runs on Spring Boot 3.5. Spring AI 2.0 requires Boot 4.0/4.1,
    //            Framework 7 and Jakarta EE 11 — a whole-service migration, and a separate
    //            decision. 1.1.7 is >= 1.1.3, which is where CVE-2026-22729/22730 were fixed.
    //   core     NOT spring-ai-starter-*. The starters autoconfigure ChatModel beans from
    //            spring.ai.* properties, which would put a second configuration surface
    //            beside helix.models.* for the same question. SpringAiBackend builds its
    //            models by hand, per slot, from helix.models.* like every other slot.
    //   no store No vector store, and both CVEs above are in vector-store filter expression
    //            converters. Nothing here embeds or retrieves; not depending on it is the
    //            cheapest possible mitigation.
    implementation(platform("org.springframework.ai:spring-ai-bom:1.1.7"))
    implementation("org.springframework.ai:spring-ai-openai")
    implementation("org.springframework.ai:spring-ai-anthropic")

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
