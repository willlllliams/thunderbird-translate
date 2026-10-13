# 宣传片提示词：等轴 2.5D「邮城」

本文件是 Multi Translate for Thunderbird 宣传片的完整提示词，基于「等轴 2.5D Isometric」风格模板改写。宣传片分两段生成：前半 20 秒用一座微缩城市讲三层翻译的原理，后半 50 秒在同一座城里逐个演示扩展的功能，两段拼接成约 70 秒的成片。

使用方法：新建一个空文件夹，在里面打开能写代码、能执行命令的 AI 助手（本机需要 Node、Chrome 和 ffmpeg），把对应的代码块整段发送。后半部分还需要前半的成片和最后一帧作参考，准备步骤见[后半部分](#后半部分功能街区50-秒)。

## 前半部分：邮城（20 秒）

### 相对模板的改动

模板中除 `# Creative seed` 整段替换外，只改了 4 处：

| 位置 | 改动 | 原因 |
|---|---|---|
| 第一行 | `10-second` 改为 `20-second` | 三层翻译各需约 3 秒展示过程，10 秒放不下 |
| `# Output (fixed)` | `exactly 10.000 s (300 frames)` 改为 `exactly 20.000 s (600 frames)` | 同上 |
| `# How to work` 第 5 步 | `exactly 10.00 s` 改为 `exactly 20.00 s` | 同上 |
| `# Rules` 第 2 条 | 删去「不得使用真实商标、品牌名须自拟」，改为允许使用产品名，不画 Thunderbird 与 Mozilla 的图标 | 原规则会让 AI 改掉产品名 |

其余各节（风格、技术路线、风格特征、工作流程、评审清单、自评与交付）保持原样。`Signature features` 一节是风格的判定依据，不要删改。

### 前半提示词

```text
You are the director, motion designer, engineer and sound designer of ONE 20-second motion-design film.
The goal is the most classic, yet most stunning form of this style — award-shortlist / high-end commercial quality. A clean,
template-looking result is a fail. Benchmarks: Buck, ManvsMachine, Ordinary Folk, Giant Ant, Territory Studio, Apple keynote
motion, Pentagram motion identities, top Behance/Motionographer features, top 抖音/B站 designer accounts.

# Style
等轴 2.5D Isometric / 2.5D

# Output (fixed)
- 1920×1080, 30 fps, exactly 20.000 s (600 frames), H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS
  integrated, true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
HTML: Three.js OrthographicCamera at true isometric angle + soft shadows + AO (three/addons postprocessing), or SVG with SSR matrix faces
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
「邮城」—— 一封外文邮件进城，依次经过三层翻译楼，最后变成读得懂的中文。产品：Multi Translate for Thunderbird（聚合邮件翻译 for Thunderbird）。

画面基调
- 真等轴正交镜头（35.264° 俯角，45° 方位角），无透视。主体是一座悬浮的微缩岛，地块取材于邮件客户端的界面：信封形屋顶、列表条纹道路、开关形状的地块。
- 远处虚空中漂着第二座小岛：数据中心（成排的服务器机柜）。全片只有 AI 段落的数据在两岛之间流动。
- 配色：淡紫灰底色，主色用扩展图标的蓝（#4C8BF5），辅以薄荷绿、蜜桃色、白；软阴影加环境光遮蔽。
- 主角是三层翻译楼：一层「词典」（暖灰）、二层「机器翻译」（浅蓝）、三层「AI」（亮蓝，楼顶有天线）。每层楼的正面可以像剖面图一样打开，露出内部过程。

故事节拍（20 秒）
- 0–0.5 s 钩子：一封盖满外文邮戳（日文、德文、英文字样）的信封从画面上方落下，砸在中央地块上，地块以它为中心波浪式翻起。
- 0.5–3 s 城市生长：邮局、三层翻译楼、远处的数据中心岛依次生长（底面落位 → 立面 scaleY 从 0 拉起并回弹 → 屋顶晚 2–3 帧盖上），窗户按顺序亮起。
- 3–4 s 送信：邮车沿道路把信送到翻译楼门口，信纸升起悬在楼前，显示原文：「The meeting has been moved to Thursday at 10 a.m.」
- 4–7 s 第一层「词典」——匹配过程：一层剖面打开，内部是一面卡片抽屉墙。原文单词从左到右逐个高亮，扫描光标在抽屉间跳动，抽出卡片，单词替换成中文；「moved」先变为「move」再查到「移动」（显示词形还原）；「10 a.m.」查不到，保持原样并轻轻摇头。信纸显示灰色逐词译文：「那 会议 有 被 移动 到 星期四 在 10 a.m.」
- 7–10.5 s 第二层「机器翻译」——本机计算：二层剖面打开，内部是一台透明侧板的电脑主机。CPU 核心按节奏闪动，风扇转动，上方叠起的神经网络网格被一波波点亮；数据线只在楼内循环，楼外贴一块小标牌「本机」。信纸文字整体替换为通顺的白字：「会议已改到星期四上午 10 点。」
- 10.5–14 s 第三层「AI」——数据中心：楼顶天线发出一个请求光点，越过虚空飞向数据中心岛；机柜一排排亮起，一束光纤数据流沿弧线流回楼顶，译文逐字打出，替换为最终译文：「会议改到周四上午 10 点。」
- 14–16.5 s 高潮（约 14.5 s）：信纸从楼顶飞出，平铺在城市广场上，展开成一张大信纸，原文与中文逐行交错出现（双语对照）；一块开关地块翻转，原文行整齐收起，只剩中文（仅译文）；再翻回双语。
- 16.5–18.5 s 对比：镜头整体平移后拉（不旋转，前中后景 1 : 0.8 : 0.6 视差）。本岛被一圈透明穹顶罩住，词典楼层和机器翻译楼层的灯在穹顶内亮着；只有通往数据中心的那一束光纤穿过穹顶。
- 18.5–20 s 收尾：露出两座悬浮的岛，标题贴在等轴地面上：
  主标题「Multi Translate for Thunderbird」
  副标题「词典 · 本机翻译 · AI 三层接力」
  结尾保持约 1.2 秒：邮车继续绕城，穹顶内的灯微微闪烁，数据流缓慢脉动。

画面文字（全部中文简体，只用这些）
- 原文：「The meeting has been moved to Thursday at 10 a.m.」
- 词形还原卡片：「moved → move → 移动」
- 词典层：「那 会议 有 被 移动 到 星期四 在 10 a.m.」
- 机器翻译层：「会议已改到星期四上午 10 点。」
- AI 层：「会议改到周四上午 10 点。」
- 楼层标牌：「词典」「机器翻译」「AI」；主机标牌「本机」；开关两侧：「双语对照」「仅译文」。

声音
- 明亮的拨弦 / FM 马林巴旋律，按三段翻译分成三个乐句，逐段加一层配器。
- 词典段：每次抽屉开合配木质的「嗒」，单词替换配轻快的点击声。
- 机器翻译段：低沉的电子嗡鸣加风扇声，神经网络每亮一波配一个上行琶音。
- AI 段：请求光点飞出配短促的上滑音，数据流回传配连续的数据颗粒声，逐字打出配打字音。
- 开关翻转配清脆的机械咔哒；后拉时一声空气感的嗖。

You are the director: you may change the concept, copy, story beats and brand names if you find a stronger idea, but the result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
以 30° 等轴测投影展示微缩世界：小城市、办公室切片、数据机房，无灭点、处处等比。信息密度高又不失可爱，是科技公司架构图动画和 App 功能演示的标配。School of Motion 有专门的 isometric mograph 教程系列。
视觉特征 30°等角投影, 无透视灭点, 微缩场景, 楼房生长动画, 平行滑轨式运镜
关键技法 SSR 公式造等轴面：Scale 纵向 86.6% → Shear/skew ±30° → Rotate ∓30°，三个面分别做后拼合
假 3D 靠图层排序：Z 序=画面 y 坐标，物体沿等轴网格移动时保持 2:1 像素斜率
楼房'生长'：底面先落位，立面用 scaleY 从 0 拉起 + 顶面延迟 2~3 帧盖上
运镜是整组平移（无旋转），配合前中后景 1:0.8:0.6 的视差速度
AE 里可用真 3D 图层+正交相机（无透视）偷懒，Motion Design School 的 Isometric Camera 技巧即此路

# How to work
1. Treatment. Write down one clear idea: a hook in the first 0.5 s (never open on more than 0.3 s of empty or black), an
   escalation, one unmistakable hero moment at ~60–75 % of the runtime, and a composed end frame held ~0.8–1.2 s with living
   micro-motion. Map every signature feature above to a moment. Keep one cue sheet (beats and hit times) that both the
   picture and the sound read from.
2. Key frames before motion. Build the look, render stills at 6–10 key times and actually look at them. Each still should be
   poster-worthy: composition, hierarchy, negative space, type set properly (kerning, line-height, weight contrast, CJK
   punctuation, ~5 % safe margins). Iterate until nothing looks default, generic, cramped or "AI-template".
3. Motion. Build the choreography and preview at low resolution. Step through the fastest moves frame by frame: spacing,
   easing, arcs, overlap, anticipation and follow-through, motion blur. No unintended dead spans; the energy follows the music.
4. Sound. Write genre-correct music and sound design locked to the cue sheet. Check that visual hits land on audio onsets.
   Master to the output spec.
5. Final. Render at full resolution (motion blur where apt), then check: exactly 20.00 s, resolution, fps, audio present and at
   the right loudness, no black frames, no fallback fonts or tofu, no clipped elements at the frame edges, no shimmer on thin
   lines, no gradient banding. Fix and repeat until you would submit it to a festival.
6. Write an honest self-critique: what is strongest, what is weakest, what you would do with more time.

# Rules
- Rendering must be deterministic: every frame is a pure function of time t. Seeded randomness only; physics and particles
  precomputed or closed-form; no real-time clocks; no state-triggered CSS transitions. A reliable route: a web page that can
  draw any time t on request, captured frame by frame with a headless browser and encoded with ffmpeg (or a Blender script
  that renders a PNG sequence).
- Assets: only CC0 / public domain / OFL / Apache / free-for-commercial-use. Record each source and licence in CREDITS.md.
  Use the product name "Multi Translate for Thunderbird" as given; do not draw the Thunderbird or Mozilla logos; invent any other
  brand names.
- On-screen text must be correct and natural: idiomatic Chinese, proper CJK punctuation, no typos.

# Craft checklist (what a jury looks for)
- Style authenticity: an expert names the style in one second; every signature technique is present and executed correctly.
- Motion craft: purposeful easing (no linear unless mechanical by design), overlap and stagger, anticipation and
  follow-through, arcs, squash and stretch where the style allows, consistent physics, motion blur where apt; transitions
  carried by elements, not crossfades.
- Rhythm: hits locked to the music; contrast between busy and calm; no monotony.
- Design: strong composition, grid, typographic hierarchy, controlled palette; texture and finishing (grain, glow, vignette)
  only where the style wants it; nothing looks accidental.
- Technical polish: no jitter (unless intended), no popping, no aliasing, no banding, no fallback fonts, no half-loaded images.
- Sound: genre-correct, musical, synced, mastered.

# Before you deliver, score yourself honestly
1–10 on style fidelity, concept wow, motion craft, design & typography, finish & texture, sound & sync, technical
(6 = template-level, 8 = high-end agency, 9 = award shortlist). Aim for 9; fix whatever scores lowest first.

# Deliver
video.mp4, plus a short report: the concept in two sentences; a beat sheet with timecodes; how each signature feature is
realised; the tech route; check numbers (duration, resolution, fps, loudness, true peak); your honest top-3 weaknesses.
```

## 后半部分：功能街区（50 秒）

后半是独立生成的 50 秒片段，输出规格与前半相同：1920×1080、30 fps、exactly 50.000 s（1500 帧）、H.264 MP4、48 kHz 立体声 AAC、整合响度 −14 LUFS、真峰值不高于 −1 dBTP。它的第 0 帧就是前半的最后一帧：标题收起，镜头沿滑轨进入岛上的「功能街区」，8 块等轴屏幕面板依次演示扩展的功能，最后回到两座悬浮岛和标题。

片中所有界面文字逐字取自 `locales/zh_CN.json`，功能描述以 `README.md`、`docs/settings.md`、`docs/providers.md` 和源码为准：22 家 AI 服务商、12 种界面语言、「下载常用语言」固定下载 8 种语言与英语之间的方向、快捷键 Alt+A / Alt+S / Alt+R。三层翻译的演示与设置向导第 3 步的演示一致：结果到达顺序为词典、机器翻译、AI，临时译文用斜体、调淡并带层级名标签。

### 生成步骤

1. 新建一个空文件夹，把前半的成片复制进去，改名为 `part1.mp4`。
2. 在该文件夹中导出前半的最后一帧。命令解码最后 1 秒，每一帧都覆盖写入同一个文件，留下的就是最后一帧：

   ```sh
   ffmpeg -sseof -1 -i part1.mp4 -update 1 part1-last-frame.png
   ```

3. 前半的工程文件夹如果还在，把它整个复制进来，命名为 `part1/`。AI 助手会直接复用其中的场景代码、字体、配色和 cue sheet，衔接最准确。没有这个文件夹时，它只能照着 `part1-last-frame.png` 重建场景。
4. 把下方提示词整段发送。得到的 `video.mp4` 改名为 `part2.mp4`。

### 拼接

两段在接缝处重叠 0.2 s：画面用 `xfade` 做 6 帧淡化，声音用 `acrossfade` 做交叉淡化。

```sh
ffmpeg -i part1.mp4 -i part2.mp4 -filter_complex "[0:v]fps=30,settb=AVTB[v0];[1:v]fps=30,settb=AVTB[v1];[v0][v1]xfade=transition=fade:duration=0.2:offset=19.8,format=yuv420p[v];[0:a][1:a]acrossfade=d=0.2:c1=tri:c2=tri[a]" -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 16 -c:a aac -b:a 256k -ar 48000 -movflags +faststart promo.mp4
```

各参数的作用：

- `fps=30,settb=AVTB`：两段由不同的渲染流程产生，时间基可能不同，`xfade` 要求两路输入的帧率和时间基一致。
- `offset=19.8`：淡化从前半的 19.8 s 开始，等于前半时长减去重叠的 0.2 s。
- 画面与声音重叠同样的 0.2 s：`acrossfade` 让后半的声音整体提前 0.2 s。画面不重叠时，后半的声音会比画面早 6 帧，所有节拍点都对不上；画面同时提前 0.2 s，音画关系保持不变。
- `c1=tri:c2=tri`：线性淡化曲线。提示词要求后半前 0.3 s 只延续前半结尾和弦的余音，所以接缝两侧是同一个和弦，两路信号高度相关。相关信号用线性曲线时两路增益之和恒为 1，响度不变；等功率曲线（`qsin`）在中点的增益之和为 √2，会在接缝处鼓起约 3 dB，它适合两段不相关的声音。

后半第 0 帧与前半最后一帧相同，0–0.3 s 只有延续的微动，6 帧淡化发生在两张几乎一样的画面之间，看不出痕迹。成片时长为 20 + 50 − 0.2 = 69.8 s，共 2094 帧。

拼接后检查响度与真峰值：

```sh
ffmpeg -i promo.mp4 -af ebur128=peak=true -f null -
```

两段各自已是 −14 LUFS，拼接后的整合响度仍在 −14 LUFS 附近。整合响度偏差超过 0.5 LU 或真峰值高于 −1 dBTP 时，再做一次响度标准化：

```sh
ffmpeg -i promo.mp4 -c:v copy -af loudnorm=I=-14:TP=-1:LRA=11 -c:a aac -b:a 256k -ar 48000 -movflags +faststart promo-final.mp4
```

需要严格 70.0 s 时可以改用硬切（`concat` 滤镜，`n=2:v=1:a=1`），前提是后半第 0 帧与前半最后一帧逐像素一致。硬切处两段声音波形不连续，通常能听到一声轻微的咔嗒，所以默认用上面的重叠方式。

### 相对前半提示词的改动

`Style`、`Suggested technical route`、`Signature features`、`Craft checklist`、自评和 `Deliver` 各节与前半逐字相同。改动如下：

| 位置 | 改动 | 原因 |
|---|---|---|
| 第一行 | `20-second` 改为 `50-second` | 后半有 8 个功能块，其中三层翻译单独占约 15 秒 |
| `# Output (fixed)` | `exactly 20.000 s (600 frames)` 改为 `exactly 50.000 s (1500 frames)` | 同上 |
| `# Creative seed` | 整段重写：参考文件、画面基调、50 秒节拍、画面文字清单（附 locale key）、声音 | 内容从翻译原理换成功能演示 |
| Creative seed 之后的导演说明 | 可改动的范围从「概念、文案、节拍、品牌名」收窄为「概念、节拍和自拟字幕」，界面文字与示例句不得改动 | 界面文字必须与扩展的简体中文界面一致 |
| `# How to work` 第 1 步 | 「前 0.5 s 的钩子」改为「第 0 帧与 `part1-last-frame.png` 一致，0.3 s 起出现新动作」 | 后半接在前半之后，开头是衔接而不是从空画面起钩子 |
| `# How to work` 第 1 步 | `one unmistakable hero moment at ~60–75 % of the runtime` 改为 `one unmistakable hero moment inside the three-tier sequence (about 21–26 s)` | 用户要求：高潮放在三层翻译段内 |
| `# How to work` 第 5 步 | `exactly 20.00 s` 改为 `exactly 50.00 s`，并增加检查：第 0 帧与 `part1-last-frame.png` 一致 | 接缝处的淡化依赖这两帧相同 |
| `# Rules` 第 2 条 | 增加：服务名与 GitHub 只按清单以纯文字出现，不画任何图标 | 界面演示需要出现 Google Translate、Bergamot、DeepSeek 等服务名 |
| `# Before you deliver, score yourself honestly` | 增加一句：concept wow 主要按约 26 s 的高潮打分 | 自评要对准新的高潮位置 |

高潮定在第 3 块的最后一个小演示「最高层失败与重试」：光纤断开，机器译文留在原处并标出「AI 翻译失败」，点击后只重试 AI，26.0 s AI 译文落下（全片 52 %）。这一幕有完整的紧张与解决：断网时音乐撤空、城市灯光降一档，重试时镜头推进、光纤一路焊回，译文落下的同一帧全城灯光同步亮起、音乐全配器进入。它同时演示了三层设计最实用的一点：高层失败时读者手里仍有一份译文，重试只花失败那一层的请求。第 3 块其余四个小演示逐步加码，为它蓄势。第 4 块「下载常用语言」的包裹汇聚保留，降为次高点（约 31 s）。

### 后半提示词

```text
You are the director, motion designer, engineer and sound designer of ONE 50-second motion-design film.
The goal is the most classic, yet most stunning form of this style — award-shortlist / high-end commercial quality. A clean,
template-looking result is a fail. Benchmarks: Buck, ManvsMachine, Ordinary Folk, Giant Ant, Territory Studio, Apple keynote
motion, Pentagram motion identities, top Behance/Motionographer features, top 抖音/B站 designer accounts.

# Style
等轴 2.5D Isometric / 2.5D

# Output (fixed)
- 1920×1080, 30 fps, exactly 50.000 s (1500 frames), H.264 MP4 with stereo AAC audio (48 kHz), mastered to −14 LUFS
  integrated, true peak ≤ −1 dBTP. Final file: video.mp4.

# Suggested technical route
HTML: Three.js OrthographicCamera at true isometric angle + soft shadows + AO (three/addons postprocessing), or SVG with SSR matrix faces
(You may choose a better route if it clearly raises quality; say why.)

# Creative seed
「功能街区」—— 镜头从前半「邮城」的结尾沿滑轨进岛，一条街上立着 8 块等轴屏幕面板，依次亮起，把扩展的界面一块块演示出来；最后退回两座悬浮岛，标题重新拼起。产品：Multi Translate for Thunderbird（聚合邮件翻译 for Thunderbird）。本片是 70 秒宣传片的后半部分，前半是 20 秒的「邮城」，两段拼接后连续播放。

参考文件（在当前文件夹中）
- part1-last-frame.png：前半的最后一帧。本片第 0 帧必须与它一致：构图、配色、两座岛的位置、标题的字体与位置都相同。
- part1.mp4：前半成片。用它核对运动节奏，并从声音中读出速度、调性和音色。
- part1/（如果存在）：前半的工程文件，含场景代码、字体、配色和 cue sheet。存在时直接复用其中的岛屿、三层翻译楼、邮车、穹顶、数据中心岛和字体，不要重画。

画面基调
- 镜头与配色和前半完全一致：真等轴正交镜头（35.264° 俯角，45° 方位角），无透视；淡紫灰底色，主色用扩展图标的蓝（#4C8BF5），辅以薄荷绿、蜜桃色、白；软阴影加环境光遮蔽。
- 岛上的「功能街区」：沿一条等轴街道立着 8 块屏幕面板，每块立在一个小基座上，像小楼的一面墙。面板内容是扩展界面的矢量重绘：圆角控件、下拉框、开关、按钮、进度条，白底、浅灰分隔线、蓝色强调。不用真实截图，不画 Thunderbird、Mozilla 或任何服务商的图标。
- 运镜只有整组平移和正交缩放推进，不旋转，前中后景按 1 : 0.8 : 0.6 视差。块与块之间用 0.4–0.6 s 的滑轨平移过渡，带缓入缓出和轻微过冲。
- 面板文字必须读得清：推进后面板约占画面宽度的 55–65 %，投影后汉字字高不小于 26 px；界面按 2 倍分辨率绘制后再投影到等轴面上，细线不闪烁。字体用 OFL 授权的 Noto Sans SC / JP / KR 和 Noto Sans，覆盖清单中的日文、韩文、俄文和越南文，不出现缺字方块。
- 前半的元素继续参与演示：三层翻译楼、邮车、透明穹顶、通往数据中心岛的光纤。界面上的每个动作在城里都有对应的动作（下文逐条写出），屏幕面板和城市是同一个世界。
- 译文按扩展的真实样式绘制：
  - 加载中：段落下方一个强调色描边的小转圈，旁边「翻译中…」。
  - 临时译文（较低层级的结果）：斜体，比最终译文淡（不透明度乘 0.75），段尾一个细描边的圆角小标签，写层级名。
  - 最终译文（在用的最高层级的结果）：正体，无标签，左侧一条强调色竖线（默认样式「左侧竖线」）。
  - 最高层级失败：较低层级的译文留在原处，改为正体，段尾是红色（#C5221F）、带点状下划线、可点击的「AI 翻译失败」。
  - 译文替换时，旧译文下沉约 6 px 并淡出，新译文落下并轻微过冲；整块面板不做交叉淡化。

故事节拍（50 秒）

0–2 s 衔接
- 0–0.3 s：第 0 帧与 part1-last-frame.png 一致。邮车继续绕城，穹顶内的灯微闪，数据流缓慢脉动，延续前半结尾的微动，不加新动作。
- 0.3–0.9 s：标题收起。主标题和副标题的字像地砖一样依次向地面翻倒（相邻两字错开 1–2 帧），翻下后成为街道的铺路石。
- 0.9–2 s：镜头沿滑轨平移进岛，前景的树和路灯按视差掠过，停在「功能街区」入口。8 块面板沿街排开，屏幕暗着。

2–6.5 s 第 1 块：安装与新手引导
- 2–2.6 s：一个扩展安装包（贴着拼图形状标签的小包裹）从上方落进第一块面板的基座。基座亮起，面板按楼房生长的节奏拉起：底座落位 → 面板 scaleY 从 0 拉起并回弹 → 顶部边框晚 2–3 帧盖上。
- 2.6–6 s：面板显示新手引导页，标题「设置 Thunderbird 邮件翻译」，下面是 8 个步骤的编号列表：「语言」「显示方式」「翻译层级」「离线翻译」「在线机器翻译」「AI 翻译」「提示词」「完成」。光标点「下一步」，步骤条逐个点亮，约 0.4 s 一步；中途有一步点「跳过此步」。每点亮一步，街上亮起一盏路灯。
- 6–6.5 s：走到「完成」，进度条满格，面板顶部弹起一个小对勾。

6.5–11.5 s 第 2 块：弹窗与快捷键
- 6.5–7.2 s：镜头滑到第二组面板。左边一块邮件面板（阅读窗格），显示原文「The meeting has been moved to Thursday at 10 a.m.」；右边一块较窄的弹出面板，顶部「Thunderbird 邮件翻译」，按钮「翻译此邮件」，下面是「显示方式」开关（「双语对照」/「仅译文」）和「翻译层级」的三个下拉框，底部一行「快捷键：Alt+A 翻译，Alt+S 切换显示方式，Alt+R 重新翻译」。前景地面升起三颗等轴键帽「Alt+A」「Alt+S」「Alt+R」。
- 7.2–8.4 s：键帽「Alt+A」按下（下沉后回弹）。三层翻译楼的灯一闪而过，原文下方先出现斜体临时译文，随即被最终译文「会议改到周四上午 10 点。」替换（这个过程在第 3 块细讲，这里只一闪）。弹出面板的按钮变为「显示原文」和「重新翻译」，进度显示「已翻译 1 / 1」。
- 8.4–9.8 s：键帽「Alt+S」按下，开关滑到「仅译文」，原文行整齐收起，只剩译文；再按一次，回到「双语对照」。
- 9.8–11.5 s：键帽「Alt+R」按下，「重新翻译」按钮高亮。译文退回为斜体的临时译文「会议已改到星期四上午 10 点。」，带「机器翻译」标签；城里三层楼重新亮起一轮，最终译文「会议改到周四上午 10 点。」再次替换上来。

11.5–27 s 第 3 块：三层翻译（5 个小演示，逐个加码，最后一个是全片的 hero moment）
面板是新手引导第 3 步「翻译层级」的样式：上面三个下拉框「层级 1：词典」「层级 2：机器翻译」「层级 3：AI 翻译」；下面是演示框「各层级如何配合」，框内是示例原文「Could we move tomorrow’s meeting to Thursday? I will send the new slides tonight.」，译文显示在它下方，框底一行状态文字写出当前显示结果的层级和服务。面板旁的地面上铺一条等轴时间轴滑轨，只有刻度、不写数字：每次演示开始时一个光点从左端出发，某层结果到达时在滑轨上立起一根该层颜色的标针（词典暖灰、机器翻译浅蓝、AI 亮蓝），表示先后到达。面板后方的三层翻译楼同步：某层在用时该层窗户亮着，结果到达时该层闪一下；选「不使用」时该层熄灯。每次改动下拉框，演示从头重播（与扩展的行为一致）。

- 11.5–15.5 s 三层全开：
  - 11.5–12 s：三个下拉框依次落定为「词典（离线）」「Google Translate（免费）」「DeepSeek」。
  - 12 s：演示框出现转圈和「翻译中…」，滑轨上的光点出发。
  - 12.3 s：词典的逐词粗译「能 我们 移动 明天 会议 到 星期四？我 发送 新 幻灯片 今晚。」以临时译文样式出现，标签「词典」；状态行「层级 1：词典 · 词典（离线）」。光标悬停在标签上，弹出提示「临时译文，等待：AI 翻译」。
  - 13 s：机器翻译「我们可以把明天的会议移到星期四吗？我将在今晚发送新的幻灯片。」替换上来，仍是临时译文，标签「机器翻译」；状态行「层级 2：机器翻译 · Google Translate（免费）」。
  - 14.3 s：AI 译文「明天的会能改到周四吗？新的幻灯片我今晚发给你。」替换为最终样式：正体、无标签、左侧竖线；状态行「层级 3：AI 翻译 · DeepSeek」。
  - 14.3–15.5 s：停留阅读，滑轨上三根标针按先后排开，前两根间距短、后一根间距长。
- 15.5–18 s 关掉词典：
  - 15.5 s：光标打开「层级 1：词典」下拉框，列表为「不使用」「词典（离线）」「＋ 添加翻译服务…」，选「不使用」。一层熄灯，滑轨清空。
  - 15.9 s：「翻译中…」。16.4 s：第一个出现的结果变成机器翻译（临时译文，标签「机器翻译」）。17.3 s：AI 最终译文替换。
- 18–20.5 s 只开 AI：
  - 18 s：「层级 2：机器翻译」也改为「不使用」，二层熄灯，只剩 AI 层和光纤亮着。
  - 18.3–19.6 s：「翻译中…」的转圈一直转，滑轨上光点前进但没有标针立起；一个请求光点从楼顶飞向数据中心岛，再沿光纤流回。
  - 19.6 s：AI 最终译文直接出现，没有临时译文；状态行「层级 3：AI 翻译 · DeepSeek」。停留到 20.5 s。
- 20.5–23.5 s 第 2 层切换离线与在线：
  - 20.5 s：「层级 2：机器翻译」选「Bergamot（离线）」。二层亮灯，二层旁的地面弹起一块小标牌「本机」（与前半的标牌相同），二层的数据只在穹顶内循环。
  - 20.9 s：机器翻译临时译文出现，状态行「层级 2：机器翻译 · Bergamot（离线）」。21.8 s：AI 最终译文替换。
  - 22.1 s：改选「Google Translate（免费）」。「本机」标牌向地面翻倒收起，一条细数据线从二层穿出穹顶，伸向画面外。
  - 22.4 s：机器翻译临时译文出现，状态行「层级 2：机器翻译 · Google Translate（免费）」。23.1 s：AI 最终译文替换。
- 23.5–27 s 最高层失败与重试（全片的 hero moment，落在 26.0 s）：
  - 23.5 s：镜头滑回邮件面板，正文是同一句示例原文；面板后方能同时看到三层翻译楼和通往数据中心岛的光纤。在用的层级为第 2 层 Google Translate 和第 3 层 DeepSeek。
  - 23.8 s：翻译开始。24.1 s：机器翻译的临时译文出现，标签「机器翻译」。
  - 24.4 s：通往数据中心岛的光纤中途断开，迸出一点火花，请求光点掉进虚空。AI 层熄灯，全城的灯光整体降一档，只有二层还亮着。
  - 24.7 s：机器翻译的译文留在原处，斜体变为正体，标签换成红色的「AI 翻译失败」。画面在这里安静约 0.5 s，只有火花余烬飘落。
  - 25.2 s：光标点击「AI 翻译失败」。只有 AI 层重试：AI 层的窗户重新亮起，一道焊接光从楼顶沿断开的光纤一路跑向数据中心岛，把它接回；机器翻译的译文没有重新请求，原地恢复为带「机器翻译」标签的斜体临时译文，没有闪烁和转圈。镜头从点击这一刻开始正交推进（只放大，不旋转），朝面板和三层楼慢慢靠近。
  - 26.0 s hero：数据流沿接好的光纤回到楼顶，AI 最终译文「明天的会能改到周四吗？新的幻灯片我今晚发给你。」落下替换。同一帧里全城灯光同步亮起：从三层楼开始，一圈 2:1 菱形光波向外扩散，依次点亮三层楼的每层窗户、穹顶、路灯、8 块面板的基座和数据中心岛的机柜，光纤整条满亮。
  - 26.0–27 s：推进在 26.0 s 后带一次轻微过冲停住，光波余辉慢慢退回常亮，停留阅读。27 s 转场时镜头缩放复原并接滑轨平移。

27–32.5 s 第 4 块：离线翻译（包裹汇聚是全片的次高点，约 31 s）
- 27–28.6 s：邮件面板，第 2 层用「Bergamot（离线）」。邮件上方滑下一条提示：标题「离线翻译缺少本地数据」，一行「Bergamot：英语（English） → 简体中文，缺少 英语（English） → 简体中文」，下面是按钮「去设置下载」、复选框「这些语言不再提醒我」和按钮「关闭」。光标掠过复选框（高亮，不勾选），在 28.4 s 点击「去设置下载」。
- 28.6–29.7 s：镜头滑到设置面板「离线翻译模型（Bergamot）」，列表行画成浅灰条，按钮「下载常用语言」。29.2 s 点击，弹出确认卡片（若干浅灰条目）和按钮「确认下载」，29.6 s 点击。
- 29.7–31.6 s 次高点：画面右侧虚空中浮起一座小小的模型仓库平台（货架，无标识），8 个包裹沿弧线飞向本岛，包裹上盖着邮戳：「简体中文」「Español」「Français」「Deutsch」「日本語」「Português」「Русский」「한국어」。包裹两个一组起飞，对应扩展同时下载两项；列表中两行显示「正在下载… 37%」这样不断增长的百分比和「取消」，其余行显示「等待中…」。每个包裹穿过穹顶落地，对应的行翻成「已安装」。约 31 s 最后几个包裹螺旋汇聚，穹顶整体一亮，二层的离线循环变成常亮。地面盖上字幕「8 种常用语言，一键下载」。
- 31.6–32.5 s：「下载常用语言」按钮变灰，显示「常用语言均已安装。」。

32.5–36.5 s 第 5 块：AI 服务
- 面板是新手引导第 6 步「AI 翻译」的样式。
- 32.5–33.6 s：光标打开「AI 服务」下拉框，22 个选项行像瀑布一样展开（画成长短不一的浅灰条，不写服务商名称）；同时数据中心岛上 22 台小机柜按 2:1 网格逐台亮起。地面字幕「22 家 AI 服务商」。下拉框落定为「DeepSeek」。
- 33.6–34.9 s：「API 密钥」输入框填入一串圆点。「思考模式」开关默认关闭；光标把它打开，光纤上的请求光点先绕一个慢圈（推理）再回来；再关上，光点直线快速往返。开关停在关闭。
- 34.9–36.5 s：「精翻」开关打开。旁边的邮件面板（几段正文画成浅灰条）被一道描边整体框住，描边的副本随请求光点一起飞向数据中心岛，表示整封邮件作为上下文；三段正文中同一个名字的位置用同色小块同时点亮，表示术语前后一致。

36.5–40.5 s 第 6 块：提示词预设
- 面板标题「提示词预设」，控件「预设」「变体」和按钮「应用预设」，下方一行「示例：」接示例译文。
- 36.5–37 s：「预设」下拉框展开五项：「普通（不追加规则）」「方言 / 地区用语」「难词保留原文」「难词解释」「语言风格」。
- 37–37.7 s：选「方言 / 地区用语」，「变体」显示两个选项「粤语（香港）」「四川话」。
- 37.7–38.5 s：选「难词保留原文」，示例「我们会在签署投资条款清单（term sheet）之前完成尽职调查（due diligence）。」，括号部分用强调色依次亮起。
- 38.5–39.3 s：选「难词解释」，示例「我们会在签署投资条款清单之前完成尽职调查。〔注：尽职调查：交易前对目标公司财务、法律等情况的全面核查；投资条款清单：列出投资主要条件的文件〕」，注释部分从句末展开。
- 39.3–40.5 s：选「语言风格」，「变体」显示「正式商务」「口语随意」「简明易懂（面向语言学习者）」「文学化」。变体依次切换，示例随之翻页：「我方将于签署投资条款清单前完成尽职调查。」→「签条款清单之前，我们会先把尽调搞定。」→「在落笔签下条款清单之前，我们会将尽职调查逐一做完。」。光标点「应用预设」，一段规则像纸条一样插进 AI 层的楼顶。

40.5–44.5 s 第 7 块：译文样式
- 面板标题「译文样式」，控件「样式」「强调色」「文字颜色」（显示「跟随邮件正文」）「文字不透明度」「字号比例」，下方是实时预览：原文「The quarterly report is attached. Please review it before Friday.」，译文「季度报告已附上，请在周五前审阅。」。
- 40.5–41.8 s：「样式」依次切换「左侧竖线」→「左侧虚线」→「底色高亮」→「无装饰」→ 回到「左侧竖线」，预览随每次点击即时变化。
- 41.8–43 s：「强调色」色块从蓝滑到薄荷绿、蜜桃色，再回到蓝；预览的竖线和街区地面的描边一起变色。
- 43–44.5 s：「文字不透明度」滑块拖低再拖回，「字号比例」滑块拖大再拖回，预览译文同步变淡变浓、变大变小。

44.5–50 s 第 8 块：收尾
- 44.5–45.7 s：「界面语言」下拉框展开，12 个选项飞出，变成街边的小路牌依次插进地面：「English」「简体中文」「繁體中文」「日本語」「한국어」「Français」「Deutsch」「Español」「Português (Brasil)」「Русский」「Türkçe」「Tiếng Việt」。地面字幕「12 种界面语言」。
- 45.7–46.6 s：一个「API 密钥」输入框（圆点）折成一把小钥匙，落进穹顶内的一个小保险柜，柜门关上。地面字幕「密钥只存在本机」。
- 46.6–47.5 s：地面像前半的邮戳一样盖上「开源免费 · GPL-3.0」。
- 47.5–48.8 s：镜头整体后拉（前中后景 1 : 0.8 : 0.6 视差），面板依次向地面放平收起；开场翻倒的铺路石重新立起，拼回标题，构图与前半结尾一致：
  主标题「Multi Translate for Thunderbird」
  副标题「词典 · 本机翻译 · AI 三层接力」
  下方一行「在 GitHub 下载」，其下一行等宽小字「willlllliams/thunderbird-translate」
- 48.8–50 s：保持约 1.2 秒：邮车继续绕城，穹顶内的灯微微闪烁，数据流缓慢脉动，路牌轻轻摇晃。

画面文字（只用这些。除示例原文、服务名、语言自称、键名和仓库名外全部为简体中文。界面文字逐字取自扩展的简体中文界面，括号内是 locales/zh_CN.json 的 key，key 不上屏；$1、$2 是已代入的值）
- 新手引导：「设置 Thunderbird 邮件翻译」（welcomeTitle）；步骤「语言」（stepLanguage）「显示方式」（stepDisplay）「翻译层级」（stepTiers）「离线翻译」（stepOffline）「在线机器翻译」（stepMachine）「AI 翻译」（stepAi）「提示词」（stepPrompts）「完成」（stepFinish）；按钮「下一步」（buttonNext）「跳过此步」（buttonSkipStep）。
- 弹出面板：「Thunderbird 邮件翻译」（extensionName）；「翻译此邮件」（popupTranslate）「显示原文」（popupShowOriginal）「重新翻译」（popupRetranslate）；「显示方式」（labelMode）「双语对照」（modeBilingual）「仅译文」（modeTranslationOnly）；「翻译层级」（labelTiers）；「已翻译 1 / 1」（popupProgress）；「快捷键：Alt+A 翻译，Alt+S 切换显示方式，Alt+R 重新翻译」（popupShortcuts）；键帽「Alt+A」「Alt+S」「Alt+R」。
- 第 2 块的邮件：原文「The meeting has been moved to Thursday at 10 a.m.」；临时译文「会议已改到星期四上午 10 点。」；最终译文「会议改到周四上午 10 点。」（三句与前半相同）。
- 层级与服务：「层级 1：词典」「层级 2：机器翻译」「层级 3：AI 翻译」（tierLabel，代入 tierDictionary / tierMachine / tierAi）；「不使用」（tierNotUsed）；「＋ 添加翻译服务…」（tierAddService）；「词典（离线）」（providerDictionary）；「Bergamot（离线）」（providerOffline）；「Google Translate（免费）」（providerFree）；「DeepSeek」（服务名，来自 src/shared/providers.ts）。
- 三层演示：「各层级如何配合」（demoTitle）；原文「Could we move tomorrow’s meeting to Thursday? I will send the new slides tonight.」（demoSource，撇号是 ’）；词典「能 我们 移动 明天 会议 到 星期四？我 发送 新 幻灯片 今晚。」（demoDictionary）；机器翻译「我们可以把明天的会议移到星期四吗？我将在今晚发送新的幻灯片。」（demoMachine）；AI「明天的会能改到周四吗？新的幻灯片我今晚发给你。」（demoAi）。
- 译文状态：「翻译中…」（statusTranslating）；临时译文标签「词典」「机器翻译」（tierDictionary、tierMachine）；悬停提示「临时译文，等待：AI 翻译」（statusProvisionalHint）；失败标记「AI 翻译失败」（statusTierFailed）；状态行「层级 1：词典 · 词典（离线）」「层级 2：机器翻译 · Google Translate（免费）」「层级 2：机器翻译 · Bergamot（离线）」「层级 3：AI 翻译 · DeepSeek」（演示框状态行，格式为 tierLabel + 「 · 」+ 服务名）。
- 场景标牌：「本机」（前半的标牌，不是界面文字）。
- 离线：「离线翻译缺少本地数据」（noticeMissingTitle）；「Bergamot：英语（English） → 简体中文，缺少 英语（English） → 简体中文」（noticeMissingBergamot）；「去设置下载」（noticeOpenSettings）「这些语言不再提醒我」（noticeMute）「关闭」（noticeClose）；「离线翻译模型（Bergamot）」（sectionBergamot）；「下载常用语言」（buttonDownloadCommon）「确认下载」（buttonConfirmDownload）；「正在下载… 37%」（dictDownloading，百分比随进度变化）「等待中…」（dictQueued）「取消」（buttonCancel）「已安装」（dictInstalled）「常用语言均已安装。」（commonAllInstalled）；包裹邮戳「简体中文」「Español」「Français」「Deutsch」「日本語」「Português」「Русский」「한국어」（「下载常用语言」的 8 种语言，各语言自称）。
- AI：「AI 服务」（labelAiService）「API 密钥」（labelApiKey）「思考模式」（labelThinking）「精翻」（labelPrecise）。
- 提示词预设：「提示词预设」（presetsTitle）「预设」（presetLabel）「变体」（presetOptionLabel）「应用预设」（buttonApplyPreset）「示例：」（presetExample）；「普通（不追加规则）」（presetNone）「方言 / 地区用语」（presetDialect）「难词保留原文」（presetKeepTerms）「难词解释」（presetExplainTerms）「语言风格」（presetStyle）；「粤语（香港）」（presetDialectYueHK）「四川话」（presetDialectSichuan）；「正式商务」（presetStyleFormal）「口语随意」（presetStyleCasual）「简明易懂（面向语言学习者）」（presetStylePlain）「文学化」（presetStyleLiterary）；示例句 presetKeepTermsExample、presetExplainTermsExample、presetStyleFormalExample、presetStyleCasualExample、presetStyleLiteraryExample（原文见节拍）。
- 译文样式：「译文样式」（sectionStyle）「样式」（labelStylePreset）「左侧竖线」（styleBorder）「左侧虚线」（styleDashed）「底色高亮」（styleHighlight）「无装饰」（stylePlain）「强调色」（labelColor）「文字颜色」（labelTextColor）「跟随邮件正文」（textColorAuto）「文字不透明度」（labelOpacity）「字号比例」（labelFontScale）；预览「The quarterly report is attached. Please review it before Friday.」（stylePreviewOriginal）「季度报告已附上，请在周五前审阅。」（stylePreviewTranslation）。
- 界面语言：「界面语言」（labelUiLanguage）；路牌是 12 种界面语言的自称，与扩展的语言选择列表相同（src/shared/locales.ts 的 LOCALE_NATIVE_NAMES）。
- 自拟字幕：「8 种常用语言，一键下载」「22 家 AI 服务商」「12 种界面语言」「密钥只存在本机」「开源免费 · GPL-3.0」。
- 结尾：主标题「Multi Translate for Thunderbird」；副标题「词典 · 本机翻译 · AI 三层接力」；「在 GitHub 下载」；「willlllliams/thunderbird-translate」。

声音
- 沿用前半的拨弦 / FM 马林巴动机，速度、调性和音色与前半相同（从 part1/ 的 cue sheet 读取，没有时从 part1.mp4 的声音测出）。
- 0–0.3 s 只延续前半结尾和弦的余音，不加新的起音；第一个新音落在 0.3 s 标题开始翻倒的那一帧。拼接时接缝处做 0.2 s 交叉淡化，两侧是同一个和弦，听不出接缝。
- 每个功能块一个乐句，共 8 句，配器逐块加厚。第 3 块的 5 个小演示是同一乐句框架下的 5 个短乐节，每个小演示重播时动机重来一次并变奏。块间的滑轨平移配一声空气感的嗖。
- 界面音效：按钮和下拉选项用短而干的木质「嗒」；开关用清脆的机械咔哒；键帽按下用厚实的键盘声；临时译文到达用轻点，最终译文到达用略亮的钟音；下载进度用细碎上行的颗粒声，每项下载完成用两音的上行铃声。
- hero（26.0 s）：24.4 s 光纤断开时音乐撤到只剩一个持续低音，火花配一声短促的电火花和音高下坠的闷音；25.2 s 点击重试起，焊接光前进配一个渐强的上滑音；26.0 s AI 译文落下、全城灯光亮起的同一帧，全部配器进入，一记重拍。这是全片最响、最满的一刻。
- 次高点（约 31 s）：包裹汇聚时配器加厚，但不全进，重拍落在穹顶一亮的那一帧，力度明显低于 26.0 s。
- 47.5 s 起回到前半结尾的主题动机，48.8 s 落在主和弦并延续到结束。

You are the director: you may change the concept, story beats and the self-written captions if you find a stronger idea, but every interface label and sample sentence stays exactly as listed above, and the result must remain the CANONICAL, instantly-recognisable form of this style and must hit its signature features below.

# Signature features and key techniques (the result is judged against these)
以 30° 等轴测投影展示微缩世界：小城市、办公室切片、数据机房，无灭点、处处等比。信息密度高又不失可爱，是科技公司架构图动画和 App 功能演示的标配。School of Motion 有专门的 isometric mograph 教程系列。
视觉特征 30°等角投影, 无透视灭点, 微缩场景, 楼房生长动画, 平行滑轨式运镜
关键技法 SSR 公式造等轴面：Scale 纵向 86.6% → Shear/skew ±30° → Rotate ∓30°，三个面分别做后拼合
假 3D 靠图层排序：Z 序=画面 y 坐标，物体沿等轴网格移动时保持 2:1 像素斜率
楼房'生长'：底面先落位，立面用 scaleY 从 0 拉起 + 顶面延迟 2~3 帧盖上
运镜是整组平移（无旋转），配合前中后景 1:0.8:0.6 的视差速度
AE 里可用真 3D 图层+正交相机（无透视）偷懒，Motion Design School 的 Isometric Camera 技巧即此路

# How to work
1. Treatment. Write down one clear idea: an opening that continues the first half (frame 0 matches part1-last-frame.png,
   and new motion starts by 0.3 s; never open on empty or black), an
   escalation, one unmistakable hero moment inside the three-tier sequence (about 21–26 s), and a composed end frame held ~0.8–1.2 s with living
   micro-motion. Map every signature feature above to a moment. Keep one cue sheet (beats and hit times) that both the
   picture and the sound read from.
2. Key frames before motion. Build the look, render stills at 6–10 key times and actually look at them. Each still should be
   poster-worthy: composition, hierarchy, negative space, type set properly (kerning, line-height, weight contrast, CJK
   punctuation, ~5 % safe margins). Iterate until nothing looks default, generic, cramped or "AI-template".
3. Motion. Build the choreography and preview at low resolution. Step through the fastest moves frame by frame: spacing,
   easing, arcs, overlap, anticipation and follow-through, motion blur. No unintended dead spans; the energy follows the music.
4. Sound. Write genre-correct music and sound design locked to the cue sheet. Check that visual hits land on audio onsets.
   Master to the output spec.
5. Final. Render at full resolution (motion blur where apt), then check: exactly 50.00 s, resolution, fps, audio present and at
   the right loudness, frame 0 matches part1-last-frame.png, no black frames, no fallback fonts or tofu, no clipped elements
   at the frame edges, no shimmer on thin lines, no gradient banding. Fix and repeat until you would submit it to a festival.
6. Write an honest self-critique: what is strongest, what is weakest, what you would do with more time.

# Rules
- Rendering must be deterministic: every frame is a pure function of time t. Seeded randomness only; physics and particles
  precomputed or closed-form; no real-time clocks; no state-triggered CSS transitions. A reliable route: a web page that can
  draw any time t on request, captured frame by frame with a headless browser and encoded with ffmpeg (or a Blender script
  that renders a PNG sequence).
- Assets: only CC0 / public domain / OFL / Apache / free-for-commercial-use. Record each source and licence in CREDITS.md.
  Use the product name "Multi Translate for Thunderbird" as given; do not draw the Thunderbird or Mozilla logos; invent any other
  brand names. Service and site names (Google Translate, Bergamot, DeepSeek, GitHub) appear only as plain text exactly as
  listed in the Creative seed; draw no logo of any service or site.
- On-screen text must be correct and natural: idiomatic Chinese, proper CJK punctuation, no typos.

# Craft checklist (what a jury looks for)
- Style authenticity: an expert names the style in one second; every signature technique is present and executed correctly.
- Motion craft: purposeful easing (no linear unless mechanical by design), overlap and stagger, anticipation and
  follow-through, arcs, squash and stretch where the style allows, consistent physics, motion blur where apt; transitions
  carried by elements, not crossfades.
- Rhythm: hits locked to the music; contrast between busy and calm; no monotony.
- Design: strong composition, grid, typographic hierarchy, controlled palette; texture and finishing (grain, glow, vignette)
  only where the style wants it; nothing looks accidental.
- Technical polish: no jitter (unless intended), no popping, no aliasing, no banding, no fallback fonts, no half-loaded images.
- Sound: genre-correct, musical, synced, mastered.

# Before you deliver, score yourself honestly
1–10 on style fidelity, concept wow, motion craft, design & typography, finish & texture, sound & sync, technical
(6 = template-level, 8 = high-end agency, 9 = award shortlist). Aim for 9; fix whatever scores lowest first.
Judge concept wow mainly on the hero moment at 26.0 s (the AI tier recovering inside the three-tier sequence).

# Deliver
video.mp4, plus a short report: the concept in two sentences; a beat sheet with timecodes; how each signature feature is
realised; the tech route; check numbers (duration, resolution, fps, loudness, true peak); your honest top-3 weaknesses.
```
