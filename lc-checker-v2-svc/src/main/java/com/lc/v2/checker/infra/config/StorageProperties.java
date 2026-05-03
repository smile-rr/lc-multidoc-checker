package com.lc.v2.checker.infra.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code storage.minio.*} from application.yml.
 */
@ConfigurationProperties(prefix = "storage.minio")
public class StorageProperties {

    private boolean enabled = true;
    private String endpoint = "http://192.168.31.214:9000";
    private String bucket = "lc-pdfs";
    private String region = "us-east-1";
    private String accessKey = "minioadmin";
    private String secretKey = "minioadmin";
    private boolean pathStyle = true;
    private String pathPrefix = "v2/";
    private int requestTimeoutSeconds = 30;

    public boolean enabled() { return enabled; }
    public String endpoint() { return endpoint; }
    public String bucket() { return bucket; }
    public String region() { return region; }
    public String accessKey() { return accessKey; }
    public String secretKey() { return secretKey; }
    public boolean pathStyle() { return pathStyle; }
    public String pathPrefix() { return pathPrefix; }
    public int requestTimeoutSeconds() { return requestTimeoutSeconds; }
}
