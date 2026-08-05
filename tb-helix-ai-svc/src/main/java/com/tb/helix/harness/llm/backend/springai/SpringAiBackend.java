package com.tb.helix.harness.llm.backend.springai;

import com.tb.helix.harness.llm.LlmProperties;
import com.tb.helix.harness.llm.LlmText;
import com.tb.helix.harness.llm.backend.Completion;
import com.tb.helix.harness.llm.backend.Content;
import com.tb.helix.harness.llm.backend.Exchange;
import com.tb.helix.harness.llm.backend.ModelBackend;
import com.tb.helix.harness.llm.backend.ModelHandle;
import com.tb.helix.harness.llm.backend.ToolCall;
import com.tb.helix.harness.llm.backend.Turn;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.anthropic.AnthropicChatModel;
import org.springframework.ai.anthropic.api.AnthropicApi;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Spring AI as a {@link ModelBackend}: one exchange in, one completion out.
 *
 * <p>Read the package note first — it says why a framework is here, why it sits below this
 * seam rather than above it, and what this backend refuses. The short version: everything that
 * is true of a model call whoever answers it — the ledger, the consensus, the tool budget, the
 * JSON salvage — stays in {@code StandardLlmGateway}. This class translates.
 *
 * <p>Which slots it serves is configuration and nothing else: a slot naming
 * {@code backend: spring-ai} is claimed here, anything else is not. Moving a role across is a
 * line of YAML, and moving it back is the same line — which is what makes the framework's
 * end-of-OSS-support date a containable risk rather than a bet.
 */
@Component
public class SpringAiBackend implements ModelBackend {

    private static final Logger log = LoggerFactory.getLogger(SpringAiBackend.class);

    static final String OPENAI = "openai";
    static final String ANTHROPIC = "anthropic";

    private final Map<String, ChatModel> models = new LinkedHashMap<>();
    private final Map<String, String> providers = new LinkedHashMap<>();
    private final Map<String, ModelHandle> handles = new LinkedHashMap<>();
    private final ObjectMapper json;

    public SpringAiBackend(LlmProperties props, ObjectMapper json) {
        this.json = json;

        props.allSlots().forEach((name, slot) -> {
            if (!slot.ownedBy(name())) return;
            if (!slot.usable()) {
                if (slot.enabled()) {
                    log.warn("Slot {} is enabled but has no api key or model — skipped", name);
                }
                return;
            }
            String provider = slot.provider();
            if (provider == null) {
                // Refused rather than guessed. Two providers are configured here and picking
                // one by inspecting a base URL would work until the day it did not, and then
                // would send a credit to the wrong vendor with the wrong key.
                log.error("Slot {} names backend '{}' but no provider — expected one of [{}, {}]. "
                        + "The slot is skipped and any role using it will fail when it is used.",
                        name, name(), OPENAI, ANTHROPIC);
                return;
            }
            try {
                models.put(name, build(provider, slot));
                providers.put(name, provider);
                handles.put(name, new ModelHandle(name, slot.model(), slot.baseUrl(),
                        slot.temperature(), slot.maxTokens()));
            } catch (RuntimeException e) {
                // A slot that cannot be built must not stop the service booting: governance
                // work runs with no models configured at all, and that has to keep being true.
                log.error("Slot {} could not be built on backend '{}': {}", name, name(), e.toString());
            }
        });

        // Silence is the right amount of noise when the feature is not in use. This backend
        // ships claimed by nothing, so an untouched deployment says nothing about it.
        if (!models.isEmpty()) {
            log.info("Backend '{}' serving model(s): {}", name(), models.keySet());
        }
    }

    @Override
    public String name() {
        return "spring-ai";
    }

    @Override
    public Optional<ModelHandle> handle(String id) {
        return Optional.ofNullable(handles.get(id));
    }

    // --- Building one model per slot -----------------------------------------

    /**
     * One {@link ChatModel} per slot, built by hand from {@code helix.models.*}.
     *
     * <p>By hand, and not through {@code spring-ai-starter-*}, because the starters
     * autoconfigure these beans from {@code spring.ai.*} properties. That would leave two
     * configuration surfaces answering the same question — which model, which key, which
     * endpoint — and the one that wins would depend on which is more specific rather than on
     * which a reader was looking at. Every slot in this service is configured in exactly one
     * place, and that does not stop being true because a slot changed backend.
     */
    private ChatModel build(String provider, LlmProperties.Slot slot) {
        return switch (provider) {
            case OPENAI -> {
                var api = OpenAiApi.builder()
                        .baseUrl(slot.baseUrl())
                        .apiKey(slot.apiKey())
                        .build();
                yield OpenAiChatModel.builder().openAiApi(api).build();
            }
            case ANTHROPIC -> {
                var api = AnthropicApi.builder()
                        .baseUrl(slot.baseUrl())
                        .apiKey(slot.apiKey())
                        .build();
                yield AnthropicChatModel.builder().anthropicApi(api).build();
            }
            default -> throw new IllegalArgumentException(
                    "Unknown provider '" + provider + "' — expected one of [" + OPENAI + ", " + ANTHROPIC + "]");
        };
    }

    // --- One round trip ------------------------------------------------------

    @Override
    public Completion call(ModelHandle handle, Exchange exchange) {
        ChatModel model = models.get(handle.id());
        if (model == null) {
            throw new IllegalStateException("No model for handle " + handle.id());
        }
        refuseImages(exchange);
        reportUnappliedHints(handle, exchange);

        List<Message> messages = exchange.turns().stream().map(SpringAiBackend::message).toList();
        var options = SpringAiOptions.forExchange(providers.get(handle.id()), handle, exchange, json);

        long began = System.currentTimeMillis();
        ChatResponse response = model.call(new Prompt(messages, options));
        int latencyMs = (int) (System.currentTimeMillis() - began);

        return completion(response, latencyMs);
    }

    /**
     * Images are not served here, and the refusal is the feature.
     *
     * <p>{@link UserMessage} models a turn as text plus a media list, so where the images sit
     * relative to the instruction in the assembled request is Spring AI's decision and cannot
     * be stated through this API. A document read sends byte-identical images <em>before</em>
     * its instruction so three passes ride one provider prefix cache, and the images are about
     * 95% of the input — getting it wrong roughly triples the interpret bill and raises nothing
     * anywhere, which makes it exactly the sort of failure that survives a review.
     *
     * <p>So: loud, at the call, naming the fix. A vision role belongs on the
     * {@code chat-completions} backend, which orders content parts explicitly, until this API
     * can be told the order.
     */
    private static void refuseImages(Exchange exchange) {
        boolean hasImage = exchange.turns().stream()
                .anyMatch(t -> t instanceof Turn.User u
                        && u.content().stream().anyMatch(c -> c instanceof Content.Image));
        if (hasImage) {
            throw new UnsupportedOperationException(
                    "The spring-ai backend does not serve image content. UserMessage carries text "
                    + "and media separately, so images-before-instruction cannot be expressed — and "
                    + "the wrong order roughly triples the bill for a document read while reporting "
                    + "nothing. Point this role at a chat-completions slot in helix.roles.");
        }
    }

    /**
     * Hints this backend cannot apply, said out loud.
     *
     * <p>One of the four obligations in {@code backend/package-info}: an unapplied hint must be
     * reported rather than dropped, because {@code enable_thinking:false} is what keeps a
     * Qwen-family model's reasoning out of structured output and its silent loss looks exactly
     * like nothing happening. Spring AI's options are typed, so {@code extraBody} has nowhere
     * to go here — which is fine for the providers this backend serves and must not become a
     * surprise for one it does not.
     */
    private static void reportUnappliedHints(ModelHandle handle, Exchange exchange) {
        if (!exchange.hints().isEmpty()) {
            log.warn("Slot {} is on the spring-ai backend, which has no verbatim request body: "
                    + "hint(s) {} were not applied. Typed options carry temperature and maxTokens; "
                    + "anything else needs a chat-completions slot.",
                    handle.id(), exchange.hints().keySet());
        }
    }

    // --- Turns to messages, and back -----------------------------------------

    private static Message message(Turn turn) {
        return switch (turn) {
            case Turn.System s -> new SystemMessage(s.text());
            // Text only — refuseImages has already run, so concatenation cannot lose an image.
            case Turn.User u -> new UserMessage(u.content().stream()
                    .filter(c -> c instanceof Content.Text)
                    .map(c -> ((Content.Text) c).text())
                    .reduce("", String::concat));
            case Turn.Assistant a -> AssistantMessage.builder()
                    .content(a.text() == null ? "" : a.text())
                    .toolCalls(a.toolCalls().stream()
                            .map(tc -> new AssistantMessage.ToolCall(
                                    tc.id(), "function", tc.name(), tc.argumentsJson()))
                            .toList())
                    .build();
            case Turn.ToolResult r -> ToolResponseMessage.builder()
                    .responses(List.of(new ToolResponseMessage.ToolResponse(
                            r.callId(), r.name(), r.content())))
                    .build();
        };
    }

    /**
     * What came back, in the gateway's vocabulary.
     *
     * <p>{@code LlmText.clean} is applied here as it is in the other backend, and for the same
     * reason: it is a fact about models rather than about a wire format, so the next backend
     * meets it too and should not write a second, subtly different version.
     */
    private Completion completion(ChatResponse response, int latencyMs) {
        Generation generation = response.getResult();
        AssistantMessage message = generation == null ? null : generation.getOutput();

        List<ToolCall> toolCalls = new ArrayList<>();
        if (message != null && message.hasToolCalls()) {
            message.getToolCalls().forEach(tc -> toolCalls.add(
                    new ToolCall(tc.id(), tc.name(),
                            tc.arguments() == null ? "{}" : tc.arguments())));
        }

        var metadata = response.getMetadata();
        var usage = metadata == null ? null : metadata.getUsage();
        NativeUsage detail = NativeUsage.of(usage);

        int prompt = usage == null ? 0 : or0(usage.getPromptTokens());
        int completion = usage == null ? 0 : or0(usage.getCompletionTokens());

        return new Completion(
                LlmText.clean(message == null ? null : message.getText()),
                // Spring AI 1.1 surfaces no neutral reasoning channel, so nothing is claimed
                // here rather than something invented. The one call that reasons on purpose,
                // plan.govern, runs on a chat-completions slot where reasoning_content is read
                // off the response directly.
                null,
                toolCalls,
                // No verbatim payload: Spring AI parses the wire response and does not keep the
                // bytes. Recording toString() would put a Java rendering where the run log
                // promises the provider's own — and "what did it actually return" is a question
                // only the real payload answers, so an approximation of it is worse than none.
                null,
                detail.totalPromptTokens(prompt),
                completion,
                detail.cachedPromptTokens(),
                detail.cacheWriteTokens(),
                detail.reasoningTokens(),
                latencyMs);
    }

    private static int or0(Integer i) {
        return i == null ? 0 : i;
    }
}
