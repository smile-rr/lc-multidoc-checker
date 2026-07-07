// lc-checker-v2-api — LC Checker V2 Multi-Doctype Workbench
//
// Same stable pairing as V1:
//   - Spring Boot 3.5.14
//   - Spring AI   1.1.4
//   - JDK 21 (Temurin)

plugins {
    java
    id("org.springframework.boot") version "3.5.14"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.lc.v2"
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
    implementation("org.springframework.boot:spring-boot-starter-aop")

    // --- Spring AI (text LLM only — vision uses RestClient) -----------------
    implementation("org.springframework.ai:spring-ai-starter-model-openai")

    // --- Spring JDBC + PostgreSQL (lc_v3 schema in lc_checker database) ------
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    runtimeOnly("org.postgresql:postgresql")

    // --- Observability (Langfuse via OTLP) ----------------------------------
    implementation("io.micrometer:micrometer-registry-prometheus")
    implementation("net.logstash.logback:logstash-logback-encoder:8.0")
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")

    // --- In-memory session cache -------------------------------------------
    implementation("com.github.ben-manes.caffeine:caffeine")

    // --- YAML config (rule catalog, field-pool, refs) ----------------------
    implementation("org.yaml:snakeyaml")

    // --- PDF rendering (vision extraction) ---------------------------------
    implementation("org.apache.pdfbox:pdfbox:3.0.7")

    // --- MT700 parser -------------------------------------------------------
    implementation("com.prowidesoftware:pw-swift-core:SRU2025-10.3.12")
    implementation("org.apache.commons:commons-lang3:3.18.0")

    // --- OpenAPI spec (/v3/api-docs) ----------------------------------------
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:2.8.11")

    // --- MinIO (PDF content-addressed storage) ------------------------------
    implementation(platform("software.amazon.awssdk:bom:2.31.32"))
    implementation("software.amazon.awssdk:s3")
    implementation("software.amazon.awssdk:url-connection-client")
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.add("-parameters")
}

tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
    jvmArgs("-Djava.net.preferIPv4Stack=true")
}
