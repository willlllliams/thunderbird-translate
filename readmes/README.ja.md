# マルチ翻訳 for Thunderbird

マルチ翻訳 for Thunderbird は、閲覧中のメッセージ本文をメッセージペイン内でそのまま翻訳する Thunderbird 拡張機能です。インストール後は、無料の Google 翻訳ですぐに使えます。バージョン 1.13 までの名前は Thunderbird Translate です。

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 日本語 | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md)

![辞書、機械翻訳、AI 翻訳の訳文が順に表示される](../docs/media/tiers-en.gif)

紹介動画：[YouTube](https://www.youtube.com/watch?v=OZmiMGeuhJ0)（1 分）· [bilibili](https://www.bilibili.com/video/BV1JaWw6YENX)（2 分）

## 目次

- [機能](#機能)
- [インストール](#インストール)
- [クイックスタート](#クイックスタート)
- [使い方](#使い方)
- [翻訳の段階](#翻訳の段階)
- [翻訳サービス](#翻訳サービス)
- [プロンプト](#プロンプト)
- [プライバシー](#プライバシー)
- [既知の制限](#既知の制限)
- [ドキュメント](#ドキュメント)
- [謝辞](#謝辞)
- [ライセンス](#ライセンス)

## 機能

- HTML メールの段落、リスト項目、表のセル、見出し、引用と、プレーンテキストメールの空行で区切られた段落を翻訳します。コード、数値、URL だけのリンク、すでに翻訳先の言語で書かれた段落は翻訳しません。 件名も翻訳され、本文の上の行に表示されます（「件名も翻訳する」、既定でオン）。
- 表示方法は 2 つあります。対訳表示（各原文段落の下に訳文を表示）と訳文のみで、どちらでも AI 翻訳の太字、リスト、リンクは書式付きで表示されます。翻訳をオフにすると、メッセージは元の状態に正確に戻ります。
- 3 つの翻訳の段階が同時に動きます。オフラインの辞書、機械翻訳、AI サービスです。最も早い結果が先に表示され、最上位の段階の結果がそれを置き換えます。
- アカウント不要の無料サービスとして、Google 翻訳（既定）と Microsoft Translator を使えます。
- 辞書パックと Mozilla の Bergamot モデルでオフライン翻訳ができ、テキストはコンピューターの外へ出ません。
- 22 の AI プロバイダーのプリセットがあります。OpenAI、Claude、Gemini、DeepSeek、Qwen、ローカルの Ollama と LM Studio、および OpenAI 互換の任意のサービスを使えます。
- 精密翻訳: AI の段階がメッセージ全体を見るため、人名や用語が統一されます。
- 編集できるプロンプトが 3 つあり、地域の言葉づかい、文体、難しい語の扱いのプリセットを使えます。
- 翻訳先の言語以外のメッセージをすべて自動的に翻訳する設定も選べます。
- インターフェースは 12 言語に対応し、インストール後にセットアップガイドが開きます。

## インストール

1. [Releases ページ](https://github.com/willlllliams/thunderbird-translate/releases)から最新の `thunderbird-translate-<version>.xpi` をダウンロードします。
2. Thunderbird で ツール → アドオンとテーマ を開きます（右上の ≡ メニューからも開けます）。
3. 拡張機能一覧の上にある歯車アイコンをクリックし、「ファイルからアドオンをインストール...」を選んで、xpi ファイルを選択し、確認します。

Thunderbird 128 以降が必要です。プレリリース版の `nightly` は最新のコミットから自動でビルドされるもので、テスト用です。 実験版 `multi-translate-experimental-<version>.xpi` は、メッセージ一覧に「件名の訳文」の列も追加します。Thunderbird の内部インターフェースに依存し、2 つのビルドのうちインストールできるのは 1 つだけです（[docs/experimental.md](../docs/experimental.md)、英語）。

## クイックスタート

インストールすると、セットアップガイドが新しいタブで開きます。各手順で決めるのは 1 つだけで、言語、表示方法と訳文のスタイル、各段階のサービス（結果の短いデモ付き）、オフライン用のダウンロード、サービスのキー、プロンプトの順に進みます。選んだ内容はすぐに保存され、どの手順もスキップできます。最後の手順では、現在の設定でサンプルメッセージを翻訳します。

ガイドは、ポップアップの「セットアップガイド」リンクか、設定ページ上部のボタンからもう一度開けます。何も設定しなくても、メッセージを開いて Alt+A を押せば、Google 翻訳が翻訳します。

## 使い方

メッセージを開き、メッセージヘッダーのツールバーにある「メッセージを翻訳」ボタンをクリックします。ポップアップには次の項目があります。

- 「このメッセージを翻訳」: 翻訳を開始します。訳文の表示中は、ボタンが「原文を表示」に変わります。
- 「再翻訳」: キャッシュを使わず、すべての段階にもう一度リクエストします。
- 表示方法、翻訳元の言語（既定は「自動検出」）、翻訳先の言語。
- 段階ごとのサービスの一覧、精密翻訳、「翻訳先の言語以外のメッセージを自動的に翻訳する」スイッチ。

| ショートカットキー | 動作 |
| --- | --- |
| Alt+A | メッセージを翻訳する、または原文を表示する |
| Alt+S | 対訳表示と訳文のみを切り替える |
| Alt+R | キャッシュを使わずに再翻訳する（メッセージが翻訳されている間のみ） |

ショートカットキーは、アドオンマネージャーの歯車メニューにある「拡張機能のショートカットキーを管理」で変更できます。

対訳表示では、訳文を対応する原文段落の下に表示します。訳文のみの表示では原文を訳文で置き換え、訳文にマウスポインターを重ねると原文を確認できます。 メインツールバーの「件名の翻訳」ボタンは、現在のフォルダーのメッセージを件名の訳文とともに一覧表示し、行をクリックするとそのメッセージを表示します。

そのほかの設定は設定ページにあります。アドオンマネージャーでこの拡張機能の「設定」ボタンをクリックすると開きます。変更は自動的に保存され、各項目にマウスを重ねると説明が表示されます。すべての設定項目は [docs/settings.md](../docs/settings.md)（英語）で説明しています。

## 翻訳の段階

| 段階 | サービス | 速度 | 品質 | オフライン | 費用 |
| --- | --- | --- | --- | --- | --- |
| 1 辞書 | 辞書 | 数ミリ秒 | 単語ごとの対訳で、文法は考慮しない | 可 | 無料。言語ペアごとに数 MB |
| 2 機械翻訳 | Google、Microsoft、DeepLX、Bergamot | 1 メッセージあたり 1 から 2 秒 | 完全で読みやすい | Bergamot のみ | 無料。Bergamot は方向ごとに 13〜48 MB をダウンロード |
| 3 AI 翻訳 | 22 の AI プロバイダー | 数秒から 1 分 | 最も自然で、プロンプトに従う | ローカルモデルのみ | 使用量に応じて API キーに課金。ローカルモデルは無料 |

各段階には 1 つのサービスを設定するか、「未使用」にします。少なくとも 1 つの段階にサービスが必要です。既定では、段階 2 の Google 翻訳だけが設定されています。

各段落は、使用中のすべての段階に同時に送られます。下位の段階の結果は、段階名を付けた斜体の暫定訳として先に表示されます。使用中の最上位の段階がそれを最終訳に置き換えます。最上位の段階が失敗した場合は、暫定訳が残ります。

選択した辞書または Bergamot に、メッセージの言語に必要なデータがない場合は、メッセージの上に通知が表示されます。通知にはダウンロードするものの名前と、設定ページへのリンク、「これらの言語については通知しない」チェックボックスが含まれます。

## 翻訳サービス

| 区分 | サービス | 必要なもの |
| --- | --- | --- |
| 無料 | Google 翻訳 | なし |
| | Microsoft Translator | なし。任意で「自分のキーを使う（Azure Translator）」モードを選び、Azure のキーとリージョンを入力 |
| | DeepLX | DeepLX サーバーのエンドポイント。トークンは任意 |
| オフライン | 辞書 | 「辞書」セクションで言語ペアをダウンロード。1 つあたり数 MB |
| | Bergamot (Mozilla) | 「オフライン翻訳モデル（Bergamot）」で方向をダウンロード。1 つあたり 13〜48 MB で、どのモデルも片側が英語 |
| AI | 22 のプリセット | API キー。Ollama、LM Studio、カスタムの OpenAI 互換サービスは不要 |

API キーの取得先: [OpenAI](https://platform.openai.com/api-keys) · [Anthropic Claude](https://console.anthropic.com/settings/keys) · [Google Gemini](https://aistudio.google.com/apikey) · [DeepSeek](https://platform.deepseek.com/api_keys) · [xAI Grok](https://console.x.ai/) · [Groq](https://console.groq.com/keys) · [Mistral AI](https://console.mistral.ai/api-keys) · [OpenRouter](https://openrouter.ai/keys) · [Together AI](https://api.together.ai/settings/api-keys) · [Fireworks AI](https://fireworks.ai/account/api-keys) · [DeepInfra](https://deepinfra.com/dash/api_keys) · [Cerebras](https://cloud.cerebras.ai/) · [Perplexity](https://www.perplexity.ai/settings/api) · [Moonshot / Kimi](https://platform.moonshot.cn/console/api-keys) · [Zhipu GLM](https://open.bigmodel.cn/usercenter/apikeys) · [DashScope (Qwen)](https://bailian.console.aliyun.com/) · [SiliconFlow](https://cloud.siliconflow.cn/account/ak) · [Volcengine Doubao](https://console.volcengine.com/ark) · [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/)。ローカル: [Ollama](https://ollama.com/) · [LM Studio](https://lmstudio.ai/)。

精密翻訳は、すべての AI リクエストにメッセージ全体を文脈として付けるため、費用が増えます。AI プロバイダーごとの「思考モード」スイッチは、推論によって翻訳が遅く高くなるため、既定ではオフです。エンドポイント、既定のモデル、Ollama の `OLLAMA_ORIGINS` 設定、思考モードのパラメーターは [docs/providers.md](../docs/providers.md)（英語）にまとめています。

## プロンプト

AI の段階は、3 つのプロンプトのいずれかを使います。対訳表示用（原文に近い訳）、訳文のみの表示用（流れの良い文章）、精密翻訳用（メッセージ全体で用語を統一）です。どれも編集でき、「組み込みのプロンプトに戻す」で元に戻せます。

プリセットは、プロンプトに規則を追加します。内容は、イギリス英語や台湾の言葉づかいのような地域の変種、文体、難しい語の後に原語を付ける規則、難しい語の短い解説です。詳しくは [docs/settings.md](../docs/settings.md#prompt-presets)（英語）を参照してください。

## プライバシー

- メッセージのテキストは、使用中の段階のサービスにだけ送られます。辞書と Bergamot はコンピューター上で翻訳します。 メッセージの件名も同じ規則に従います。
- メッセージ本文を初めてオンラインサービスに送る前に、メッセージの上のパネルがサービス名とアドレスを示し、サービスごとに 1 回確認します。「許可して翻訳」をクリックするまで何も送信しません。許可したサービスは設定ページに一覧表示され、取り消すこともできます。辞書と Bergamot だけを使う場合は確認しません。
- 自分で入力したエンドポイント（Ollama、LM Studio、DeepLX、カスタムサービス、変更したエンドポイント）は、接続の許可が 1 回必要です。設定で「アクセスを許可」または「接続テスト」をクリックすると許可できます。
- API キーは Thunderbird のプロファイルにだけ保存され、それぞれのサービスのエンドポイントにだけ送られます。
- 2 つの一覧はネットワークから取得しますが、メッセージのテキストは含みません。このリポジトリの GitHub Releases にある辞書パックのインデックスと、Mozilla の Bergamot モデルの記録です。設定ページとセットアップガイドは、オフラインの一覧を表示するためにこれらを読み込みます。段階で辞書または Bergamot を選んでいる間は、Thunderbird の起動時、設定の変更時、ポップアップを開いたときにも読み込みます。メッセージを翻訳するときには読み込みません。
- 辞書パックとモデルは、ダウンロードボタンをクリックしたときだけダウンロードされます。拡張機能は統計情報を収集しません。
- 翻訳キャッシュはローカルに保存され、オフにすることも消去することもできます。
- 機密性の高いメールには、辞書、Bergamot、ローカルの AI モデル（Ollama、LM Studio）だけを使ってください。

## 既知の制限

- 原文のリンクやインラインの書式は訳文に引き継がれません。訳文に太字、リスト、リンクが現れるのは、AI サービスが Markdown で書いた場合だけです。辞書と機械翻訳の訳文、および暫定訳はプレーンテキストです。
- Google と Microsoft の無料エンドポイントは非公開の仕様で、変更されたり、利用が制限されたりすることがあります。
- 辞書は、原文の語順のまま単語ごとの対訳を出します。
- 辞書と Bergamot は、簡体字中国語と繁体字中国語の間では翻訳しません。
- 使用中の各段階がそれぞれリクエストを送るため、AI の段階を使っているときは、機械翻訳の段階のリクエストも無料エンドポイントの利用制限に数えられます。
- サービスが返したエラーのテキストは、受け取ったまま、多くの場合は英語で表示されます。

完全な一覧は [docs/settings.md](../docs/settings.md#known-limitations)（英語）にあります。

## ドキュメント

以下のドキュメントは英語です。dictionary-packs.md のみ中国語です。

- [docs/settings.md](../docs/settings.md)（英語）: すべての設定項目、オフラインの一覧、データ不足の通知、キャッシュ。
- [docs/providers.md](../docs/providers.md)（英語）: 各サービスのエンドポイント、既定のモデル、思考モードのパラメーター。
- [docs/batching.md](../docs/batching.md)（英語）: 段落をリクエストにまとめる方法、タイムアウト、費用。
- [docs/bergamot.md](../docs/bergamot.md)（英語）: オフラインエンジン Bergamot、モデルの選び方と保存方法、ビルド。
- [docs/dictionary-packs.md](../docs/dictionary-packs.md)（中国語）: 辞書パックのデータソース、形式、作成手順。
- [docs/development.md](../docs/development.md)（英語）: ソースからのビルド、テスト、プロジェクト構成、インターフェースの翻訳、リリースの手順。
- [docs/experimental.md](../docs/experimental.md)（英語）: 「件名の訳文」列を備えた実験版、そのインストール方法とリスク。

## 謝辞

- [Read Frog](https://github.com/mengxi-ream/read-frog)（GPL-3.0）: 段落の検出、バッチキュー、プロンプト、プロバイダー設定の設計。
- [Mozilla Bergamot](https://browser.mt/): オフラインの翻訳エンジンと Firefox Translations のモデル（MPL-2.0）。
- [Wiktionary](https://en.wiktionary.org/)（© Wiktionary contributors）: 英語 → 簡体字中国語以外の辞書パックは、[wiktextract](https://github.com/tatuylonen/wiktextract) が抽出し [kaikki.org](https://kaikki.org/) が公開した Wiktionary のデータを改変（抽出・絞り込み・削減）したものです。ライセンスは CC BY-SA 4.0（<https://creativecommons.org/licenses/by-sa/4.0/>）です。
- [ECDICT](https://github.com/skywind3000/ECDICT)（Copyright (c) 2025 Linwei、MIT ライセンス）: 英語 → 簡体字中国語の辞書パックは ECDICT を改変（抽出・絞り込み・削減）したものです。

## ライセンス

GPL-3.0-or-later。全文は [LICENSE](../LICENSE) を参照してください。
