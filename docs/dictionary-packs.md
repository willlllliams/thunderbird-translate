# 词典数据包

词典翻译服务是三层翻译的第一层：原文分词后逐词查词典替换，得到一句粗略译文。分词使用 `Intl.Segmenter`，中文和日文没有空格，依靠它的内置词典切分。本文说明这项服务使用的词典数据包（dictionary pack）：数据从哪里来、包的格式、抽取规则、体积限制，以及如何构建和发布。

每个翻译方向对应一个包。全部词条由 `tools/dict-build/build.mjs` 从开源词典数据中抽取，仓库里只保存脚本，数据包作为 GitHub Release 资源发布。

## 数据来源与许可

两个数据源覆盖 22 个方向：英语与 11 种语言（zh-Hans、zh-Hant、ja、ko、fr、de、es、pt、ru、tr、vi）互译。

| 数据源 | 文件 | 体积（2026-10 实测） | 许可证 | 用于 |
| --- | --- | --- | --- | --- |
| Wiktionary，经 wiktextract 抽取、由 kaikki.org 发布 | `https://kaikki.org/dictionary/<Language>/kaikki.org-dictionary-<Language>.jsonl.gz`，每行一个 JSON 词条 | English 523 MB（解压 3.34 GB）；其余 10 个语言文件合计约 0.7 GB（解压约 6.6 GB） | CC BY-SA 4.0（Wiktionary 文本同时以 GFDL 发布） | 除 en-zh-Hans 外的 21 个方向 |
| ECDICT（skywind3000/ECDICT） | `https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv` | 65.9 MB，770,611 行 | MIT | en-zh-Hans |

kaikki.org 按语言提供 English Wiktionary 版本的抽取结果。`<Language>` 依次取 English、Chinese、Japanese、Korean、French、German、Spanish、Portuguese、Russian、Turkish、Vietnamese。zh-Hans 与 zh-Hant 共用 Chinese 文件。本文写作时各文件的 `Last-Modified` 为 2026-10-03，kaikki.org 大约每周更新一次。

数据包的署名如下，发布页、索引文件和扩展的关于页面都应带上对应署名：

- Wiktionary contributors（via kaikki.org / wiktextract），CC BY-SA 4.0。
- ECDICT by skywind3000，MIT License。

CC BY-SA 的相同方式共享条款作用于由 Wiktionary 派生的数据包，这些包以 CC BY-SA 4.0 发布。数据包是运行时下载的独立数据文件，与扩展代码分开分发。

## 包格式

文件名为 `dict-<src>-<tgt>.tsv.gz`，例如 `dict-en-zh-Hans.tsv.gz`、`dict-de-en.tsv.gz`。内容是 gzip 压缩的 UTF-8 文本，每行以 `\n` 结尾，字段之间用制表符分隔。

第 1 行是包头：

```
#dict	<src>	<tgt>	<packVersion>	<sourceName>	<license>
```

`packVersion` 是构建日期（`YYYYMMDD`）。`sourceName` 写明数据源和数据日期，例如 `Wiktionary via kaikki.org 2026-10-03` 或 `ECDICT`；用 `--limit` 构建的样本包会追加 `(first N lines)`。`license` 是 SPDX 标识，取 `CC-BY-SA-4.0` 或 `MIT`。

其余各行分两类：

- 词条行 `w	<key>	<translation>`：`key` 的译文。
- 变形行 `f	<key>	<lemmaKey>`：`key` 是 `lemmaKey` 的变形，例如 `f	went	go`。

key 按以下规则归一化，`tools/dict-build/lib/common.mjs` 的 `normalizeKey` 是唯一实现：

1. Unicode NFC 归一化。
2. 去掉首尾空白，内部连续空白合并为一个空格。多词短语保留空格，例如 `w	in front of	vor`。
3. 用 `toLocaleLowerCase(src)` 转小写。有大小写的语言（en、fr、de、es、pt、ru、tr、vi）整体转小写，土耳其语因此把 `I` 转成 `ı`。汉字、假名、谚文没有大小写，zh、ja、ko 的 key 只有夹带的拉丁字母会变（`T恤` 变成 `t恤`），这与扩展运行时的 `dictKey()` 一致。
4. 俄语去掉重音符号（U+0301、U+0300）。词典里的俄语词形带重音标记，正文不带；`ё`、`й` 的附加符号保留。

包内约束：

- 每个 key 至多一行。同一 key 同时有词条和变形时只保留词条行，查词时词条优先，变形行只在没有词条时使用。
- 变形行的 `lemmaKey` 必须在同一包里有词条行，否则该变形行被丢弃。变形不做链式解析。
- 全部行按 key 排序，比较规则是 JavaScript 字符串默认比较（UTF-16 码元顺序），与 `a < b` 一致。运行时可以对解压后的行做二分查找。
- key 和译文都不含制表符和换行符。key 必须含有字母，以 `-` 开头或结尾的词缀不收录。

运行时的查词过程：

```
lookup(key):
  if 存在 w 行(key)        -> 返回其译文
  if 存在 f 行(key) = lemma -> 返回 w 行(lemma) 的译文
  否则                      -> 未命中
```

分词后按最长匹配查多词短语效果更好：从当前词起依次拼接最多 4 个词查表，取最长的命中。`tools/dict-build/demo.mjs` 实现了这一过程。

## 索引文件

`dict-index.json` 列出发布页上的全部包：

```json
{
  "version": 1,
  "packs": [
    {
      "src": "en",
      "tgt": "zh-Hans",
      "file": "dict-en-zh-Hans.tsv.gz",
      "bytes": 718971,
      "rawBytes": 1916711,
      "entries": 57640,
      "forms": 32827,
      "sha256": "f27666420e7024968506ede40740da1c1d5be916e555ecb0a12d4089bb7a334f",
      "source": "ECDICT",
      "license": "MIT",
      "attribution": "ECDICT by skywind3000 (https://github.com/skywind3000/ECDICT); MIT License"
    }
  ]
}
```

| 字段 | 含义 |
| --- | --- |
| `src`、`tgt` | 源语言和目标语言代码，与文件名一致 |
| `file` | 包文件名 |
| `bytes` | 压缩后字节数 |
| `rawBytes` | 解压后字节数 |
| `entries` | `w` 行数 |
| `forms` | `f` 行数 |
| `sha256` | 压缩文件的 SHA-256（十六进制小写） |
| `source`、`license` | 与包头相同 |
| `attribution` | 署名全文 |

构建时还会写出 `dict-build-report.json`，按包记录数据源 URL、数据日期、是否为样本构建，以及每一步裁剪后的条目数和体积。它与索引一起上传到发布页，是每个包实际裁剪结果的记录。

## 抽取规则

### 英语到其他语言（Wiktionary）

英语词条的翻译表（`translations`）给出各语言译词。wiktextract 会把每张翻译表挂到它判断对应的义项上，挂不上的留在词条顶层。抽取时按以下顺序收集同一词条内该语言的全部译词：先按义项顺序取挂在义项上的译词，再取顶层译词。带 `obsolete`、`archaic`、`dated` 标签的译词跳过。

按义项顺序取第一个译词是最初设计的规则。实测发现义项挂接有错位，第一个译词经常来自次要义项，所以最终取的是同一词条内出现在最多张翻译表里的译词，出现次数相同时取顺序在前的。英译德的对照结果：

| 英语词条 | 顺序第一个 | 出现最多（次数） |
| --- | --- | --- |
| run（verb） | laufen lassen | laufen（7） |
| take（verb） | einnehmen | nehmen（6） |
| fast（adj） | fest | schnell（4） |
| light（noun） | Ampel | Licht（3） |
| need（verb） | benötigen | brauchen（2） |
| free（adj） | frei | frei（7） |

`run` 的第一个德语译词来自翻译表“to cause to move quickly”，wiktextract 把它挂到了义项“To move swiftly”上；`laufen` 则出现在 7 张表里。计数让主要义项的译词胜出，同时不依赖义项挂接是否正确。

同一个英语 key 有多个词条（名词、动词等）时，比较规则见下文“同一 key 的取舍”。词性相同等级的词条之间，译词出现次数多的词条胜出，例如 `need` 的动词词条（brauchen，2 次）胜过名词词条（Notwendigkeit，1 次）。

语言匹配用翻译项的 `lang` 字段：

- 汉语取 `lang` 为 `Chinese Mandarin`（或 `Mandarin`）的译词，带 Dungan、Hokkien 等方言标签的跳过。译词写作 `詞典 /词典`，斜杠前是繁体，斜杠后是简体，没有斜杠时两者相同。en-zh-Hant 取繁体；en-zh-Hans 改用 ECDICT。
- 葡萄牙语接受 `Portuguese`、`Brazilian Portuguese`、`European Portuguese`。
- 其他语言要求 `lang` 等于 kaikki 的语言名且 `lang_code` 等于语言代码，因此 Bavarian German、Old French 等不会混入。

译词去掉括号说明（`()`、`[]`、全角括号），超过 60 个字符或以连字符开头结尾的译词不用；目标是中日韩语时，译词必须含有汉字、假名或谚文。

### 其他语言到英语（Wiktionary）

kaikki 中该语言词条的义项释义（`senses[].glosses`）是英语，译文从释义里截取：

1. 跳过带 `form_of`、`alt_of` 的义项，以及标为 `form-of`、`alt-of`、`no-gloss`、`romanization` 的义项。标为 `obsolete`、`archaic`、`historical`、`dated`、`rare` 的义项是后备义项，只在其他义项都取不到译文时使用。
2. 义项的 `glosses` 先列上级释义、最后是本义项释义。上级释义以冒号结尾时（如 “As a copulative verb:”）只是小标题，改用本义项释义。
3. 去掉括号说明，按 `;` 和 `,` 切分，依次检查各段，取第一个合格的段。动词去掉开头的 `to `，名词去掉开头的 `a `、`an `。
4. 合格的段不超过 4 个词，只含拉丁字母、数字和标点，并且不是元语言描述。元语言描述包括 “synonym of …”“plural of …”“short for …” 一类，以及以 used、forms、indicates、as a 等开头的语法说明。
5. 本义项没有合格的段时取下一个义项。

同一个 key 有多个同等级的词条时，取到译文之前跳过的后备义项较少的词条胜出，跳过数相同时先出现者胜出。越南语 `tôi` 的名词词条第一个义项是标为 historical 的 “slave”，代词词条第一个义项是 “I/me”，代词词条因此胜出。

最初的规则只看第一个 `;`/`,` 之前的段。逐段检查是为了处理“长描述在前、对应词在后”的释义，例如德语冠词 der 的释义是 “nominative masculine singular definite article, the”，第一段 5 个词不合格，第二段 “the” 合格。

罗马字条目（`pos` 为 `romanization`）不收录。中日韩语的 key 必须含有汉字、假名或谚文，拉丁字母写成的外来词条目不收录。

### 汉语的简繁处理

English Wiktionary 把释义写在繁体词条上。简体写法有两种来源：繁体词条 `forms` 里标为 `Simplified-Chinese` 的形式（排除 `alternative` 和二简字），以及简体页面的重定向（`redirects`）。一次读取 Chinese 文件同时生成两个包：

- zh-Hant-en：所有带释义词条的词头。
- zh-Hans-en：按优先级依次取简繁同形的词头、繁体词条的简体形式、简体重定向页指向的繁体词条的释义。

带 Cantonese、Hokkien、Wu 等方言标签的义项跳过。汉语没有屈折变化，两个包都没有变形行。

### 变形到原形（Wiktionary）

变形行有两个来源，优先级不同：

- 优先级 0：变形自己的词条带 `form_of`/`alt_of` 义项，例如 `is` 是 `be` 的变形，`läuft` 是 `laufen` 的变形。重定向页（`pos` 为 `soft-redirect`，例如日语假名写法指向汉字写法）也算这一类；汉语的重定向在上一节处理。
- 优先级 1：原形词条的 `forms` 表列出的变形，例如 `free` 的 `frees`、`freed`。

同一个变形有多个候选原形时，先在优先级 0 中按出现顺序取第一个在包内有词条的，再看优先级 1。`forms` 表中标为 romanization、canonical、table-tags、inflection-template、auxiliary、counter、hangeul、hanja 等的项不是变形，不收录；含空格、斜杠、括号的形式不收录；日语和韩语表格里的罗马字形式不收录。

### 英语到简体中文（ECDICT）

ECDICT 的 `translation` 字段用字面的 `\n` 分隔多行释义，每行以词性前缀开头，例如 `vt. 感觉, 认知, 理解`。抽取规则：

1. `frq`（COCA 词频排名）与 `bnc`（BNC 词频排名）都为 0、且 `tag` 考试词表为空的行丢弃。770,611 行中丢弃 710,599 行。
2. 逐行处理释义：去掉词性前缀（`n.`、`vt.`、`a.` 等）和括号说明，按 `，；,;` 切分。取第一个含汉字且不含拉丁字母的段；全部为含拉丁字母的段时取第一个含汉字的段。`a` 的首行 “第一个字母 A; 一个” 因此取到 “一个”。
3. 以 `[计]`、`[网络]` 等领域标记开头的行只在没有一般释义时使用。
4. 形如 “go的过去式”“have的第三人称单数现在式” 的行是变形说明，转成变形行（`went` → `go`），不作为译文。
5. 译文中的省略号 `...` 删除，`在...之前` 变成 `在之前`。

变形行来自 `exchange` 字段：`p`（过去式）、`d`（过去分词）、`i`（现在分词）、`3`（第三人称单数）、`r`（比较级）、`t`（最高级）、`s`（复数）给出本词的变形；`0` 给出本词的原形，优先级更高。

### 同一 key 的取舍

大小写归一化后，不同词条会落到同一个 key 上，例如英语的 `IS`（伊斯兰国）和 `is`。取舍按词条等级：

| 等级 | 条件 | 例子 |
| --- | --- | --- |
| 精确 | 词头本身等于 key | `is`、`weg` |
| 德语名词 | 德语名词或专名，词头首字母大写 | `Buch` 对应 `buch` |
| 大小写折叠 | 其他大小写不同的词头 | `IS` 对应 `is` |

字符、词缀、标点、符号类词条比同一大小写等级的普通词条低一档。等级高者胜出，等级相同时先出现者胜出。只要存在精确拼写的词条，大小写折叠的候选就被丢弃，即使精确词条本身没有译文。`is` 的精确词条只有“be 的变形”这一义项，于是 `IS` 的译文被丢弃，`is` 通过变形行查到 `be`。

德语名词首字母按拼写规则大写，所以单独成为一个等级：它保留下来，但输给精确拼写的词条。`essen`（动词，eat）胜过 `Essen`（名词），`weg`（副词，away）胜过 `Weg`。

德语还有名词与动词变形撞车的情况：`habe` 既是名词 `Habe`（财物），又是 `haben` 的第一人称现在时。处理办法是比较两者在英语翻译表中被引用的次数（见下节），动词原形被引用得更多时去掉名词词条，`habe` 经变形行查到 `haben`。只有命令式的变形（如 `buch`，`buchen` 的命令式）不参与比较，`buch` 保留名词 `Buch`（book）。在 20 万行样本上，这条规则处理了 380 个 key。

## 体积限制与裁剪

每个包压缩后不超过 5,000,000 字节。超出时依次执行：

1. 去掉多词短语：key 含空格的词条行和变形行。
2. 去掉无词频信息的词条行。
3. 按词频排序，二分查找能放进限制的最大 N，只保留前 N 个词条行。

第 2、3 步只对词条行排序和筛选，变形行随原形保留或丢弃。每一步只在上一步之后仍然超限时执行，执行结果写入 `dict-build-report.json` 的 `steps`。

词频来源按源语言区分：

- 英语 key（en-X 各包）：ECDICT 的 `frq` 与 `bnc` 中非零者的较小值，排名越小越常用。ECDICT 中没有或两项都为 0 的词算作无词频信息。
- 其他语言 key（X-en 各包）：Wiktionary 本身没有词频，这里用该词在英语词条翻译表中被引用的次数代替，次数越多越常用，没有被引用过的词算作无词频信息。一个外语词被很多英语词条当作译词，说明它属于基础词汇。这个计数在读取 English 文件时顺带完成；单独构建 X-en 包且需要裁剪时，脚本会额外读一遍 English 文件。

### 实测结果

本地验证只做了 ECDICT 全量和 Wiktionary 小样本，所有包都没有触发裁剪：

| 包 | 数据范围 | 词条行 | 变形行 | 压缩后字节 | 解压后字节 |
| --- | --- | ---: | ---: | ---: | ---: |
| dict-en-zh-Hans | ECDICT 全量 | 57,640 | 32,827 | 718,971 | 1,916,711 |
| dict-en-de | English 前 20 万行（解压 1.52 GB，占全文件 45%） | 42,480 | 64,394 | 700,322 | 2,296,025 |
| dict-de-en | German 前 20 万行（解压 547 MB，约占全文件 50%） | 39,653 | 183,020 | 989,366 | 5,498,428 |

用 `--max-bytes 400000` 对 de-en 样本做的裁剪演练依次执行了三步：

| 步骤 | 词条行 | 变形行 | 压缩后字节 |
| --- | ---: | ---: | ---: |
| 不裁剪 | 39,653 | 183,020 | 989,366 |
| 去掉多词短语 | 38,535 | 170,712 | 928,631 |
| 去掉无词频信息的词 | 25,274 | 127,170 | 635,335 |
| 保留前 14,536 个 | 14,536 | 87,688 | 399,990 |

同一份 English 样本生成的其他 en-X 包在 0.25 到 0.73 MB 之间：en-ru 0.73 MB、en-fr 0.68 MB、en-es 0.66 MB、en-zh-Hant 0.57 MB、en-pt 0.57 MB、en-ja 0.51 MB、en-ko 0.36 MB、en-tr 0.36 MB、en-vi 0.25 MB。Vietnamese 文件只有 12.7 MB，本地做了全量构建，vi-en 为 26,001 个词条行、11,027 个变形行、0.32 MB。本节的 MB 均指 10^6 字节。

按样本占文件的比例线性外推，全量包的体积估计如下。English 文件里翻译表丰富的常用词排在前面，en-X 包的实际增长低于线性外推：

| 包 | 样本 | 样本包体积 | 全量估计 |
| --- | --- | ---: | ---: |
| de-en | 前 20 万行，占 50% | 0.99 MB | 约 2.0 MB |
| en-de | 前 20 万行，占 45% | 0.70 MB | 不超过 1.6 MB |
| ru-en | 前 3 万行，占 17% | 1.01 MB | 约 6 MB，预计触发第 1 步，可能触发第 2 步 |
| ja-en | 前 3 万行，占 15% | 0.27 MB | 约 1.8 MB |
| ko-en | 前 3 万行，占 53% | 0.51 MB | 约 1.0 MB |
| zh-Hans-en / zh-Hant-en | 前 3 万行，占 23% | 0.10 / 0.08 MB | 约 0.45 / 0.35 MB |

es-en、pt-en、fr-en 的变形表规模与俄语接近（西班牙语动词每个有约 50 个变形），全量构建时也可能触发裁剪。全量结果以发布页上的 `dict-build-report.json` 为准。

## 构建

脚本位于 `tools/dict-build/`，零依赖，需要 Node.js 22 或更高版本：

```sh
cd tools/dict-build
node build.mjs --pairs en-de,de-en --out dist/ [--cache .cache/] [--limit N]
node verify.mjs dist/
node demo.mjs dist/
```

| 参数 | 含义 |
| --- | --- |
| `--pairs` | 逗号分隔的方向列表，或 `all`（默认）。方向写作 `<src>-<tgt>`，例如 `zh-Hant-en` |
| `--out` | 输出目录，默认 `dist` |
| `--cache` | 源数据缓存目录，默认 `tools/dict-build/.cache` |
| `--limit N` | 每个源文件只读前 N 行，用于本地快速验证 |
| `--pack-version` | 包头中的版本号，默认当天日期 `YYYYMMDD` |
| `--max-bytes` | 单包体积上限，默认 5000000 |

源文件以流的方式处理：下载流经 gunzip 解压后由 readline 逐行读入，每行单独 `JSON.parse`，整个文件不会读入内存。全量构建先把 `.jsonl.gz` 下载到缓存目录，再次运行时直接读取缓存。带 `--limit` 时，脚本只从网络流式读取前 N 行，读够即中断下载，并把这 N 行另存为 `<文件名>.first<N>.jsonl.gz`，相同 N 的下一次运行直接用这份样本。缓存目录和输出目录已列入 `tools/dict-build/.gitignore`。

一次运行中，同一个源文件只读一遍：English 文件同时生成所有 en-X 包（en-zh-Hans 除外）并统计引用次数，Chinese 文件同时生成 zh-Hans-en 和 zh-Hant-en。输出目录中已有 `dict-index.json` 和 `dict-build-report.json` 时，本次构建的包替换其中同名条目，其他条目保留，因此可以分批构建。

`verify.mjs` 逐包检查：文件字节数、SHA-256、解压后字节数、条目数与索引一致；包头字段正确；每行恰好三个字段；key 已归一化；key 严格递增；每个变形行的原形都有词条行；体积不超过上限。

`demo.mjs` 对样例句子做逐词替换，未命中的词用方括号标出。本地样本包的输出：

```
en->zh-Hans (ECDICT)
  The cat is sleeping on the warm windowsill.
  那猫是睡眠在之上那暖和的窗台.
  She bought three books yesterday.
  她买三书评昨天.
  We need to finish the report before the meeting.
  我们需要到完成那报告在之前那会议.
de->en (Wiktionary via kaikki.org 2026-10-03 (first 200000 lines))
  Der Hund läuft schnell über die Straße.
  the dog walk quick above the street.
  Ich habe gestern ein Buch gekauft.
  I have yesterday one book buy.
```

## 发布

`.github/workflows/dicts.yml` 只能手动触发（`workflow_dispatch`），有两个输入：

- `pairs`：要构建的方向，默认 `all`。
- `tag`：接收数据包的 Release 标签，默认 `dicts-v1`。

工作流先从该标签的 Release 下载已有的包、索引和报告，再构建指定方向，因此只重建部分方向时索引仍然完整。构建后运行 `verify.mjs`，把各包条目数写入运行摘要，最后用 `softprops/action-gh-release` 上传全部包、`dict-index.json` 和 `dict-build-report.json`。同名资源会被覆盖（`overwrite_files: true`），这个 Release 不会被标为 latest，扩展本身的版本发布不受影响。

全量构建的资源估计：

| 项目 | 估计 |
| --- | --- |
| 下载量 | 约 1.25 GB（English 523 MB，其余 10 个语言文件约 0.67 GB，ECDICT 66 MB） |
| 磁盘占用 | 约 1.3 GB 缓存加不到 0.1 GB 输出；公开仓库的 ubuntu-latest 运行器标称 14 GB SSD |
| 解压后读取量 | 约 9.9 GB JSON 行 |
| 耗时 | 本地读取速度约 100 MB/s（20 万行 English 样本 1.52 GB 用时约 15 秒），全量处理约 2 分钟；加上下载和运行器较慢的 CPU，预计 15 到 30 分钟 |
| 内存 | English 文件一遍读取要同时保存 10 种语言的候选译词、英语变形表和引用计数。20 万行样本上一次生成 10 个 en-X 包的峰值常驻内存为 388 MB，全量估计 1 GB 左右；工作流把 Node 堆上限设为 8 GB，公开仓库的运行器内存为 16 GB |

作业超时设为 240 分钟，低于 GitHub Actions 单个作业 6 小时的上限。

## 已知局限

- 逐词替换不处理语序、冠词和一词多义，输出只用于粗略理解，例如 “I have yesterday one book buy”。
- ECDICT 中屈折形式有自己的释义时优先使用该释义，`books` 译为“书评”，没有经变形行回到 `book`（书）。
- Wiktionary 的释义截取依赖固定规则，个别词会取到次要义项或解释性短语，例如英译德的 `warm` 取到 warmherzig。
- 外语到英语的词频用英语翻译表中的引用次数近似，不能反映正文中的实际出现频率。俄语、西班牙语、葡萄牙语、法语的包在全量构建时可能被裁剪，裁剪会先去掉没有被引用过的词。
- kaikki.org 每周更新，抽取规则依赖 wiktextract 的字段（`translations`、`senses`、`forms`、`form_of`、`alt_of`、`redirects`、`tags`）。字段改名或结构变化时，构建会得到空包或明显变小的包，`verify.mjs` 不检查条目数下限，需要对照 `dict-build-report.json` 中的条目数判断。
