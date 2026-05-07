package com.lc.v2.checker.infra.llm;

import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * Wraps the auto-configured {@link OpenAiChatModel} in a
 * {@link SanitizingChatModel} and exposes it as the {@code @Primary}
 * {@link ChatModel} bean. {@code ChatClient.Builder} auto-config picks up
 * the primary, so all text-LLM call sites in the service automatically
 * receive cleaned responses.
 *
 * <p>The original {@link OpenAiChatModel} bean stays in the context under
 * its concrete type — we depend on it directly to avoid a self-referencing
 * primary cycle.
 */
@Configuration
public class LlmConfig {

    @Bean
    @Primary
    public ChatModel sanitizingChatModel(OpenAiChatModel openAiChatModel) {
        return new SanitizingChatModel(openAiChatModel);
    }
}
