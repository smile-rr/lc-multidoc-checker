package com.tb.helix.infra.cache;

import com.tb.helix.core.cache.CacheTier;
import com.tb.helix.infra.config.CacheProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

/**
 * L2 — shared between instances. <b>Off.</b>
 *
 * <p>Written, configured, and switched off at {@code helix.cache.l2.enabled=false}, with
 * Redis autoconfiguration excluded so a disabled tier opens no connection at boot. The
 * point of building it now is that turning it on later is a property flip rather than a
 * design exercise, and the shape of the tier stack is settled while it is cheap to settle.
 *
 * <p>It earns its place when there is a second instance: today an L1 miss costs a Postgres
 * round trip, which on one node is fast enough that a network hop to Redis would be a
 * lateral move.
 *
 * <p>Every failure degrades to a miss. A shared cache that can fail a request has become a
 * dependency, and this one is an optimisation — which is exactly the property that makes
 * it safe to enable in production without a rollback plan.
 */
@Component
@ConditionalOnProperty(name = "helix.cache.l2.enabled", havingValue = "true")
public class RedisTier implements CacheTier {

    private static final Logger log = LoggerFactory.getLogger(RedisTier.class);

    private final RedisTemplate<String, byte[]> redis;
    private final Duration defaultTtl;

    public RedisTier(CacheProperties props) {
        CacheProperties.L2 cfg = props.l2();
        this.defaultTtl = cfg.ttl();

        RedisStandaloneConfiguration standalone = new RedisStandaloneConfiguration(cfg.host(), cfg.port());
        if (cfg.password() != null && !cfg.password().isBlank()) {
            standalone.setPassword(cfg.password());
        }
        LettuceConnectionFactory factory = new LettuceConnectionFactory(standalone);
        factory.afterPropertiesSet();

        RedisTemplate<String, byte[]> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        // Raw bytes both ways. Values here are already-serialised payloads; putting a
        // second serialiser over them would make the stored form depend on a Java class,
        // which is the wrong thing to couple a shared cache to.
        template.setKeySerializer(RedisSerializer.string());
        template.setValueSerializer(RedisSerializer.byteArray());
        template.afterPropertiesSet();
        this.redis = template;

        log.info("L2 cache enabled at {}:{} (ttl {})", cfg.host(), cfg.port(), cfg.ttl());
    }

    @Override
    public Level level() {
        return Level.L2;
    }

    @Override
    public boolean enabled() {
        return true;
    }

    @Override
    public Optional<byte[]> get(String key) {
        try {
            return Optional.ofNullable(redis.opsForValue().get(namespaced(key)));
        } catch (RuntimeException e) {
            log.warn("L2 lookup failed, treating as miss: {}", e.toString());
            return Optional.empty();
        }
    }

    @Override
    public void put(String key, byte[] value, Duration ttl) {
        try {
            redis.opsForValue().set(namespaced(key), value,
                    ttl == null || ttl.isZero() ? defaultTtl : ttl);
        } catch (RuntimeException e) {
            log.warn("L2 write failed, continuing: {}", e.toString());
        }
    }

    @Override
    public void evict(String key) {
        try {
            redis.delete(namespaced(key));
        } catch (RuntimeException e) {
            log.warn("L2 evict failed: {}", e.toString());
        }
    }

    // Namespaced so this can share a Redis with something else without a key collision
    // silently serving one application's bytes to another.
    private static final String NS = "helix:d:";

    private String namespaced(String key) {
        return NS + key;
    }
}
