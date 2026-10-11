# Thunderbird Translate

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 日本語 | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

Thunderbird Translate は、閲覧中のメッセージ本文をメッセージペイン内でそのまま翻訳する Thunderbird 拡張機能です。訳文は原文の各段落の下に表示する（対訳表示）ことも、原文と置き換える（訳文のみ）こともできます。翻訳をオフにすると、メッセージは元の状態に正確に戻ります。既定の翻訳サービスは Google 翻訳（無料）で、インストール直後から使えます。OpenAI、Claude、Gemini、DeepSeek、Qwen など 22 の AI プロバイダーにも接続できます。

この文書は、Thunderbird 拡張機能を使ったことがない読者を想定しています。インストール、使い方、設定、仕組みの順に説明します。

## 機能

- 本文の翻訳: メッセージ本文から段落単位のコンテンツを検出します。対象は段落、リスト項目、表のセル、見出し、引用ブロック、テキストだけを含む div、プレーンテキストメールの空行で区切られた段落です。コード、すでに翻訳先の言語で書かれた段落、数値、URL だけのリンク、空白は翻訳しません。
- 2 つの表示方法: 対訳表示では、原文の下に左側へ薄い罫線を付けた訳文ブロックを挿入します。ダークテーマでも読めます。訳文のみの表示では、原文を訳文で置き換えます。原文はメモリーに保持され、翻訳をオフにすると元に戻ります。
- 即時反映: メッセージの翻訳中や翻訳後に表示方法や翻訳先の言語を変更すると、メッセージを開き直さずにページを再描画します。表示方法の変更では、受信済みの訳文から描画し直すため、新しいリクエストは送信しません。
- 操作方法: メッセージヘッダーのツールバーにある「メッセージを翻訳」ボタンとそのポップアップ、ショートカットキー Alt+A（翻訳 / 原文を表示）と Alt+S（対訳表示 / 訳文のみを切り替え）を使います。
- 自動翻訳（任意）: 翻訳先の言語以外のメッセージを、開いた時点で翻訳します。
- リクエストのバッチ処理: バックグラウンドスクリプトが段落を 50 ミリ秒間集め、1 回のリクエストにまとめます。同時実行数の制限、指数バックオフによる再試行、ローカルキャッシュも備えています。
- 翻訳サービス: 無料またはセルフホストの翻訳サービス 3 種と、AI プロバイダーのプリセット 22 種を利用できます。プリセットの 1 つは「カスタム OpenAI 互換」です。
- 12 言語のインターフェース: 表示言語は既定で Thunderbird に合わせ、設定ページで選択することもできます。

## インストール

### Releases からインストールする

1. このリポジトリの Releases ページから最新の `thunderbird-translate-<version>.xpi` をダウンロードします。
2. Thunderbird で ツール → アドオンとテーマ を開きます（右上の ≡ メニューからも開けます）。
3. 拡張機能一覧の上にある歯車アイコンをクリックし、「ファイルからアドオンをインストール...」を選んで、ダウンロードした xpi ファイルを選択し、確認します。

Thunderbird 128 以降が必要です。

### ソースからビルドする

Node.js 22 以降が必要です（開発には Node 24 と npm 11 を使用しています）。

```bash
npm ci
npm test
npm run build
```

`npm run build` は、esbuild でバックグラウンドスクリプト、コンテンツスクリプト、ポップアップ、設定ページを `dist/` にバンドルし、`locales/` のファイルから `dist/_locales/<language>/messages.json` を生成して、`dist/` を `web-ext-artifacts/thunderbird-translate-<version>.xpi` にパッケージ化します。パッケージ化には純粋な JavaScript で書かれた fflate ライブラリを使うため、システムの zip コマンドは不要です。

開発中はパッケージ化せずに拡張機能を読み込めます。Thunderbird で ツール → 開発ツール → アドオンをデバッグ を開き、「一時的なアドオンを読み込む...」をクリックして `dist/manifest.json` を選択します。

## 使い方

メッセージを開くと、メッセージヘッダーのツールバーに「メッセージを翻訳」ボタンが表示されます。クリックすると、次の項目を含むポップアップが開きます。

- 「このメッセージを翻訳」: 翻訳を開始します。翻訳の実行中または訳文の表示中は、ボタンの表示が「原文を表示」に変わり、クリックすると原文に戻ります。
- 表示方法: 対訳表示と訳文のみを切り替えます。変更は表示中のメッセージにすぐ反映されます。
- 翻訳先の言語: 変更すると、翻訳中のメッセージは新しい言語で翻訳し直されます。
- 翻訳サービス: 使用するサービスを選択します。
- 翻訳先の言語以外のメッセージを自動的に翻訳する: オンにすると、本文が翻訳先の言語以外で書かれたメッセージを、開いた時点で翻訳します。

ポップアップには「翻訳済み: 8 / 12」のように進行状況が表示されます。段落の翻訳に失敗すると、その段落の後ろに赤い「翻訳に失敗しました。クリックして再試行」が表示されます。マウスポインターを重ねるとエラー内容が表示され、クリックするとその段落を再試行します。

Alt+A は表示中のメッセージを翻訳するか、原文に戻します。Alt+S は対訳表示と訳文のみを切り替えます。どちらのショートカットキーも、アドオンマネージャーの歯車メニューにある「拡張機能のショートカットキーを管理」で変更できます。

訳文のみの表示では、訳文にマウスポインターを重ねると原文がツールチップに表示されます。

## 設定

アドオンマネージャーでこの拡張機能の「設定」ボタンをクリックすると、設定ページが開きます。設定は自動的に保存され、書き込みが終わると右上に「保存しました」と表示されます。

| セクション | 内容 |
| --- | --- |
| 一般 | 表示言語、翻訳先の言語、既定の表示方法、使用中のサービス、自動翻訳 |
| 翻訳サービス | 各サービスのエンドポイント、API キー、モデル、温度。「接続テスト」ボタンと「このサービスを使用」ボタン |
| システムプロンプト | AI サービス用のカスタムシステムプロンプト。`{{to}}` は翻訳先の言語名に置き換えられます。空欄の場合は組み込みのプロンプトを使います |
| リクエストのバッチ処理 | 収集時間、1 リクエストあたりの最大文字数と最大段落数、同時リクエスト数、再試行回数、AI リクエストをまとめるかどうか |
| 訳文のスタイル | 左罫線、左破線、背景ハイライト、装飾なし。アクセントカラー、文字の不透明度、文字サイズの比率。リアルタイムのプレビュー |
| キャッシュ | キャッシュのオン / オフ、キャッシュする最大段落数、現在のエントリー数、キャッシュの消去 |

「接続テスト」は、入力欄に現在入っている値でテスト用の文を 1 つ送信します。成功すると訳文を表示し、失敗するとサービスが返したエラーを表示します。たとえば無効なキーや存在しないモデル名がエラーになります。

## 表示言語

「一般」セクションの「表示言語」には 2 種類の値があります。

- 「Thunderbird に合わせる」（既定）: Thunderbird 自体の表示言語に最も近い対応言語を使います。選択肢のラベルには、現在選ばれている言語が「Thunderbird に合わせる（Deutsch）」のように表示されます。
- 12 の対応言語のいずれか: Thunderbird の言語にかかわらず、その言語を使います。

この設定は、ポップアップ、設定ページ、メッセージ内のラベル（「翻訳中…」「翻訳に失敗しました。クリックして再試行」）、エラーメッセージ、接続テストの結果、ツールバーボタンのツールチップに適用されます。開いている設定ページやポップアップの文字列はすぐに切り替わります。すでに翻訳済みのメッセージ内のラベルは、次に描画されるときに切り替わります。

一部の文字列は Thunderbird 自体が拡張機能のマニフェストから読み込むため、常に Thunderbird の表示言語に従います。対象は、アドオンマネージャーに表示される拡張機能の名前と説明、「拡張機能のショートカットキーを管理」に表示されるショートカットの説明です。設定ページでは、この選択肢の下にこのことを記載しています。

「Thunderbird に合わせる」は、Thunderbird の言語を次のように対応付けます。

| Thunderbird の言語 | 使用される表示言語 |
| --- | --- |
| `zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant` | 繁体字中国語 |
| その他の `zh-*` | 簡体字中国語 |
| `pt-*` | ポルトガル語（ブラジル） |
| `en-*`、`ja`、`ko`、`fr-*`、`de-*`、`es-*`、`ru`、`tr`、`vi` | 主言語サブタグが同じ言語 |
| その他の言語 | 英語 |

翻訳先の言語の一覧では、各言語の名前を表示言語で示し、その後にその言語自身での名前を続けます。たとえば「ドイツ語（Deutsch）」のように表示されます。AI サービスに送るプロンプトでは、常に英語の言語名を使います。モデルは英語の指示に最も確実に従うためです。

初回インストール時には、表示言語に基づいて翻訳先の言語を設定します。日本語の Thunderbird では翻訳先の言語が日本語に、英語の Thunderbird では英語になります。すでに設定されている翻訳先の言語は上書きしません。

## 対応する表示言語

| コード | 言語 |
| --- | --- |
| `en` | English（英語） |
| `zh_CN` | 简体中文（簡体字中国語） |
| `zh_TW` | 繁體中文（繁体字中国語） |
| `ja` | 日本語（日本語） |
| `ko` | 한국어（韓国語） |
| `fr` | Français（フランス語） |
| `de` | Deutsch（ドイツ語） |
| `es` | Español（スペイン語） |
| `pt_BR` | Português (Brasil)（ポルトガル語、ブラジル） |
| `ru` | Русский（ロシア語） |
| `tr` | Türkçe（トルコ語） |
| `vi` | Tiếng Việt（ベトナム語） |

翻訳先の言語の一覧はこれとは別で、イタリア語、ウクライナ語、ポーランド語、オランダ語、タイ語、インドネシア語、アラビア語、ヒンディー語を含む 20 言語があります。

## 翻訳サービスの設定

### 無料およびセルフホストのサービス

| サービス | 設定 | 備考 |
| --- | --- | --- |
| Google 翻訳（無料、既定） | 不要 | `translate.googleapis.com` の `client=gtx` エンドポイントを呼び出します。1 回の POST に複数の `q` パラメーターを含めるため、複数の段落が 1 回のリクエストを共有します |
| Microsoft Translator（無料） | 不要 | まず `edge.microsoft.com/translate/auth` からトークンを取得して `api-edge.cognitive.microsofttranslator.com` を呼び出そうとします。Microsoft がトークンエンドポイントを廃止している場合は `edge.microsoft.com/translate/translatetext` に切り替えます。どちらの経路も配列をそのまま受け付けます |
| DeepLX | エンドポイントが必要 | セルフホストまたはサードパーティの DeepLX サービスです。トークンは任意です。エンドポイントに `{{apiKey}}` が含まれる場合はその部分をトークンで置き換え、含まれない場合は `Authorization: Bearer` として送信します |

### AI プロバイダー

すべての AI プロバイダーは、Vercel AI SDK の `generateText` を通じて呼び出します。公式の `@ai-sdk/*` パッケージがあるプロバイダーはそのパッケージを使い、それ以外は `@ai-sdk/openai-compatible` を使います。エンドポイント、API キー、モデル、温度はすべてのプロバイダーで変更できます。モデル欄には一般的なモデルが候補として表示され、任意のモデル名も入力できます。

| プロバイダー | SDK パッケージ | 既定のエンドポイント | 既定のモデル | キー |
| --- | --- | --- | --- | --- |
| OpenAI | `@ai-sdk/openai` | `https://api.openai.com/v1` | `gpt-4.1-mini` | 必要 |
| Anthropic Claude | `@ai-sdk/anthropic` | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | 必要 |
| Google Gemini | `@ai-sdk/google` | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash-lite` | 必要 |
| DeepSeek | `@ai-sdk/deepseek` | `https://api.deepseek.com` | `deepseek-chat` | 必要 |
| xAI Grok | `@ai-sdk/xai` | `https://api.x.ai/v1` | `grok-3-mini` | 必要 |
| Groq | `@ai-sdk/groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | 必要 |
| Mistral AI | `@ai-sdk/mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest` | 必要 |
| Ollama（ローカル） | `@ai-sdk/openai-compatible` | `http://localhost:11434/v1` | `qwen2.5:7b` | 不要 |
| OpenRouter | `@ai-sdk/openai-compatible` | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | 必要 |
| Together AI | `@ai-sdk/togetherai` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 必要 |
| Fireworks AI | `@ai-sdk/fireworks` | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` | 必要 |
| DeepInfra | `@ai-sdk/deepinfra` | `https://api.deepinfra.com/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 必要 |
| Cerebras | `@ai-sdk/cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | 必要 |
| Perplexity | `@ai-sdk/perplexity` | `https://api.perplexity.ai` | `perplexity/sonar` | 必要 |
| Moonshot / Kimi | `@ai-sdk/moonshotai` | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | 必要 |
| 智谱 GLM (Zhipu) | `@ai-sdk/openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | 必要 |
| 通义千问 / 阿里云百炼 (DashScope) | `@ai-sdk/alibaba` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 必要 |
| 硅基流动 SiliconFlow | `@ai-sdk/openai-compatible` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | 必要 |
| 火山引擎豆包 (Volcengine Ark) | `@ai-sdk/openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | 必要 |
| Azure OpenAI | `@ai-sdk/azure` | 入力が必要 | `gpt-4.1-mini` | 必要 |
| LM Studio（ローカル） | `@ai-sdk/openai-compatible` | `http://localhost:1234/v1` | `qwen2.5-7b-instruct` | 不要 |
| カスタム OpenAI 互換 | `@ai-sdk/openai-compatible` | 入力が必要 | 入力が必要 | 不要 |

一部のプロバイダーには追加の要件があります。

- Anthropic Claude: 拡張機能はヘッダー `anthropic-dangerous-direct-browser-access: true` を付加します。Anthropic は、ブラウザーのコンテキストから送られるリクエストにこのヘッダーを求めます。Claude 5 シリーズと Opus 4.7、4.8 はカスタムの温度を受け付けないため、拡張機能はこれらのモデルに温度を送信せず、既定のモデルの温度欄は空欄になっています。
- Azure OpenAI: エンドポイントは `https://<resource>.openai.azure.com/openai` の形式で、モデル欄にはデプロイ名を入力します。
- Ollama: Ollama は既定で、拡張機能のページからのクロスオリジンリクエストを拒否します。環境変数 `OLLAMA_ORIGINS=moz-extension://*` を指定して Ollama を起動してください。
- Moonshot: 既定のエンドポイントは中国向けサイトの `api.moonshot.cn` です。国際版サイトのアカウントでは `https://api.moonshot.ai/v1` を使います。
- Volcengine Doubao: モデル欄には、モデル名か、Ark コンソールで作成した推論エンドポイントの ID を入力します。

## バッチ処理の仕組み

1 通のメッセージには、通常 10 から数十の段落があります。段落ごとに 1 回のリクエストを送ると、各段落がシステムプロンプトと指示のコピーをそれぞれ持ち、各段落がレート制限のリクエスト 1 回分を消費します。バッチ処理では、近いタイミングで届いた段落を 1 回のリクエストにまとめます。これにより、この 2 つのコストは段落ごとではなくバッチごとにかかるようになります。

### 処理の流れ

1. コンテンツスクリプトが、翻訳対象のすべての段落をバックグラウンドスクリプトに渡します。
2. バックグラウンドスクリプトはまずキャッシュを検索し、ヒットした場合はそのまま応答します。キャッシュキーは、プロバイダー、モデル、翻訳先の言語、システムプロンプトのシグネチャー、段落テキストのハッシュで構成されます。同じテキストがすでに翻訳中の場合、後続のリクエストは同じ結果を共有します。
3. キャッシュにない段落はバッチキューに入り、プロバイダー + モデル + エンドポイント + 翻訳先の言語の組み合わせごとにグループ化されます。1 つのグループの段落は 50 ミリ秒間蓄積されます。グループが送信されるのは、収集時間が終わったとき、段落数の上限に達したとき、または次の段落を加えると文字数の上限を超えるときです。文字数の上限より長い段落は、単独で 1 つのバッチになります。
4. リクエストキューが各バッチを実行します。同時実行数を制限し、429、5xx、ネットワークエラーを指数バックオフで再試行します。サーバーが `Retry-After` を返した場合は、その時間だけ待機します。401 や 400 などのエラーは再試行せずに報告します。
5. 結果はメモリー上のキャッシュに入り、1 秒後にまとめて 1 回で `storage.local` に書き込まれます。キャッシュは最も長く使われていない（LRU）エントリーから削除します。

### 各サービスでの段落のまとめ方

- Google: 複数の `q` パラメーターを含む 1 回の POST を送ります。返される配列は入力と 1 対 1 で対応します。
- Microsoft: リクエスト本文そのものが配列です。
- DeepLX: エンドポイントは 1 回のリクエストで 1 段落しか受け付けないため、バッチ内の段落を並行してリクエストします。
- AI プロバイダー: 段落に番号を付けて 1 つのメッセージにまとめ、同じ長さの JSON 配列を返すようモデルに指示します。パーサーは次の順に解析を試みます。JSON 配列（コードブロック内にある場合や説明文に囲まれている場合も含みます。文字列内の改行や末尾のカンマは修復します）、番号付きの `<seg>` ブロック、番号付きの行、`%%` 区切り文字です。すべて失敗した場合や件数が一致しない場合は、そのバッチを 1 段落ずつのリクエストで送り直します。ユーザーから見た結果は同じです。認証エラーなど解析エラー以外のエラーではこのフォールバックを行わないため、同じエラーが N 回繰り返されることはありません。

### コストの見積もり

システムプロンプトと指示のトークン数を $s$、1 段落あたりの平均トークン数を $t$、段落の総数を $N$、バッチサイズを $B$、番号付けと JSON の引用符のために段落ごとに増えるトークン数を $c$ とします。

段落ごとに 1 回のリクエストを送る場合、入力トークンの合計は次のとおりです。

$$
I_{\text{single}} = N(s + t).
$$

バッチ処理ではリクエスト数が $\lceil N/B \rceil$ 回になり、入力トークンの合計は次のとおりです。

$$
I_{\text{batch}} = \left\lceil \frac{N}{B} \right\rceil s + N(t + c).
$$

両者の差は次のとおりです。

$$
I_{\text{single}} - I_{\text{batch}} = \left(N - \left\lceil \frac{N}{B} \right\rceil\right) s - Nc.
$$

$s$ が $c$ より十分に大きい限り、バッチが大きいほど節約量が増えます。$s = 150$、$t = 60$、$c = 10$、$N = 20$、$B = 30$ の場合は次のようになります。

$$
I_{\text{single}} = 20 \times 210 = 4200, \qquad I_{\text{batch}} = 150 + 20 \times 70 = 1550.
$$

入力トークンは約 63% 減り、リクエスト数は 20 回から 1 回に減ります。訳文の長さは変わらないため、出力トークンはどちらの場合もほぼ同じです。リクエスト数の削減は無料エンドポイントでも効果があります。Google と Microsoft は無料エンドポイントをリクエストの頻度で制限しており、20 段落のメッセージが 1 回のリクエストで済みます。

## プライバシー

- API キーは現在の Thunderbird プロファイルの `storage.local` にのみ保存され、対応するプロバイダーのエンドポイントへのリクエストでのみ送信されます。
- コンテンツスクリプトはメッセージページ内で動作します。コンテンツスクリプトがバックグラウンドスクリプトから受け取る設定には、キーは含まれません。
- メッセージのテキストは、現在選択している翻訳サービスにのみ送信されます。拡張機能は統計情報を収集せず、翻訳サービス以外のネットワークアドレスには接続しません。
- 翻訳キャッシュはローカルに保存され、設定ページでオフにしたり消去したりできます。
- メッセージのテキストはコンピューターの外に出て、選択した翻訳サービスに送られます。機密性の高いメールには、Ollama や LM Studio などのローカルモデルを使うと、すべてのリクエストが自分のマシン内で完結します。

## 既知の制限事項

- 訳文はプレーンテキストです。原文のリンク、太字などのインライン書式は訳文に引き継がれません。対訳表示では原文をそのまま操作できます。訳文のみの表示では、マウスポインターを重ねて原文を確認するか、対訳表示に切り替えてください。
- Google と Microsoft の無料エンドポイントは公式に文書化されておらず、仕様変更やレート制限の対象になることがあります。Microsoft は 2026 年 7 月にトークンエンドポイント `edge.microsoft.com/translate/auth` を廃止しました（404 を返します）。拡張機能は最初のリクエストでトークンエンドポイントを試し、失敗すると直接エンドポイントに切り替え、その後 1 時間はトークンエンドポイントを再度試しません。
- 段落がすでに翻訳先の言語で書かれているかを判定する際、中国語、日本語、韓国語などの文字体系は文字種で判定し、ラテン文字の言語はまず拡張機能 API の `i18n.detectLanguage` を使います。この API が使えない場合や結果の信頼性が低い場合、確実に判定できるのは英語だけです。その他のラテン文字の言語の段落は、通常どおり翻訳に送られます。
- コンテンツスクリプトは `messageDisplayScripts` で登録され、登録後に開いたメッセージにのみ適用されます。拡張機能は起動時に、すでに開いているメッセージへの挿入を試みます。失敗した場合は、メッセージを選択し直せば適用されます。
- 拡張機能自身が生成するエラーメッセージは翻訳されます。翻訳サービスや AI SDK が返すエラー文（HTTP 401 応答の本文など）は受け取ったまま表示され、通常は英語です。
- 拡張機能の名前、アドオンマネージャーに表示される説明、ショートカットの説明は、表示言語の設定ではなく Thunderbird の表示言語に従います。

## テスト

```bash
npm test               # vitest unit tests
npm run typecheck      # TypeScript type check
npm run locales:check  # check every locales/<language>.json against locales/en.json
npm run live-test      # call the real Google and Microsoft endpoints through the extension's own modules
```

ユニットテストの対象は次のとおりです。バッチのグループ化とキュー、AI 出力の解析とフォールバック、段落の検出と対訳表示・訳文のみの描画および復元（jsdom 上）、Google、Microsoft、DeepLX のリクエスト構築と応答解析（fetch をモック化）、各 AI プリセットのリクエスト URL と認証ヘッダー、ローカライズです。ローカライズのテストでは、全言語でキーの集合とプレースホルダーが一致すること、マニフェスト内のすべての `__MSG_*__` 参照、Thunderbird の言語から対応言語への対応付け、キーが欠けている場合の英語へのフォールバック、HTML ページとソースにインターフェースの文字列が直接書かれていないことを確認します。

`npm run build:debug` はデバッグ用の xpi を生成します。この xpi はメッセージを開くとすぐに翻訳を開始し、進行状況をコンソールに出力します。実際の Thunderbird で一連の流れを確認するときに使います。

## プロジェクト構成

```
src/
  background/    background script: translation service, batch and request queues, cache, provider factory, translators
  content/       content script: paragraph detection, rendering, language detection, translation state
  popup/         popup
  options/       settings page
  shared/        shared settings, provider presets, language table, message types, i18n runtime
locales/         interface text, one JSON file per language; en.json is the reference
static/          manifest.json, HTML, CSS, SVG icon
scripts/         build, locale generation and checks, live endpoint test
readmes/         translated versions of this README
tests/           vitest tests
```

## インターフェースの翻訳

インターフェースの文字列は `locales/<language>.json` にあり、言語ごとにキー → 文字列のフラットなオブジェクトを 1 つ持ちます。`locales/en.json` が基準で、他のすべてのファイルはまったく同じキーを持ちます。`$1` から `$9` は置換文字列で、各訳文に英語と同じ番号で含める必要があります。`{{apiKey}}` と `{{to}}` はそのまま残すリテラルのトークンです。Google 翻訳、OpenAI、DeepLX などの製品名は翻訳しません。

`npm run build` は、これらのファイルを Thunderbird が読み込む形式の `dist/_locales/<language>/messages.json` に変換します。拡張機能独自の i18n ランタイムが実行時に同じファイルを読み込むため、Thunderbird を再起動せずに表示言語を変更できます。欠けているキーは英語にフォールバックします。

言語を追加するには、すべてのキーを含む `locales/<code>.json` を作成し、`src/shared/locales.ts` の `SUPPORTED_LOCALES` にそのコードと言語自身での名前を追加して、`npm run locales:check` と `npm test` を実行します。

## 謝辞

段落の検出、バッチキュー、プロンプト、プロバイダー設定の設計は、GPL-3.0 で公開されている Web ページ翻訳用ブラウザー拡張機能 [Read Frog](https://github.com/mengxi-ream/read-frog) を参考にしています。このプロジェクトはこれらの考え方を Thunderbird のメッセージリーダーに移し、メール向けに調整しています。たとえば、プレーンテキストメールを空行で分割したり、ハードラップされた行を連結したりします。

## ライセンス

GPL-3.0-or-later。全文は [LICENSE](../LICENSE) を参照してください。
