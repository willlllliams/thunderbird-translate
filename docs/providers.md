# Translation services

This page lists every translation service of Thunderbird Translate with its endpoint, default model, where to get a key, and the parameters the extension sends. The presets live in `src/shared/providers.ts`; the thinking parameters live in `src/shared/thinking.ts`.

## Contents

- [Free and offline services](#free-and-offline-services)
- [Microsoft Translator with an Azure key](#microsoft-translator-with-an-azure-key)
- [DeepLX](#deeplx)
- [AI providers](#ai-providers)
- [Provider notes](#provider-notes)
- [Thinking mode](#thinking-mode)
- [Source language in requests](#source-language-in-requests)

## Free and offline services

| Service | Tier | Setup | How it is called |
| --- | --- | --- | --- |
| Dictionary (offline) | 1 Dictionary | Download language pairs in the Dictionaries section | Word-by-word translation with the installed packs, see [dictionary-packs.md](dictionary-packs.md) |
| Google Translate (free, default) | 2 Machine translation | None | The `client=gtx` endpoint of `translate.googleapis.com`. One POST carries several `q` parameters, so several paragraphs share one request |
| Microsoft Translator (free) | 2 Machine translation | None | `edge.microsoft.com/translate/translatetext`, the endpoint the Edge browser uses. The request body is an array of paragraphs |
| Microsoft Translator (Azure key) | 2 Machine translation | Key and region of an Azure Translator resource | `api.cognitive.microsofttranslator.com/translate`, the official Translator v3 API |
| DeepLX | 2 Machine translation | Endpoint required, token optional | A self-hosted or third-party DeepLX server |
| Bergamot (offline) | 2 Machine translation | Download direction pairs in the "Offline translation models (Bergamot)" section | Translation on your computer with Mozilla's Firefox Translations models, see [bergamot.md](bergamot.md) |

A fresh installation starts with Google Translate and Microsoft Translator added. The dictionary and Bergamot need data that you download, so you add them by hand.

The free Google and Microsoft endpoints are undocumented. They may change or be rate-limited. Microsoft retired the token endpoint `edge.microsoft.com/translate/auth` in July 2026; the extension uses only the direct endpoint.

## Microsoft Translator with an Azure key

The panel option "Use my key (Azure Translator)" switches Microsoft Translator to the official API.

1. Create a Translator resource in the Azure portal.
2. Open Keys and Endpoint of the resource.
3. Copy the key and the region into the panel. The region can stay empty for a global resource.

The endpoint field defaults to `https://api.cognitive.microsofttranslator.com/translate`. Authentication is described in the [Azure Translator documentation](https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/authentication). Free mode and key mode are cached and batched separately.

## DeepLX

DeepLX needs the endpoint of a DeepLX server ([deeplx.owo.network](https://deeplx.owo.network/) describes the project). The token is optional.

- If the endpoint contains `{{apiKey}}`, the token replaces it.
- Otherwise the token is sent as `Authorization: Bearer <token>`.

The endpoint accepts one paragraph per request, so the paragraphs of a batch are requested concurrently.

## AI providers

All AI providers are called through `generateText` of the Vercel AI SDK. Providers with an official `@ai-sdk/*` package use that package. The others use `@ai-sdk/openai-compatible`.

Endpoint, API key, model and temperature can be changed for every provider. The model field suggests common models and accepts any model name. The default temperature is 0.3, except for DeepSeek (1.3) and Anthropic Claude (none sent).

| Provider | SDK package | Default endpoint | Default model | Key | Get a key |
| --- | --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | Yes | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Yes | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | Yes | [aistudio.google.com](https://aistudio.google.com/apikey) |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-flash` | Yes | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-4.3` | Yes | [console.x.ai](https://console.x.ai/) |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Yes | [console.groq.com](https://console.groq.com/keys) |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | Yes | [console.mistral.ai](https://console.mistral.ai/api-keys) |
| Ollama (local) | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | No | [ollama.com](https://ollama.com/) |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | Yes | [openrouter.ai](https://openrouter.ai/keys) |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Yes | [api.together.ai](https://api.together.ai/settings/api-keys) |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | Yes | [fireworks.ai](https://fireworks.ai/account/api-keys) |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Yes | [deepinfra.com](https://deepinfra.com/dash/api_keys) |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | Yes | [cloud.cerebras.ai](https://cloud.cerebras.ai/) |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | Yes | [perplexity.ai](https://www.perplexity.ai/settings/api) |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | Yes | [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys) |
| 智谱 GLM (Zhipu) | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | Yes | [open.bigmodel.cn](https://open.bigmodel.cn/usercenter/apikeys) |
| 通义千问 / 阿里云百炼 (DashScope) | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | Yes | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/) |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | Yes | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak) |
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-mini-260428` | Yes | [console.volcengine.com](https://console.volcengine.com/ark) |
| Azure OpenAI | `@ai-sdk/azure` | Must be filled in | `gpt-4.1-mini` | Yes | [Azure OpenAI documentation](https://learn.microsoft.com/azure/ai-services/openai/) |
| LM Studio (local) | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | No | [lmstudio.ai](https://lmstudio.ai/) |
| Custom OpenAI-compatible | `@ai-sdk/openai-compatible` | Must be filled in | Must be filled in | No | none |

The "Get a key / docs" link next to the key field of the settings page opens the same address.

## Provider notes

Some providers have extra requirements.

- Anthropic Claude: the extension adds the header `anthropic-dangerous-direct-browser-access: true`, which Anthropic requires for requests from a browser context. The Claude 5 series and Opus 4.7 and 4.8 reject a custom temperature. The extension sends no temperature for these models, and the temperature field of the default model is empty.
- Azure OpenAI: the endpoint is `https://<resource>.openai.azure.com/openai`. The model field takes the deployment name.
- Ollama: by default Ollama rejects cross-origin requests from extension pages. Start Ollama with the environment variable `OLLAMA_ORIGINS=moz-extension://*`.
- Moonshot: the default endpoint is the China site `api.moonshot.cn`. Accounts on the international site use `https://api.moonshot.ai/v1`.
- Volcengine Doubao: the model field takes either a model name or the ID of an inference endpoint created in the Ark console.
- Ollama, LM Studio and any model with thinking mode on wait three times the request timeout of the settings, see [batching.md](batching.md#timeouts).

The endpoint field warns when it holds the address of a provider's web console, documentation or chat app instead of its API.

## Thinking mode

Each AI provider has a "Thinking mode" switch, off by default. Translation does not need the model to reason first, and reasoning makes requests slower and more expensive. Several current models reason unless told otherwise, for example `deepseek-flash`, `claude-haiku-5-5` and `gemini-2.5-flash`, so "off" is sent explicitly.

Every provider spells the switch differently, and within one provider only some models accept it. The extension matches the model name against the patterns below and sends the provider options of the first match. A model without a match gets no thinking parameter. While thinking is on, no temperature is sent for models that match a pattern in the table, because reasoning models ignore or reject it.

| Provider | Models | Off | On | Source |
| --- | --- | --- | --- | --- |
| OpenAI, Azure OpenAI | `gpt-5.1` and later | `openai.reasoningEffort: "none"` | `"medium"` | [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) |
| | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `"minimal"` | `"medium"` | same |
| | `o1`, `o3`, `o4-mini` … | `"low"` (cannot be turned off) | `"medium"` | same |
| Anthropic | Claude 5 series, Opus 4.7/4.8 | `anthropic.thinking: { type: "disabled" }` | `{ type: "adaptive" }` | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |
| | Claude 3.7 and 4.x | nothing (off by default) | `{ type: "enabled", budgetTokens: 1024 }` | same |
| Google Gemini | `gemini-2.5-pro` | `google.thinkingConfig: { thinkingBudget: 128 }` (minimum, cannot be turned off) | `{ thinkingBudget: -1 }` | [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) |
| | other `gemini-2.5-*` | `{ thinkingBudget: 0 }` | `{ thinkingBudget: -1 }` | same |
| | Gemini 3 and later | `{ thinkingLevel: "low" }` (no full off) | `{ thinkingLevel: "high" }` | same |
| DeepSeek | all | `deepseek.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) |
| xAI Grok | `grok-4.3` | `xai.reasoningEffort: "none"` | `"high"` | [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning) |
| | `grok-4.5`, `grok-4.6`, `grok-4.7` | `"low"` (cannot be turned off) | `"high"` | same |
| Groq | Qwen3 | `groq.reasoningEffort: "none"` | `"default"` with `reasoningFormat: "parsed"` | [Groq reasoning](https://console.groq.com/docs/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | same |
| Mistral AI | all (the SDK sends it only for models that accept it) | `mistral.reasoningEffort: "none"` | `"high"` | [Mistral reasoning](https://docs.mistral.ai/studio/conversations/reasoning) |
| Together AI | Qwen3, GLM-4/5, DeepSeek V4, Kimi K3, MiniMax M3 | `togetherai.reasoning: { enabled: false }` | `{ enabled: true }` | [Together reasoning](https://docs.together.ai/docs/inference/chat/reasoning) |
| Fireworks AI | DeepSeek V3.1/3.2/V4, GLM, Kimi K3, Qwen3 | `fireworks.reasoningEffort: "none"` | `"medium"` | [Fireworks reasoning](https://docs.fireworks.ai/guides/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | same |
| DeepInfra | all (ignored by models without reasoning) | `deepinfra.reasoningEffort: "none"` | `"high"` | [DeepInfra reasoning](https://docs.deepinfra.com/chat/reasoning) |
| Cerebras | Qwen | `cerebras.reasoningEffort: "none"` | `"medium"` | [Cerebras reasoning](https://inference-docs.cerebras.ai/capabilities/reasoning) |
| | `gpt-oss` | `"low"` | `"medium"` | same |
| Moonshot / Kimi | `kimi-k2.5`, `kimi-k2.6` | `moonshotai.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Kimi thinking models](https://platform.kimi.com/docs/guide/use-kimi-k2-thinking-model) |
| | `kimi-k3` | `moonshotai.reasoningEffort: "low"` | `"high"` | same |
| DashScope | Qwen3, `qwen-plus`, `qwen-flash`, `qwen-turbo` | `alibaba.enableThinking: false` | `true` | [Deep thinking](https://help.aliyun.com/zh/model-studio/deep-thinking) |
| Ollama | all | `ollama.reasoningEffort: "none"` | `"medium"` | [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) |
| OpenRouter | models that always reason (`o*`, `gpt-5`, `gpt-oss`, `grok-4`, Claude Opus 5, Gemini 2.5 Pro and 3) | `openrouter.reasoning: { effort: "low" }` | `{ enabled: true }` | [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
| | all others (ignored by models without reasoning) | `{ enabled: false }` | `{ enabled: true }` | same |
| Zhipu GLM | GLM-4.5 and later | `zhipu.thinking: { type: "disabled" }`; nothing for GLM-5.3, which rejects it | `{ type: "enabled" }` | [GLM thinking](https://docs.bigmodel.cn/cn/guide/capabilities/thinking) |
| SiliconFlow | Qwen3, DeepSeek V3.1/3.2/V4, GLM-4.5+, Hunyuan-A13B, Kimi K2 | `siliconflow.enable_thinking: false` | `true` | [Chat completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions) |
| Volcengine Doubao | Seed and thinking models | `doubao.thinking: { type: "disabled" }` | `{ type: "enabled" }` | [Ark documentation](https://www.volcengine.com/docs/82379) |

Perplexity, LM Studio and custom OpenAI-compatible services have no documented thinking parameter on the endpoint the extension uses. Their switch is disabled, and the settings page says so.

For OpenAI-compatible presets (Ollama, OpenRouter, Zhipu, SiliconFlow, Doubao) the options are written under the preset ID. `@ai-sdk/openai-compatible` copies them into the request body as they are. `reasoningEffort` is the one key it renames, to `reasoning_effort`.

The switch works by matching model names. A new model whose name matches none of the patterns gets no thinking parameter until the table in `src/shared/thinking.ts` is extended.

## Source language in requests

The source language is "Detect automatically" by default, or one of the 20 languages of the target language list. It goes to every service:

| Service | Automatic detection | Fixed language |
| --- | --- | --- |
| Google Translate | `sl=auto` | `sl=<code>` |
| Microsoft Translator, free and with key | no `from` parameter | `from=<code>` |
| DeepLX | `source_lang: "auto"` | `source_lang: "<code>"` (Chinese variants as `ZH`) |
| AI services | "Detect the source language of … and translate it into …" | "Translate … from <language> into …" |
| Dictionary | detected per paragraph | the language as set |
| Bergamot | detected per paragraph; the paragraphs of each language are translated together | the language as set |

Prompts sent to AI services always use the English name of a language, because models follow English instructions most reliably. How paragraphs are skipped and how Chinese variants are handled is described in [settings.md](settings.md#source-language).
