# Request batching

A message usually has between ten and a few dozen paragraphs. With one request per paragraph, every paragraph carries its own copy of the system prompt and instructions, and every paragraph uses one request from the rate limit. Batching merges paragraphs that arrive close together into one request, so both costs are paid per batch instead of per paragraph.

The batch queue and the request queues live in `src/background/queue/`. The settings that control them are in the "Request batching" section of the settings page, see [settings.md](settings.md#request-batching-and-timeouts).

## Contents

- [Flow](#flow)
- [Long paragraphs](#long-paragraphs)
- [Request queues and retries](#request-queues-and-retries)
- [Timeouts](#timeouts)
- [How each service merges paragraphs](#how-each-service-merges-paragraphs)
- [Cost estimate](#cost-estimate)

## Flow

1. The content script hands every paragraph to be translated to the background script, once for all tiers in use.
2. For each tier the background script looks up the cache first and answers directly on a hit.
3. Paragraphs not in the cache enter the batch queue, grouped by service settings.
4. Paragraphs of one group accumulate for 50 ms (the collection window). A group is sent when the window ends, when the paragraph limit is reached, or when the next paragraph would exceed the character limit.
5. Each service sends its batches through its own request queue.
6. Results go to the in-memory cache and are written to `storage.local` in one write after 1 second. The cache evicts the least recently used (LRU) entries.

The cache key consists of the provider, the model, the source and target language, one hash of everything else that shapes the result, and a hash of the paragraph text. That hash covers:

- the endpoint, and for Microsoft Translator free or key mode;
- for AI services, the kind of prompt and its text, the thinking switch and the temperature;
- for the dictionary and Bergamot, the installed packs or models and their versions;
- in precise mode, the message.

Changing any of these never returns a translation made with the old setting. A dictionary or Bergamot translation is cached only if the installed packs or models are the same when it ends as when it started; a pack or model installed or removed in between could already have been used. When the same text is already being translated, later requests share the same result. A request that failed or timed out is dropped, and the next request starts a new one. "Retranslate" (Alt+R) skips both the cache and requests still running, see [settings.md](settings.md#retranslate-and-the-cache).

A batch group is defined by provider, model, endpoint, source language and target language. AI services are also grouped by prompt, thinking switch and temperature, Microsoft Translator by free or key mode, and in precise mode by message. Batches never mix paragraphs of different groups.

## Long paragraphs

A paragraph longer than the character limit is split into pieces that fit.

1. A piece takes whole lines, line breaks included, as long as they fit. When the next line does not fit, the piece ends at its last line break.
2. A single line longer than the limit is cut between sentences (`Intl.Segmenter`).
3. A sentence longer than the limit is cut by length.

Whitespace at the start of the paragraph is not sent and is put back in front of the translation. The pieces are translated like paragraphs and joined in their order: with the line break where they were cut at one, otherwise with a space (none for Chinese and Japanese). The cache holds the whole paragraph.

A quoted reply of 60 lines and 3,900 characters, for example, goes out as two pieces cut at a line break with the default limit of 3,000 characters, instead of 60 one-line requests.

## Request queues and retries

Each service has its own request queue, so a slow AI service never holds back the dictionary or the machine translator. The queue limits the concurrent requests of its service (4 by default).

The queue retries 408, 429, 5xx and network errors with exponential backoff, up to the number of retries in the settings (3 by default). When the server sends `Retry-After`, the queue waits for that time, up to 30 seconds. Errors such as 401 and 400 are reported without retrying.

## Timeouts

A request whose answer, body included, has not arrived after the request timeout is cancelled. The default request timeout is 60 seconds. What follows depends on the service:

| Service | Timeout | After a timeout |
| --- | --- | --- |
| Google, Microsoft, DeepLX | the request timeout of the settings | one more attempt, when the number of retries is at least 1; the error names the time of both attempts, for example "no answer within 120 s" |
| AI services, including the analysis of precise translation and "Test connection" | the request timeout; three times as long for Ollama, LM Studio and any model with thinking mode on | no further attempt, because a model that was too slow once is too slow again and every attempt is charged; the error names the time waited, for example "no answer within 180 s" |

Every timeout error comes with a hint to raise the timeout.

The offline Bergamot engine terminates its worker when a translation does not answer within 2 minutes, or loading a model within 5 minutes. The next request starts a fresh worker. After two timeouts in a row, offline translations fail at once for one minute with a message saying so, instead of each waiting for its own timeout.

## How each service merges paragraphs

| Service | How a batch is sent |
| --- | --- |
| Dictionary, Bergamot | one local call for the whole batch; every paragraph gets its own result, so a paragraph whose language has no pack or model fails alone |
| Google Translate | one POST with several `q` parameters; the returned array matches the input one to one |
| Microsoft Translator | the request body is an array of paragraphs |
| DeepLX | one paragraph per request; the paragraphs of a batch are requested concurrently |
| AI providers | the paragraphs are numbered and put into one message; the model is asked to return a JSON array of the same length |

The services other than AI cap a batch regardless of the settings, for example DeepLX at 50 paragraphs and Microsoft with an Azure key at 1000 paragraphs and 50000 characters; the full table is in [settings.md](settings.md#request-batching-and-timeouts).

With automatic detection, Bergamot detects the language of each paragraph and translates the paragraphs of each language together. The browser's detector is asked from 12 letters on; its answer counts when it is reliable and covers at least 60 % of the text. A paragraph it does not place, a shorter one included, is named by its script and, in Latin script, by English stop words. A paragraph that none of these place takes the language found most often in the batch, else English. The dictionary detects the same way, but treats a paragraph it cannot place as English.

When a Google answer has an unexpected shape, the batch is requested again one paragraph per request through the same request queue, with its concurrency limit and retries. A failure then affects its paragraph only.

The parser of AI answers tries these formats in order:

1. a JSON array, possibly inside a code block or surrounded by explanations; bare newlines inside strings and trailing commas are repaired;
2. numbered `<seg>` blocks;
3. numbered lines;
4. the `%%` separator.

If all of them fail, the count does not match, or a translation is empty while its paragraph has letters or digits, that batch is sent again one paragraph per request, and the user sees the same result. Errors other than parsing errors, such as authentication failures, do not trigger this fallback, so the same error is not repeated N times. With "Merge paragraphs into one AI request" turned off in the settings, every AI request carries a single paragraph.

## Cost estimate

Let the system prompt and instructions take $s$ tokens, each paragraph $t$ tokens on average, with $N$ paragraphs in total, a batch size of $B$, and $c$ extra tokens per paragraph for numbering and JSON quotes.

With one request per paragraph, the total number of input tokens is

$$
I_{\text{single}} = N(s + t).
$$

With batching there are $\lceil N/B \rceil$ requests, and the total number of input tokens is

$$
I_{\text{batch}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

The difference is

$$
I_{\text{single}} - I_{\text{batch}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

As long as $s$ is clearly larger than $c$, larger batches save more. With $s = 150$, $t = 60$, $c = 10$, $N = 20$ and $B = 30$:

$$
I_{\text{single}} = 20 \times 210 = 4200, \qquad I_{\text{batch}} = 150 + 20 \times 70 = 1550.
$$

Input tokens drop by about 63%, and the number of requests drops from 20 to 1. Output tokens are about the same in both cases, since the length of the translation does not change.

Fewer requests matter for the free endpoints as well. Google and Microsoft limit their free endpoints by request rate, and a 20-paragraph message takes a single request.

Every tier in use sends its own requests. With the AI tier and the machine tier both in use, each message also costs requests to the machine translator, which count against the rate limits of the free Google and Microsoft endpoints.
