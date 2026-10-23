---
name: deep-construction-assets
description: Use whenever the deliverable needs art, audio, icons, fonts or 3D material - to pick where every asset actually comes from, follow the sourcing order (user-provided, then no-asset solutions, then CC0 packs, then image APIs, then self-made), respect licence red lines, bound image-API spend, and give procedural visuals a real style contract instead of defaulting to raw geometry.
---

# 落地流 · 素材与取材策略

## 何时用

- 交付板块里有「美术与视觉」「音频与声音」「图标 / 字体 / 3D 模型」。
- 你正打算"用代码画几何图形当美术"——**这几乎总是错的决定**，先读本文。
- 用户给了参考图、或问过风格、或给了预算。
- 交付前填 `d_state.surfaces[].material / origin / licence / art_weight`。
- **板块的 `art_weight` 是 S/A 时**：本文只决定"素材从哪来"，**还要走 `deep-construction-art`**——参考图、带 hue 推移的色板、渲染→看→并排比→改 的迭代、证据帧必须等于实机，都在那一份里。素材来源对了但方向没定，画面照样粗糙。

## 第一原则

**纯程序化 / 纯几何不是默认答案，只能是被明确选定的风格。** 上一版最难看的结果就是"用代码画矩形和圆当美术"——那不是风格，那是没取材。用户说不出哪里不对，但他会看到成品很难看。

**风格统一比"自制"重要。** Vampire Survivors 这类爆款的画面恰恰来自**直接买成套素材包**。零散拼凑（OpenGameArt / itch.io / freesound 各抓一个）是"丑"的主要来源，因为每件素材的描边、色相、像素密度都不一样。

## 取材顺序（取第一个可用的）

### 1. 用户提供了参考 / 素材

以它为**风格锚点**，禁止偏离。从参考图里抽出可量化规则（色数、明度范围、描边宽度、圆角、留白比例），写进 `material`。

### 2. 不靠素材能解决（零成本，首选）

| 需求 | 做法 |
|---|---|
| 图标 | Lucide（ISC）/ Tabler（MIT）/ Phosphor（MIT）/ game-icons.net（CC-BY 3.0，需署名） |
| 排版与界面 | 一个 OFL 字体（Google Fonts）+ **一条色板规则**：所有颜色只变色相 H，锁定饱和度 S 与明度 L，再配大留白 |
| 背景与氛围 | GLSL 程序化：simplex 噪声渐变 + bloom + grain + 暗角；或 CSS 多层渐变 + 模糊 |
| 音效 | ZzFX（MIT，单函数）/ Web Audio 合成 |

**走这条路必须给出风格契约**（否则就是"随手画几何"）：色板（几个色、H/S/L 规则）、描边与圆角规则、动效曲线、留白比例、音色。给不出这五样，说明风格还没定，去研究对标。

### 3. 成套 CC0 开源包

| 类型 | 来源 | 许可 | 备注 |
|---|---|---|---|
| 2D 游戏美术 | **Kenney** | CC0 | 每包风格统一，可直链下载 zip |
| 2D 图标 | game-icons.net | CC-BY 3.0 | 4000+ 统一，**需署名** |
| 3D 模型 | **Quaternius** | CC0 | 成套 |
| HDRI / 贴图 | **Poly Haven** / ambientCG | CC0 | 有公开 API |
| 插画 | unDraw | 自有（免署名） | 风格统一 |
| 字体 | Google Fonts | OFL | |

**避开**：OpenGameArt / itch.io 免费区 / freesound / Sketchfab CC 区 —— 逐件许可混杂（CC0 / CC-BY / CC-BY-SA / GPL / NC 混在一起），需要逐件核实，容易踩坑。

### 4. 图像生成 API（只用于素材库覆盖不了的原创角色 / 场景插画）

**必须先问用户预算。单次 > ¥20 或累计 > ¥100 必须停下问。**

| 档位 | 提供商 / 模型 | 单张约价 | 备注 |
|---|---|---|---|
| 免费 | 硅基流动 Kolors / 智谱 CogView-3-Flash | ¥0 | 需实名 |
| 极便宜 | MiniMax image-01 | ¥0.025 | 草稿用 |
| 便宜 | fal.ai / Replicate FLUX.1 schnell | ≈¥0.02 | 需绑卡 |
| 中档 | 智谱 CogView-4 | ¥0.06 | |
| 综合最优 | **通义万相 wan2.6** | ¥0.20 | 中文提示词最强，含免费额度 |
| 综合最优 | FLUX.2 pro | ¥0.20 | |
| 高质量 | gpt-image high | ¥1.12 | 贵 7 倍，只在定稿用 |
| 高质量 | Gemini 3 Pro Image | ¥0.90（1K/2K） | |

**⚠️ Imagen 4 已于 2026-08-17 关停，别选。** FLUX.2 [dev] 权重是非商用，不能用于商业交付。

策略：**草稿用便宜档跑构图与配色，定稿用质量档跑少量关键图**。一个 30 张素材的小游戏，走 wan2.6 约 ¥5，走 gpt-image high 约 ¥34。

**AI 图的固定翻车点必须查**（用 `vision_*`）：文字错字与糊字、手指与肢体、透视、物体数量与位置是否符合提示、中英文混排、与用户参考图的风格是否一致。

### 5. 自制

前四条都不可行时才走，且在 `decisions` 里说明为什么。**自制不是省钱手段**，它通常最贵。

## 许可红线（硬规则）

- ✅ 放心用：**CC0 / MIT / ISC / OFL / 自有 / 已购买**。
- ⚠️ CC-BY：可用，但**产品必须有署名位**（关于页 / README）。
- ⛔ **CC-BY-SA / GPL / NC / ND / 需核实**：一律**停下问用户**。ShareAlike 的传染范围有法律争议，闭源商业项目风险高；NC 禁止商用；ND 禁止改动。

把实际使用的许可写进 `d_state.asset_policy.licence_note`，并逐块写在 `surfaces[].licence`。写进红线值的会让宿主自查直接报错——**别以为记下来就没事了**。

## 音频：零成本不刺耳

- **合成配方**（Web Audio：振荡器 + gain 包络）：
  - 点击 = 方波 880Hz，gain 1ms 升到 0.3，指数衰减 80ms
  - 成功 = 523 → 659 → 784Hz 三音上行，各 60ms
  - 失败 = 392 → 311Hz 下行
  - 跳跃 = 正弦 220 → 660Hz 扫频 120ms
  - 拾取 = 三角波 1200Hz，30ms
- **不刺耳底线**：音效 50–200ms；峰值 ≤ **-6 dBFS**；整体 **-16~-20 LUFS**；每个音**必须淡出 ≥10ms**（否则爆音）；禁止长时间满音量方波；一律加 lowpass。
- **网页限制**：`AudioContext` 必须在**用户手势之后** `resume()`，否则静音。
- 零成本音乐：FreePD（CC0）> Incompetent（CC-BY 需署名）> Pixabay（自有）。

## 决策树（照这个走）

```
需要视觉/音频资产
├─ 用户已提供参考/素材？ → 是：以它为风格锚点，禁止偏离
└─ 否 ↓
   ├─ 能不靠素材解决？（图标/排版/色板、GLSL 程序化、ZzFX 合成）→ 是：零成本首选，但必须给风格契约
   ├─ 需要"成套且风格统一"？ → 是：Kenney / Quaternius / Poly Haven / game-icons（CC0 优先）
   └─ 需要原创角色/场景插画（素材库覆盖不了）？
      ├─ 先问用户：预算上限？是否已接图像 API？有无参考图？
      ├─ 有预算 → 按档位走 API（草稿便宜档，定稿质量档）
      └─ 无预算 → 降级到零成本路线，并**明确告知用户"这样做不出角色立绘"**

命中以下任一 → 停下问用户，不得自行决定：
· 单次生成 > ¥20 或累计 > ¥100
· 需上传用户/第三方素材到云端 API（隐私）
· 素材许可为 CC-BY-SA / NC / ND / GPL / 需核实
· 需要署名而产品没有署名位
· 用户说过"不要 AI 生成"
```

## 写回状态

```
surfaces: [{ area: 美术与视觉, level: 弱, form: …, source: 对标,
             material: "Kenney 1-Bit Pack + 固定色板（只变 H）", origin: 开源素材,
             licence: CC0, art_weight: S }]
asset_policy: { image_api: 未接, budget_note: 单次 ≤ ¥20 / 累计 ≤ ¥100, licence_note: 仅 CC0/MIT/OFL }
```

`d_state` 里 `art_weight` 为 `S` 而 `source` 不是「用户提供」时，宿主会报错要求你先问用户——**S 级必须等用户给参考或明确授权**。
