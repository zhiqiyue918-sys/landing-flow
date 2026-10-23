# 落地流（dsh-deep-construction bundle）

一个可安装到 DeepSeek Harness profile 的 bundle，为 Harness 增加一个独立的施工 Agent 模式：
**落地流**（preset id：`d-construction`；规范 v1.0 中称「D｜深度施工模式」，显示名按用户命名改为「落地流」）。

## 这个 bundle 提供什么

| 组成 | 载体 | 作用 |
|---|---|---|
| Agent 预设 `d-construction` | `@deepseek-ai/dsh-agent-preset` 声明行 | 新建会话时可在预设选择器里选「落地流」 |
| 常驻角色与规则 | `prompt/d-mode.md` → Host 插件注册为 system prompt section（order 100） | **十八条核心原则**、四类真相、状态机、提问/研究/施工纪律、开工文档、素材与取材策略、体验官审阅层、能力自检、承载平台选型（含**宿主游戏 mod**）、美术达标、默认回执格式 |
| 结构化施工状态 | `d_state` 工具 + `deepConstruction` 会话投影 | 阶段、模块、计划、Y/X/Z/B/G/S 变更项、验证、Repair 历史、技术失败、资源边界、设计状态、checkpoint、阻塞、技术决策、ConstructionBrief、**开工文档、体验官、素材/平台/美术、能力自检、游戏试玩/视觉复测证据及 COMPLETE 硬门** |
| 全链 Pipeline View | `client.js` → `conversation.input.dock` | 输入框上方的状态条：当前阶段、模块进度、进度信号、**无视觉能力红色 chip**；展开看阶段（含当前阶段高亮）/模块/计划/变更项/决策/验证/Repair/技术失败/产物/阻塞/需求缺口/交付面清单/**素材策略/承载平台/开工文档/体验官审阅/自动推进留痕/能力自检**/验收/checkpoint，并提供四个预填动作；命模式自身规则的违规行标红 |
| **十八个技能** | `skills/*/SKILL.md` | 流程技能、开工文档、素材与取材、美术达标、体验官编排及 6 位体验官；新增游戏核心循环试玩与视觉/UI 实机复测专项技能 |
| 复用既有能力 | 引用 shipped 包 | 终端 / 文件 / 搜索 / 后台任务 / 网页 / ask_user / todo / goal / subagent / workflow / 压缩 / 技能，全部用 Harness 原生插件 |

## 安装与生效

- 由创造模式安装：`plugin_manager` → `install_bundle`，`target` 为本目录绝对路径（profile 内所有会话共享；pnpm 以 `link:` 指向本目录）。
- **重启 Harness 一次**：预设的插件代际在启动/安装时激活，重启后新会话才会用到最终代码。
- 已有会话保持它启动时的预设；**新会话**才能在预设选择器里选到「D｜深度施工模式」。

## 使用

1. 新建会话 → 预设选择「D｜深度施工模式」。
2. 直接说你要做什么，可以很模糊（例如"帮我做一个小游戏"）。
3. D 会：判定开局类型 → 动态询问真正影响结果的问题 → 早期外部现实侦察 → 给出 ConstructionBrief 请你确认 →
   自己拆计划连续施工 → 真实验证 → 按进展返修 → 产品级验收。
4. 输入框上方的 Pipeline 条持续显示当前阶段与进展，点右侧箭头展开细节。

## 状态落在哪里

- **会话级（真源）**：`d_state` 每次调用的参数都进入会话日志；`deepConstruction` 投影按顺序折叠这些
  已提交事件，因此状态可重放、可恢复，并直接发布给 Pipeline View。
  投影只折叠**已知事件类型**（`tool/call`），不追加自定义事件，日志始终可正常重新打开。
- **项目级（镜像）**：同一次调用会把合并后的状态写入 `<会话工作目录>/.d-construction/state.json`，
  跨会话延续，用户可直接打开查看。写入失败不影响工具成功（状态仍以会话日志为准）。

## 测试

```bash
node tests/host.test.mjs     # 状态合并、宿主自查与 V6 完成硬门（含游戏试玩/视觉门）
node tests/client.test.mjs   # Pipeline View 结构、状态呈现与游戏证据面板
node tests/package.test.mjs  # manifest / patch / 18 个技能 / locale / 常驻规则
node tools/prompt-audit.mjs  # 常驻提示词规模 + 双向重复率（改提示词前先跑它）
```

当前回归：host 59 项、client 15 项、package 12 项全部通过；提示词审计已运行。

改造记录见 `docs/REDESIGN-v6.md`（诊断数字、硬门设计、回退方式）。

## 验收

`ACCEPTANCE.md` 是 A–H 验收测试协议（真实会话、真实输入、真实结果），外加**会话 4 的 V2 五项门**
（开工文档 / 素材策略 / 能力自检 / 体验官 / 超时推进）；构造者从会话日志与工作区产物取证，不采信自述。

## 边界

- 只增强 D 自己：不接入任何外部 Agent，不做多 Agent 调度。
- **视觉能力来自会话开关，不来自本 bundle**：基础模型是纯文本模型，看图要靠 profile 作用域的 `dsh-vision-router`（输入框的 **「👁 识图」**）。**预设行不是工具白名单**，全局工具照常可见，所以本 bundle 不需要也不应该在预设里加 vision 行。没有视觉能力时，D 必须如实声明（`d_state` 的能力自检会告诉它），不得声称看过画面。
- Pipeline View 是只读可视化；修改需求、暂停/继续、确认 G/S、请求回滚通过对话提出。
- 不展示模型隐藏推理过程；不使用无法解释来源的百分比。
- 如果 Pipeline View 不可用，`d_state` 仍会维护完整结构化状态，回执里保留状态卡（降级不丢状态）。
