package com.lc.v2.checker.infra.storage;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import java.net.URI;
import com.lc.v2.checker.infra.config.StorageProperties;

/**
 * Wires the AWS S3 client for MinIO / S3-compatible object storage.
 */
@Configuration
public class S3Config {

    @Bean
    public S3Client s3Client(StorageProperties cfg) {
        var credentials = AwsBasicCredentials.create(cfg.accessKey(), cfg.secretKey());
        return S3Client.builder()
                .region(Region.of(cfg.region()))
                .credentialsProvider(StaticCredentialsProvider.create(credentials))
                .endpointOverride(URI.create(cfg.endpoint()))
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(cfg.pathStyle())
                        .build())
                .build();
    }

    @Bean
    public S3FileStore s3FileStore(S3Client s3Client, StorageProperties cfg,
                                   PdfBytesCache pdfBytesCache, MinioReachability reachability) {
        return new S3FileStore(s3Client, cfg, pdfBytesCache, reachability);
    }
}
