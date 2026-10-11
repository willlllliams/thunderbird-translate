# 宣传片提示词：等轴 2.5D「邮城」

本文件是 Thunderbird Translate 宣传片的完整提示词，基于「等轴 2.5D Isometric」风格模板改写。使用方法：新建一个空文件夹，在里面打开能写代码、能执行命令的 AI 助手（本机需要 Node、Chrome 和 ffmpeg），把下方代码块整段发送。

## 相对模板的改动

模板中除 `# Creative seed` 整段替换外，只改了 4 处：

| 位置 | 改动 | 原因 |
|---|---|---|
| 第一行 | `10-second` 改为 `20-second` | 三层翻译各需约 3 秒展示过程，10 秒放不下 |
| `# Output (fixed)` | `exactly 10.000 s (300 frames)` 改为 `exactly 20.000 s (600 frames)` | 同上 |
| `# How to work` 第 5 步 | `exactly 10.00 s` 改为 `exactly 20.00 s` | 同上 |
| `# Rules` 第 2 条 | 删去「不得使用真实商标、品牌名须自拟」，改为允许使用产品名，不画 Thunderbird 与 Mozilla 的图标 | 原规则会让 AI 改掉产品名 |

其余各节（风格、技术路线、风格特征、工作流程、评审清单、自评与交付）保持原样。`Signature features` 一节是风格的判定依据，不要删改。

## 提示词

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
「邮城」—— 一封外文邮件进城，依次经过三层翻译楼，最后变成读得懂的中文。产品：Thunderbird Translate（Thunderbird 邮件翻译扩展）。

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
  主标题「Thunderbird Translate」
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
  Use the product name "Thunderbird Translate" as given; do not draw the Thunderbird or Mozilla logos; invent any other
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
