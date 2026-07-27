package com.lc.gov.infra.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Note there is deliberately no {@code ObjectMapper} bean here. Declaring one
 * would switch off Spring Boot's Jackson auto-configuration; the YAML mapper the
 * seeder needs lives inside {@code YamlReader} for exactly that reason.
 */
@Configuration
@EnableConfigurationProperties(GovernanceProperties.class)
public class AppConfig {

    /** The governance UI runs on the Vite dev server (5174) and proxies /api,
     *  but a direct call from 5173/5174 during development should not 403. */
    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOriginPatterns("http://127.0.0.1:*", "http://localhost:*")
                        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE");
            }
        };
    }
}
