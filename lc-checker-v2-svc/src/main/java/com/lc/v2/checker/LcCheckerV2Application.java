package com.lc.v2.checker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
public class LcCheckerV2Application {

    public static void main(String[] args) {
        SpringApplication.run(LcCheckerV2Application.class, args);
    }
}
