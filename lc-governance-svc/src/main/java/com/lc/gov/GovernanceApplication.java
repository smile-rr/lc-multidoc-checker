package com.lc.gov;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * LC Governance — owns the checks the examination runs on.
 *
 * <p>Publishes a versioned catalog release; LC Check pins one and reads it.
 * Nothing in this service examines a presentation.
 */
@SpringBootApplication
public class GovernanceApplication {

    public static void main(String[] args) {
        SpringApplication.run(GovernanceApplication.class, args);
    }
}
