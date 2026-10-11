# Thunderbird Translate

[中文](README.md)

Thunderbird Translate is a Thunderbird extension that translates the body of the message you are reading, in place. Translations appear under each paragraph (bilingual) or replace it (translation only); turning translation off restores the original message exactly. Google Translate (free) is the default and needs no setup. You can also use 22 AI providers through the Vercel AI SDK.

## Features

- Paragraph detection for HTML and plain-text mail: paragraphs, list items, table cells, headings, quotes, text-only divs and blank-line separated paragraphs in plain text. Code, paragraphs already in the target language, numbers, bare links and whitespace are skipped.
- Bilingual or translation-only display, switchable while a translation is shown; switching re-renders from translations already received.
- Message header toolbar button with a popup, shortcuts Alt+A (translate / show original) and Alt+S (switch display mode), optional automatic translation of messages not in the target language.
- Request batching in the background: paragraphs arriving within 50 ms are merged into one request, with a concurrency limit, retries with exponential backoff, and an in-memory plus `storage.local` LRU cache.
- Free services: Google Translate, Microsoft Translator, DeepLX (self-hosted endpoint).
- AI providers: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, xAI Grok, Groq, Mistral, Ollama, OpenRouter, Together AI, Fireworks, DeepInfra, Cerebras, Perplexity, Moonshot/Kimi, Zhipu GLM, Qwen/DashScope, SiliconFlow, Volcengine Doubao, Azure OpenAI, LM Studio and any OpenAI-compatible endpoint. Endpoint, API key, model, temperature and system prompt are configurable; the settings page has a connection test.
- UI in English and Simplified Chinese.

## Install

Download `thunderbird-translate-<version>.xpi` from Releases, open Tools → Add-ons and Themes in Thunderbird, click the gear icon and choose "Install Add-on From File". Thunderbird 128 or later is required.

To build from source (Node.js 22+):

```bash
npm ci
npm test
npm run build   # dist/ and web-ext-artifacts/thunderbird-translate-<version>.xpi
```

## Why batching saves cost

With a system prompt of $s$ tokens, $N$ paragraphs of $t$ tokens each and batches of $B$ paragraphs, per-paragraph requests send $N(s+t)$ input tokens in $N$ requests, while batching sends $\lceil N/B \rceil s + N(t+c)$ tokens in $\lceil N/B \rceil$ requests, where $c$ is the small numbering overhead per paragraph. For $s=150$, $t=60$, $c=10$, $N=20$ this is 1550 instead of 4200 input tokens and one request instead of twenty. If a model's batched answer cannot be parsed into the right number of translations, that batch falls back to one request per paragraph.

## Privacy

API keys are stored only in the profile's `storage.local` and are sent only to the matching provider endpoint. Content scripts never receive keys. Message text is sent only to the selected translation service. There is no telemetry.

## Acknowledgements

The design of paragraph detection, batching, prompts and provider configuration follows [Read Frog](https://github.com/mengxi-ream/read-frog) (GPL-3.0).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
