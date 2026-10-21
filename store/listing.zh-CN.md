# 上架页面（简体中文）

下列文字填入 addons.thunderbird.net（ATN）上架页面的简体中文版本。英文版是默认版本，见 [listing.md](listing.md)；截图、图标、分类、链接和许可证与英文版相同。

## 名称

聚合邮件翻译 for Thunderbird

## 摘要

不超过 250 个字符。

```text
在阅读窗格中直接翻译正在阅读的邮件，可双语对照或只显示译文。最多三个层级同时翻译：离线词典、机器翻译（谷歌、微软、DeepLX、离线 Bergamot）和 22 个 AI 服务。邮件文字只发给你选定的服务。
```

## 说明

```text
邮件文字只发给你选定的翻译服务。谷歌翻译、微软翻译、DeepLX 和各个 AI 服务会收到所翻译邮件的段落和标题（开启精翻时还会收到整封邮件作为上下文），以及你在标题翻译页面翻译的邮件标题；第一次向某个在线服务发送之前，扩展会就这个服务询问一次。离线词典和离线 Bergamot 模型在本机翻译，不发送任何内容。API 密钥只保存在你的 Thunderbird 配置文件中，只发给它所属的服务。扩展不收集任何统计数据。

聚合邮件翻译 for Thunderbird 在阅读窗格里直接翻译正在阅读的邮件正文。装好后用免费的谷歌翻译即可工作，需要时再加上离线翻译和 AI 服务。

功能
- 翻译 HTML 邮件中的段落、列表项、表格单元格、标题和引用，以及纯文本邮件的段落。代码、数字、单独的链接和已经是目标语言的段落会跳过。
- 译文显示在每个段落下方（双语对照），或替换原文（仅译文）。关闭翻译后原邮件完整恢复。
- AI 服务用 Markdown 写出的粗体、列表和链接按格式显示。只有 http、https 和 mailto 地址会成为链接，Thunderbird 像打开邮件里的其他链接一样打开它们。
- 邮件标题也会翻译，显示在正文上方的一行中。
- 主工具栏的“标题翻译”按钮列出当前文件夹的邮件及其标题译文，点击一行即显示该邮件。
- 最多三个层级同时翻译：离线词典、机器翻译和 AI 服务。最快的结果先作为临时译文显示，最高层级的结果随后替换它。失败的层级可以点击重试。
- 无需账号的机器翻译：谷歌翻译和微软翻译（也可以使用自己的 Azure Translator 密钥），或者你自己的 DeepLX 服务器。
- 离线翻译：由 Wiktionary 和 ECDICT 构建的词典包，以及 Firefox 翻译功能所用的 Mozilla Bergamot 模型。下载在后台进行，词典包或模型存好后立即可用。
- 22 个 AI 预设：OpenAI、Anthropic Claude、Google Gemini、DeepSeek、xAI Grok、Groq、Mistral AI、OpenRouter、Together AI、Fireworks AI、DeepInfra、Cerebras、Perplexity、Moonshot/Kimi、智谱 GLM、通义千问（阿里云百炼）、硅基流动、火山引擎方舟、Azure OpenAI、本机的 Ollama 和 LM Studio，以及任何 OpenAI 兼容服务。每个服务可以设置思考模式和温度，并能测试连接。
- 精翻：AI 服务看到整封邮件，人名和术语前后一致。
- 三套可编辑的提示词，附带地区用语、语言风格和难词处理的预设。
- 可选自动翻译：不是目标语言的邮件打开即翻译。

使用方法
- 打开一封邮件，点击邮件头工具栏中的“翻译邮件”，或按 Alt+A。弹出面板可以切换显示方式、语言和三个层级的服务。
- Alt+S 在双语对照和仅译文之间切换；Alt+R 跳过缓存重新翻译。
- 邮件第一次要发给某个在线服务时，邮件上方的面板会写明服务名称和地址；点击“允许并翻译”之前不会发送任何内容。

设置方法
- 安装后会打开新手引导：语言、显示方式、三个层级、离线下载、机器翻译、AI 服务和提示词。每一步都可以跳过。
- 全部设置都在设置页（附加组件管理器中本扩展的“选项”）。你自己填写的接口地址（例如本机的 Ollama）需要授权一次：点击“授权访问”或“测试连接”即可。

界面语言：English、简体中文、繁體中文、日本語、한국어、Français、Deutsch、Español、Português (Brasil)、Русский、Türkçe、Tiếng Việt。

需要 Thunderbird 128 或更新版本。源代码、文档和问题反馈：https://github.com/willlllliams/thunderbird-translate
```

## 截图说明

| 文件 | 说明 |
| --- | --- |
| `store/screenshots/1-bilingual.png` | 双语对照：译文显示在每个段落下方 |
| `store/screenshots/2-translation-only.png` | 仅译文：邮件以你的语言显示 |
| `store/screenshots/3-provisional-tiers.png` | AI 服务还在翻译时，机器翻译的结果先显示 |
| `store/screenshots/4-popup.png` | 弹出面板：显示方式、语言和每个层级的服务 |
| `store/screenshots/5-settings-tiers.png` | 设置页：三个层级和已允许的在线服务 |
| `store/screenshots/6-setup-guide.png` | 新手引导对比三个层级 |
| `store/screenshots/7-consent.png` | 你允许之前不发送任何内容 |
