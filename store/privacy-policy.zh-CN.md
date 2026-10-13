# 隐私政策（简体中文）

本文是 [privacy-policy.md](privacy-policy.md) 的简体中文版，内容与英文版一致。ATN 的隐私政策字段只有一个，提交时填写英文版；中文版供中文读者对照。

---

## 聚合邮件翻译 for Thunderbird：隐私政策

聚合邮件翻译 for Thunderbird 翻译你在 Thunderbird 中阅读的邮件。它没有自己的服务器：开发者不会从扩展收到任何数据；扩展不收集统计数据、使用数据或崩溃报告，也没有账号。

### 发送什么、发给谁

只有在你翻译邮件时，扩展才发送邮件文字：使用弹出面板中的按钮、快捷键 Alt+A 和 Alt+R，或者你开启的自动翻译。这时扩展把邮件各段落的文字发送给你所选翻译层级的服务：

| 服务 | 文字发往 |
| --- | --- |
| 谷歌翻译 | translate.googleapis.com |
| 微软翻译 | edge.microsoft.com；使用自己的 Azure Translator 密钥时，发往你的 Azure 资源的接口地址（默认 api.cognitive.microsofttranslator.com） |
| DeepLX | 你填写的 DeepLX 服务器地址 |
| AI 服务（OpenAI、Anthropic、Google Gemini、DeepSeek 等预设） | 设置页显示的该服务接口地址，或你填写的地址 |

开启精翻时，AI 服务还会收到整封邮件的文字（最多 20,000 个字符）作为上下文；邮件较长时，另有一个请求让 AI 服务分析整封邮件（摘要、人名与术语表、语气）。

随文字一起发送的还有源语言和目标语言，以及属于该服务的请求设置：对 AI 服务而言是模型、提示词、温度和思考模式开关。你保存的 API 密钥只发给它所属的服务。邮件的发件人、收件人、主题和附件不会发送。各服务按照自己的隐私政策处理收到的文字。

### 你的同意

邮件文字第一次发送给某个在线服务之前，邮件上方的面板会写明服务名称、请求发往的地址以及发送的内容。点击“允许并翻译”之前，扩展不向这个服务发送任何内容。每个服务只询问一次，你的选择记录在扩展的设置中。设置页列出你已允许的服务，“撤销”收回同意，之后面板会再次询问。

扩展只连接清单（manifest）中列出的地址。你自己填写的地址（例如本机的 Ollama 服务器或你的 DeepLX 服务器）需要经过 Thunderbird 自己的授权提示，扩展只在你点击“授权访问”或“测试连接”时显示这个提示。

### 不发送什么

离线词典和离线 Bergamot 模型在你的电脑上翻译，不发送任何内容。只使用这两项时，邮件文字不会离开 Thunderbird，扩展也不会显示同意面板。

### 不含你数据的下载

有两份列表和离线数据来自网络，其中不含任何邮件文字：

- 词典包列表和词典包本身，来自本项目的 GitHub Releases（github.com，下载会重定向到 release-assets.githubusercontent.com 或 objects.githubusercontent.com）；
- Bergamot 翻译模型列表和模型文件，来自 Mozilla（firefox.settings.services.mozilla.com 和 firefox-settings-attachments.cdn.mozilla.net）。

设置页或新手引导显示这两份列表时，扩展会读取它们；某个层级选用了词典或 Bergamot 时，Thunderbird 启动和设置改变时也会读取。词典包和模型只在你点击下载按钮时下载。与任何下载一样，这些请求会让服务器看到你的 IP 地址和所请求的文件。

### 在你电脑上保存什么

- 设置，包括 API 密钥，保存在 Thunderbird 配置文件的扩展存储（storage.local）中。与其他附加组件的数据一样，这些内容没有加密。
- 翻译缓存，保存在同一存储中，默认最多 5,000 个段落。缓存保存译文，原文只以哈希值保存。设置页可以关闭和清空缓存。
- 你下载的词典包和 Bergamot 模型，保存在扩展的 IndexedDB 存储中。

卸载扩展会删除以上全部内容。

### 变更与联系

本政策的变更记录在项目的更新日志中。问题和反馈：https://github.com/willlllliams/thunderbird-translate/issues
