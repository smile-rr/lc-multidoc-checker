package com.lc.v2.checker.infra.llm;

import java.util.ArrayList;
import java.util.List;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatGenerationMetadata;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import reactor.core.publisher.Flux;

/**
 * {@link ChatModel} decorator that runs every assistant text response through
 * {@link LlmResponseSanitizer} before it reaches the {@link ChatModel} caller.
 *
 * <p>Wired as the {@code @Primary} {@code ChatModel} bean so both code paths
 * we use today are covered:
 * <ul>
 *   <li>{@code ChatClient.Builder} — auto-configured against the primary
 *       ChatModel, so {@code chatClient.prompt()...call().content()} returns
 *       sanitized text.</li>
 *   <li>{@code ChatModel#call(Prompt)} — used directly by
 *       {@code AgentRuleExecutor.callWithTools} for the manual tool loop;
 *       the {@code AssistantMessage} text on every {@link Generation} is
 *       rewritten in place.</li>
 * </ul>
 *
 * <p>Tool-calling assistant messages are passed through untouched: their
 * text is typically empty, the surrounding tool-call structure is what the
 * loop dispatches on, and we don't want to disturb anything the framework
 * round-trips back to the model.
 */
public class SanitizingChatModel implements ChatModel {

    private final ChatModel delegate;

    public SanitizingChatModel(ChatModel delegate) {
        this.delegate = delegate;
    }

    @Override
    public ChatResponse call(Prompt prompt) {
        return rewrite(delegate.call(prompt));
    }

    @Override
    public Flux<ChatResponse> stream(Prompt prompt) {
        return delegate.stream(prompt).map(this::rewrite);
    }

    @Override
    public ChatOptions getDefaultOptions() {
        return delegate.getDefaultOptions();
    }

    private ChatResponse rewrite(ChatResponse response) {
        if (response == null) return null;
        List<Generation> rewritten = new ArrayList<>(response.getResults().size());
        boolean changed = false;
        for (Generation g : response.getResults()) {
            AssistantMessage msg = g.getOutput();
            if (msg == null || msg.hasToolCalls()) {
                rewritten.add(g);
                continue;
            }
            String original = msg.getText();
            String cleaned = LlmResponseSanitizer.sanitize(original);
            if (cleaned == null || cleaned.equals(original)) {
                rewritten.add(g);
                continue;
            }
            AssistantMessage replacement = AssistantMessage.builder()
                    .content(cleaned)
                    .properties(msg.getMetadata())
                    .toolCalls(msg.getToolCalls())
                    .media(msg.getMedia())
                    .build();
            ChatGenerationMetadata md = g.getMetadata();
            rewritten.add(md == null ? new Generation(replacement) : new Generation(replacement, md));
            changed = true;
        }
        if (!changed) return response;
        return ChatResponse.builder()
                .generations(rewritten)
                .metadata(response.getMetadata())
                .build();
    }
}
