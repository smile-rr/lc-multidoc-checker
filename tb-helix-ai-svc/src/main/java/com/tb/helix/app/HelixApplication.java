package com.tb.helix.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * tb-helix-ai-svc — one service, two business modules.
 *
 * <p>{@code lccheck} examines a presentation against a credit; {@code governance} authors
 * the rules it examines with. They are siblings that share a platform ({@code core} ports,
 * {@code infra} adapters) and never reference each other directly.
 *
 * <p>The component scan starts at {@code com.tb.helix} so all five packages are picked up,
 * but the wiring that crosses their boundaries lives here in {@code app} and nowhere else.
 *
 * <p>{@code @EnableAsync} is for stage execution: an officer's POST to run a stage returns
 * immediately and the work proceeds on a worker thread, reporting over SSE.
 */
@SpringBootApplication(scanBasePackages = "com.tb.helix")
@ConfigurationPropertiesScan("com.tb.helix")
@EnableAsync
@EnableScheduling
public class HelixApplication {

    public static void main(String[] args) {
        SpringApplication.run(HelixApplication.class, args);
    }
}
