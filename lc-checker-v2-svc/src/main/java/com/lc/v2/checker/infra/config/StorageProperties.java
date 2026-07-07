package com.lc.v2.checker.infra.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code storage.minio.*} from application.yml.
 *
 * <p>{@code required=false} (env {@code STORAGE_MINIO_REQUIRED=false}) skips MinIO
 * bootstrap and S3 I/O — PDFs stay in the in-process {@link com.lc.v2.checker.infra.storage.PdfBytesCache} only.
 */
@ConfigurationProperties(prefix = "storage.minio")
public class StorageProperties {

    /** When false, MinIO is not used (memory-only mode). */
    private boolean required = true;
    private String endpoint = "http://192.168.31.214:9000";
    private String bucket = "lc-pdfs";
    private String region = "us-east-1";
    private String accessKey = "minioadmin";
    private String secretKey = "minioadmin";
    private boolean pathStyle = true;
    private String pathPrefix = "v2/";
    private int requestTimeoutSeconds = 30;

    public boolean enabled() { return required; }
    public boolean required() { return required; }
    public String endpoint() { return endpoint; }
    public String bucket() { return bucket; }
    public String region() { return region; }
    public String accessKey() { return accessKey; }
    public String secretKey() { return secretKey; }
    public boolean pathStyle() { return pathStyle; }
    public String pathPrefix() { return pathPrefix; }
    public int requestTimeoutSeconds() { return requestTimeoutSeconds; }

    public void setRequired(boolean required) { this.required = required; }
    /** @deprecated use {@link #setRequired}; kept for {@code storage.minio.enabled} in old yml. */
    @Deprecated
    public void setEnabled(boolean enabled) { this.required = enabled; }
    public void setEndpoint(String endpoint) { this.endpoint = endpoint; }
    public void setBucket(String bucket) { this.bucket = bucket; }
    public void setRegion(String region) { this.region = region; }
    public void setAccessKey(String accessKey) { this.accessKey = accessKey; }
    public void setSecretKey(String secretKey) { this.secretKey = secretKey; }
    public void setPathStyle(boolean pathStyle) { this.pathStyle = pathStyle; }
    public void setPathPrefix(String pathPrefix) { this.pathPrefix = pathPrefix; }
    public void setRequestTimeoutSeconds(int requestTimeoutSeconds) { this.requestTimeoutSeconds = requestTimeoutSeconds; }
}
