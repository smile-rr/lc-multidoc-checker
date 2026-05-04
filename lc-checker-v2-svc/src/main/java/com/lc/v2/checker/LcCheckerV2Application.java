package com.lc.v2.checker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan("com.lc.v2.checker")
@EnableAsync
@EnableScheduling
public class LcCheckerV2Application {

    public static void main(String[] args) {
        SpringApplication.run(LcCheckerV2Application.class, args);
    }
}
