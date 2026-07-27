// lc-governance-svc — LC Governance: the rules the examination runs on.
//
// Same stable pairing as lc-checker-v2-svc:
//   - Spring Boot 3.5.14
//   - Spring AI   1.1.4   (text LLM only — normalize + refine)
//   - JDK 21 (Temurin)
//
// Deliberately absent, and they should stay absent: Prowide, MinIO, OTLP. This
// service authors and publishes checks; it does not examine presentations.
//
// PDFBox is here for one narrow job — pulling text out of a rulebook PDF so the
// Library can be imported. Text extraction only: no rendering, no rasterising,
// no vision. An image-only PDF is rejected rather than OCR'd.

plugins {
    java
    id("org.springframework.boot") version "3.5.14"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.lc.gov"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

extra["springAiVersion"] = "1.1.4"

dependencyManagement {
    imports {
        mavenBom("org.springframework.ai:spring-ai-bom:${property("springAiVersion")}")
    }
}

dependencies {
    // --- Spring Boot core ---------------------------------------------------
    developmentOnly("org.springframework.boot:spring-boot-devtools")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-validation")

    // --- Spring AI (normalize an uploaded rule, refine a draft) -------------
    implementation("org.springframework.ai:spring-ai-starter-model-openai")

    // --- Spring JDBC + PostgreSQL (lc_gov schema in lc_checker database) ----
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    runtimeOnly("org.postgresql:postgresql")

    // --- YAML (dictionary + reference-book seeds) --------------------------
    implementation("com.fasterxml.jackson.dataformat:jackson-dataformat-yaml")

    // --- Spreadsheet / CSV import + export ----------------------------------
    implementation("org.apache.poi:poi-ooxml:5.4.1")
    implementation("org.apache.commons:commons-csv:1.14.0")

    // --- PDF text extraction (Library import only — never rendering) --------
    implementation("org.apache.pdfbox:pdfbox:3.0.7")

    // --- OpenAPI spec (/v3/api-docs) ----------------------------------------
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:2.8.11")
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.add("-parameters")
}

tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
    jvmArgs("-Djava.net.preferIPv4Stack=true")
}
