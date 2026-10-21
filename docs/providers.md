# Translation services

This page lists every translation service of Multi Translate for Thunderbird with its endpoint, default model, where to get a key, and the parameters the extension sends. The presets live in `src/shared/providers.ts`; the thinking parameters live in `src/shared/thinking.ts`, what is known of the models that read images in `src/shared/vision.ts`.

## Contents

- [Free and offline services](#free-and-offline-services)
- [Microsoft Translator with an Azure key](#microsoft-translator-with-an-azure-key)
- [DeepLX](#deeplx)
- [Machine translators with a key of your own](#machine-translators-with-a-key-of-your-own)
- [AI providers](#ai-providers)
- [Provider notes](#provider-notes)
- [Thinking mode](#thinking-mode)
- [Image translation](#image-translation)
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

Some networks block these two routes; Google Translate is not available in mainland China. The settings page and the setup guide therefore check, when they show one of them as added, whether it answers the fixed sentence of "Test connection", and a failure that reached no server names the services that work without it ([settings.md](settings.md#connection-check-of-the-free-routes)).

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

## Machine translators with a key of your own

DeepL, Baidu Translate, Youdao and Caiyun are machine translators of tier 2 that need an account. Each preset counts as added once its key is filled in. All four send message text over the network, so the consent panel above a message asks before their first request, as for every online service.

| Service | Endpoint (fixed host permission) | Fields | Paragraphs and characters per request |
| --- | --- | --- | --- |
| DeepL API | `https://api.deepl.com`, or `https://api-free.deepl.com` for a key ending in `:fx` | API key; endpoint (optional); formality; English and Portuguese variant | 50 and 30000 |
| 百度翻译 (Baidu Translate) | `https://fanyi-api.baidu.com/api/trans/vip/translate` | App ID; secret key; account edition | 50 and 950 (standard edition), 50 and 5950 (advanced and premium) |
| 有道智云 (Youdao) | `https://openapi.youdao.com/v2/api` | App ID; app secret | 50 and 5000 |
| 彩云小译 (Caiyun) | `https://api.interpreter.caiyunai.com/v1/translator` | Token | 40 and 5000 |

The keys stay in `storage.local` of the Thunderbird profile and go only to the endpoint of their own service. The four limits apply on top of the batch settings, see [batching.md](batching.md).

What each account costs, from the pages of the services (October 2026):

- DeepL API Free translates 500,000 characters a month at no cost (DeepL support, "Usage count and billing in DeepL API"); DeepL API Pro has no free characters.
- Baidu gives a free quota every month by edition, from 50,000 characters in the standard edition to 2,000,000 with business verification (table below).
- Youdao gives a new account 10 yuan of trial credit, 40 yuan more after identity verification (ai.youdao.com, price center), and then bills by use.
- Caiyun gives a new account 1,000,000 characters valid for one month, then bills 39 yuan per million characters, counted on the source text with spaces and punctuation (docs.caiyunapp.com/lingocloud-api).

### DeepL API

The extension calls `POST /v2/translate` with a JSON body. The key goes in the header `Authorization: DeepL-Auth-Key <key>`; DeepL stopped accepting the `auth_key` parameter in 2026. All paragraphs of a batch go in the `text` array of one request, and the answer lists their translations in the same order. The request body may have 128 KiB, and 30000 characters of at most 4 bytes each stay below that with the JSON around them.

The target language codes differ from those of DeepLX: Simplified Chinese is `ZH-HANS`, Traditional Chinese `ZH-HANT`. English is written as `EN-US` or `EN-GB`, Portuguese as `PT-BR` or `PT-PT`, as set in the panel. Source languages carry no variant (`ZH`, `EN`, `PT`); with automatic detection no `source_lang` is sent.

Formality "More formal" and "Less formal" are sent as `prefer_more` and `prefer_less`. DeepL ignores these two values for target languages without formality, while `more` and `less` would make such a request fail.

"Test connection" calls `GET /v2/usage`, which costs no characters, and shows the characters used and the limit of the billing period. DeepL answers a refused key with HTTP 403 and a used-up quota with HTTP 456; the extension names both. HTTP 429 is tried again with the retries of the batch settings.

Formality and the two variants are part of the cache key of every DeepL translation, so changing them translates again.

### Requests of the extension and DeepL's rule on browsers

DeepL's documentation states that the API "does not allow calls directly from browser-based applications" ([CORS requests](https://developers.deepl.com/docs/best-practices/cors-requests)). Before DeepL was added, this was checked on 2026-10-21 with an invalid key, against both hosts, without and with the `Origin: moz-extension://<uuid>` header that Thunderbird sends from the background page of an extension (the same header for which Ollama needs `OLLAMA_ORIGINS=moz-extension://*`).

| Request | Without Origin | With `Origin: moz-extension://…` |
| --- | --- | --- |
| `GET /v2/usage`, invalid key | 403 "Authentication failed, provided API key is invalid" | the same |
| `POST /v2/translate`, invalid key | 403 "Forbidden" | the same |
| `POST /v2/translate`, no key | 403 "Missing Authorization header" | the same |
| `OPTIONS /v2/translate` (CORS preflight) | 204 | 204 |

The answers are identical with and without the Origin header, also with `Origin: https://example.com`, and every one is an authentication error. DeepL therefore does not refuse a request for its origin. A web page fails because DeepL sends no `Access-Control-Allow-Origin` header, and the browser keeps the answer from the page. An extension with a host permission for the address reads the answer without CORS checks ([MDN: host_permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions)). So the extension calls DeepL from its background script without `webRequest` and without changing any header. DeepLX stays in the list for users without a DeepL account.

### Baidu Translate

The general text translation is called with `POST` and form fields `q`, `from`, `to`, `appid`, `salt` and `sign`. The signature is the MD5 of app ID, `q`, salt and secret key joined, in lower-case hex, with `q` not URL-encoded. Web Crypto has no MD5, so the extension has its own implementation in `src/shared/md5.ts`, tested with the test suite of RFC 1321 and with the example of Baidu's documentation (`appid` 2015063000000001, `q` apple, salt 1435660288, key 12345678 give `f89f9594663708c1605f3d736d01d2d4`).

The paragraphs of a batch are the lines of one `q`, and `trans_result` has one entry per line. A line break inside a paragraph travels as `⁂` (U+2042) and comes back as a line break. When the answer has another number of lines, or lost a `⁂`, the batch is asked again one paragraph per request.

| Edition | Free characters a month | Requests per second | Characters per request | Languages |
| --- | --- | --- | --- | --- |
| Standard | 50,000 | 1 | 1000 | 28 common languages |
| Advanced (personal verification) | 1,000,000 | 10 | 6000 | 28 common languages |
| Premium (business verification) | 2,000,000 | 100 | 6000 | also Ukrainian, Turkish, Indonesian and Hindi |

The request queue of Baidu starts two requests at least 1100 ms apart in the standard edition and 110 ms apart in the advanced edition. The character limit of the extension is the one of the edition less 50, one line break for each of up to 50 paragraphs. A pair with Ukrainian, Turkish, Indonesian or Hindi outside the premium edition fails before any request.

Baidu blocks an IP address that uses several app IDs on the same day (code 58003); the panel asks for one app ID only. Baidu's FAQ advises against entering the key into third-party software. The extension stores it in the profile and sends it only to Baidu, as it does with every key.

### Youdao

The batch interface takes one `q` field per paragraph, with `signType=v3` and `curtime` in UTC seconds. The signature is the SHA-256 of app ID, input, salt, curtime and app secret, computed with Web Crypto. The input is the joined `q` values when they have at most 20 characters, else their first 10 characters, their length and their last 10. The characters are counted in code points, as the official Python and PHP examples do, so an emoji counts as one character. The documentation itself says "characters" only, and its Java, JavaScript and C# examples count UTF-16 units, in which most emoji count two; which one the service checks is still to be confirmed with an account (a batch with an emoji answers 202 when the count is wrong). A paragraph listed in `errorIndex` fails alone; the other paragraphs of the batch keep their translations.

Automatic detection of the batch interface knows 13 languages. A paragraph in another language fails and keeps the translation of another tier.

### Caiyun

The token goes in the header `X-Authorization: token <token>`. The paragraphs go in the `source` array, and `target` holds the translations in the same order. Caiyun translates only these directions:

- Simplified or Traditional Chinese with English, Japanese and Korean, both ways, and between the two scripts of Chinese.
- German, Spanish, French, Italian, Portuguese, Russian, Turkish and Vietnamese into Chinese.

Any other pair, English to Japanese for example, fails before a request. With automatic detection the target has to be Chinese, English, Japanese or Korean.

### Language codes and error codes

| Extension | DeepL target | Baidu | Youdao | Caiyun |
| --- | --- | --- | --- | --- |
| zh-CN | `ZH-HANS` | `zh` | `zh-CHS` | `zh` |
| zh-TW | `ZH-HANT` | `cht` | `zh-CHT` | `zh-Hant` |
| en | `EN-US` / `EN-GB` | `en` | `en` | `en` |
| ja | `JA` | `jp` | `ja` | `ja` |
| ko | `KO` | `kor` | `ko` | `ko` |
| fr, es, vi, ar | `FR`, `ES`, `VI`, `AR` | `fra`, `spa`, `vie`, `ara` | `fr`, `es`, `vi`, `ar` | `fr`, `es`, `vi` into Chinese; no Arabic |
| pt | `PT-BR` / `PT-PT` | `pt` | `pt` | `pt` into Chinese |
| uk, tr, id, hi | `UK`, `TR`, `ID`, `HI` | `ukr`, `tr`, `id`, `hi` (premium edition) | `uk`, `tr`, `id`, `hi` | `tr` into Chinese; no Ukrainian, Indonesian, Hindi |

The other languages of the list keep their code in all four services, where the service has them.

| Meaning | DeepL | Baidu | Youdao | What the user reads |
| --- | --- | --- | --- | --- |
| Key, app ID or signature refused | 403 | 52003, 54001, 90107 | 108, 110, 202 | "<service> rejected the key. Check the key and the app ID." |
| Quota used up | 456 | 54004 | 401 | "<service>: the quota of this account is used up." |
| Too many requests (tried again) | 429 | 54003, 54005 | 411, 412 | the code, with the advice to wait |
| Language pair not offered | | 58001 | 102 | "<service> does not translate this language pair." |
| Time stamp refused | | | 206 | "<service> refused the time stamp. Check the clock of this computer." |
| IP address blocked | | 58003 | | "<service> blocked this IP address for today. Use only one app ID." |

Baidu 52001 and 52002 and Youdao 207 are passing failures and are tried again. Any other code is shown with the message of the service.

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

## Image translation

Image translation ([settings.md](settings.md#image-translation)) needs a model that reads images. No API tells whether a model takes images, so `src/shared/vision.ts` matches model names, as the thinking switch does. A model reads images ("yes", sent without a word), does not ("no": nothing is sent, and the settings page and the popup name a model that does), or is unknown (sent; "Test image" on the settings page tells). Only models that the documentation of their service names as text-only count as "no", so an unknown name is never blocked.

| Preset | Default model | Reads images | Vision model to choose |
| --- | --- | --- | --- |
| OpenAI | `gpt-4.1-mini` | yes | the default |
| Anthropic | `claude-haiku-5-5` | yes | the default |
| Google Gemini | `gemini-2.5-flash-lite` | yes | the default |
| DeepSeek | `deepseek-flash` | yes (`deepseek-v4-pro` does not) | the default |
| xAI Grok | `grok-4.3` | yes, JPEG and PNG only | the default |
| Mistral AI | `mistral-small-latest` | yes | the default |
| OpenRouter | `openai/gpt-4.1-mini` | yes | the default |
| Volcengine Doubao | `doubao-seed-2-0-mini-260428` | yes | the default |
| Zhipu GLM | `glm-4-flash` | no | `glm-4.6v-flash` (free) |
| DashScope (Qwen) | `qwen-plus` | unknown | `qwen3-vl-plus` |
| SiliconFlow | `Qwen/Qwen2.5-7B-Instruct` | no | `Qwen/Qwen2.5-VL-72B-Instruct` |
| Moonshot / Kimi | `kimi-k2-turbo-preview` | unknown | `kimi-k3` |
| Ollama | `qwen2.5:7b` | no | `qwen3-vl:8b` |
| Groq | `llama-3.3-70b-versatile` | no | `qwen/qwen3.8-27b` (at most 3 images per request) |
| Together AI, Fireworks AI, DeepInfra, Cerebras | Llama and gpt-oss text models | no | one you choose |
| Azure OpenAI, LM Studio, custom | the name of the deployment or model | by the name: `gpt-4o`, `gpt-4.1`, `gpt-5`, `claude-`, `gemini-`, `-vl`, `vision`, `llava`, `gemma3` and similar names read images | one you choose |

GLM-4V-Flash takes no base64 image, the only form the extension sends, and counts as "no".

### How an image is sent

The image goes as a file part of the AI SDK with its media type (`{ type: "file", mediaType: "image/jpeg", data: { type: "data", data } }`); version 7.0.137 of `ai` deprecates the image part. The packages of the AI SDK turn it into the form of each API:

| Package | Request |
| --- | --- |
| `@ai-sdk/openai`, `@ai-sdk/openai-compatible` and the packages built on them | `image_url: { url: "data:<type>;base64,…" }` |
| `@ai-sdk/mistral` | `image_url` as a string holding the data URL |
| `@ai-sdk/anthropic` | an `image` block with `source: { type: "base64" }` |
| `@ai-sdk/google` | `inlineData` with `mimeType` |

"Image detail" goes to two services, in the form their package puts into the image: `providerOptions.openai.imageDetail` for OpenAI and `providerOptions.deepseek.imageDetail` for DeepSeek. `@ai-sdk/openai-compatible` spreads its options beside the image part, not into `image_url`, so Doubao and SiliconFlow get no detail. Zhipu's own example puts bare base64 into the `url` field, while the SDK sends a data URL; "Test image" shows whether Zhipu takes it.

An image with more than 40 megapixels, read from the header of its file before anything is decoded, is not sent; the images of a message are decoded one at a time. The extension uploads JPEG unless the settings choose WebP or PNG; xAI and Zhipu take JPEG and PNG only, and get JPEG for a WebP choice. One request carries one image of at most 1500 KB by default, under the limit of every service below:

| Service | Formats | Limit per image | Other limits |
| --- | --- | --- | --- |
| OpenAI | PNG, JPEG, WEBP, non-animated GIF | none stated | 512 MB and 1500 images per request; at most 30000 patches per image |
| Anthropic | JPEG, PNG, GIF, WebP | 10 MB (base64) | 8000 × 8000 px; at most 2000 px per side above 20 images per request |
| Gemini | PNG, JPEG, WEBP, HEIC, HEIF | 20 MB per request | 3600 images per request |
| Qwen (Model Studio) | BMP, JPEG, PNG, TIFF, WEBP, HEIC | 20 MB (Qwen3), else 10 MB | sides over 10 px, ratio at most 200:1 |
| Zhipu GLM-4.6V, 4.5V | jpg, png, jpeg | 5 MB, 6000 × 6000 px | |
| Doubao | JPEG, PNG, GIF, WEBP, BMP, TIFF, HEIC | 10 MB | 64 MB per request; sides over 14 px |
| xAI | jpg, jpeg, png | 20 MiB | |
| DeepSeek | JPEG, PNG, GIF, WebP | 32 MiB | 48 MiB per request; 8192 px per side |
| Ollama | depends on the model | | only base64 data URLs on `/v1`; `OLLAMA_ORIGINS` must allow `moz-extension://*` |

### Tokens of an image

The settings page estimates the input tokens of an image of 1024 × 768 pixels by the formula of the service:

| Models | Formula | 1024 × 768 |
| --- | --- | --- |
| OpenAI `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-5-mini`, `gpt-5-nano` | 32 px patches, `ceil(w/32) × ceil(h/32)`, times 1.62, 2.46, 1.2 or 1.5 | 1245, 1890, 922, 1152 |
| OpenAI `gpt-4o-mini` | 2833, plus 5667 per 512 px tile of the image fitted into 2048 × 2048 with its short side at most 768 px | 25501 (2833 with detail "low") |
| OpenAI `gpt-4o`, `gpt-4.1` | the same with 85 and 170 | 765 |
| Anthropic | `ceil(w/28) × ceil(h/28)`, at most 1568 | 1036 |
| Gemini 2.5 | 258 when both sides are 384 px or less, else 258 per 768 × 768 tile | 516 |
| Qwen3 (Model Studio) | one token per 32 × 32 pixels, plus 2 | 770 |
| Doubao seed 2.0 | `w × h / 1764`; 1280 with detail "high" | 446 (1280) |
| Mistral Small 3.2 and later | about `w × h / 784` | 1003 |

The prompts add about 450 tokens; the line on the settings page computes them from the prompt in use. For other models, DeepSeek included, the line gives the prompt tokens only.

Sources, checked on 2026-10-21: [OpenAI images and vision](https://developers.openai.com/api/docs/guides/images-vision), [Anthropic vision](https://platform.claude.com/docs/en/build-with-claude/vision), [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), [Qwen vision](https://help.aliyun.com/zh/model-studio/vision), [GLM-4.6V-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash), [Doubao image understanding](https://docs.volcengine.com/docs/ark/image-understanding), [xAI image understanding](https://docs.x.ai/docs/guides/image-understanding), [Mistral vision](https://docs.mistral.ai/studio/conversations/vision), [DeepSeek vision](https://api-docs.deepseek.com/guides/vision), [OpenRouter images](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding), [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [Kimi vision](https://platform.kimi.com/docs/guide/use-kimi-vision-model).

## Source language in requests

The source language is "Detect automatically" by default, or one of the 20 languages of the target language list. It goes to every service:

| Service | Automatic detection | Fixed language |
| --- | --- | --- |
| Google Translate | `sl=auto` | `sl=<code>` |
| Microsoft Translator, free and with key | no `from` parameter | `from=<code>` |
| DeepLX | `source_lang: "auto"` | `source_lang: "<code>"` (Chinese variants as `ZH`) |
| DeepL API | no `source_lang` | `source_lang: "<code>"` without variant |
| Baidu, Youdao | `from=auto` | `from=<code>` of the service |
| Caiyun | `trans_type: "auto2<target>"` with `detect: true` | `trans_type: "<source>2<target>"` |
| AI services | "Detect the source language of … and translate it into …" | "Translate … from <language> into …" |
| Dictionary | detected per paragraph | the language as set |
| Bergamot | detected per paragraph; the paragraphs of each language are translated together | the language as set |

Prompts sent to AI services always use the English name of a language, because models follow English instructions most reliably. How paragraphs are skipped and how Chinese variants are handled is described in [settings.md](settings.md#source-language).
