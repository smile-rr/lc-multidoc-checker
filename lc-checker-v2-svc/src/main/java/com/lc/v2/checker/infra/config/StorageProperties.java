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

    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public void setEndpoint(String endpoint) { this.endpoint = endpoint; }
    public void setBucket(String bucket) { this.bucket = bucket; }
    public void setRegion(String region) { this.region = region; }
    public void setAccessKey(String accessKey) { this.accessKey = accessKey; }
    public void setSecretKey(String secretKey) { this.secretKey = secretKey; }
    public void setPathStyle(boolean pathStyle) { this.pathStyle = pathStyle; }
    public void setPathPrefix(String pathPrefix) { this.pathPrefix = pathPrefix; }
    public void setRequestTimeoutSeconds(int requestTimeoutSeconds) { this.requestTimeoutSeconds = requestTimeoutSeconds; }
}
