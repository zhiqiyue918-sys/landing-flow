---
name: deep-construction-status
description: Use when maintaining or reporting D-mode structured construction state — to call the d_state tool with the correct field structure, keep the Pipeline View truthful, follow the three-level visualization rules, and render the standard user-facing status receipt.
---

# 落地流 · 结构化状态与全链可视化

## 为什么必须维护

用户在任意时刻都应该一眼看清：我们最终要做什么、现在处于哪一阶段、前面完成了什么、当前在做什么、用了什么技术、为什么这样选、哪些模块已完成、哪些还没开始、现在是否卡住、Repair 是否真有进展、测试与验收结果、后面还剩什么。

结构化状态也是你自己在长任务中不失忆的依据：会话历史不是项目真实状态。

展示的是**执行事实**，不是隐藏思维过程。不得展示内部 Chain-of-Thought。

## d_state 工具

`d_state` 把结构化施工状态写入当前会话（会话级状态，随会话保存；Pipeline View 直接读它）。它是**部分更新**语义：

- 标量字段：传了就覆盖。
- 对象字段（如 `research`、`final_acceptance`）：按键合并。
- 数组字段：传了就整表替换 → 传入某个数组字段时，必须给出该字段的**完整当前列表**。

只写变化的部分，不必每次传全部字段。

### 字段表

| 字段 | 类型 | 含义 |
|---|---|---|
| `project_goal` | string | 一句话最终目标 |
| `current_stage` | enum | RECEIVE / UNDERSTAND / DISCOVERY / RESEARCH / BRIEFING / WAITING_USER_DECISION / DESIGN / PLAN / EXPERIMENT / BUILD / VERIFY / AUDIT / REPAIR / ROOT_CAUSE_REPLAN / ROLLBACK / BLOCKED / ACCEPTANCE / COMPLETE |
| `stage_note` | string | 当前阶段一句话说明 |
| `pipeline` | array | `{ stage, status, summary }`，status 取 未开始/进行中/等待用户/通过/需修复/阻塞/作废 |
| `known` / `unknown` / `assumptions` / `delegated` / `deferred` | string[] | 需求发现的五类清单 |
| `pending_user_decisions` | array | `{ question, status }`，status 取 待回答/已回答/已确认 |
| `research` | object | `{ status, sources_used[], conclusion }` |
| `decisions` | array | `{ decision_id, choice, purpose, reason, alternatives, rejected_reason, evidence, impact, status, date }`；status 取 ACTIVE/SUPERSEDED/EXPERIMENTAL，date 为 YYYY-MM-DD |
| `construction_brief` | object | ConstructionBrief 的 16 个字段 |
| `experience_contract` | object | `{ first_10s, first_60s, first_5min, screen, feedback }` ——面向人的交付在 Brief 通过前必须写出的**动作级**剧本：前 10 秒做什么、前 60 秒爽在哪、前 5 分钟目标链、常驻画面、每次操作的声画反馈。写不出 = 设计没做完，不得进入 DESIGN/BUILD |
| `gameplay_review` | object | `{ playtest_path, loop_observation, branch_evidence, retry_observation, replay_hook }` ——游戏真实入口、玩家输入路径、循环与变化、失败恢复和重玩理由。不得以代码断言代替实际操作 |
| `visual_review` | object | `{ runtime_screenshot, hierarchy_review, visual_rounds, ui_findings, retest_result }` ——真实运行截图、UI/视觉缺陷、基于缺陷的改动与同入口复测；无视觉能力必须标未验证 |
| `benchmarks` | array | `{ work, what, source }` ——品类与体验层对标（成熟作品怎么做 / 人为什么玩 / 常见差评 / 视听惯例）；技术层研究不能替代这一层 |
| `design_basis` | object | `{ definition, motivation, meaning, structure, time_logic }` ——**零到一前置设计包**：品类/产品定义与边界、人为什么玩用的动机与取向光谱、对用户的意义与会话节奏、产品结构分解（内容/交互/数据/工程/分发，各做什么不做什么）、时间与状态逻辑（系统日期/跨天/时区/离线结算）。大题材任务在 Brief 确认前必须写完 |
| `surfaces` | array | `{ area, level, form, source }` ——**交付面清单**：玩法与操作 / 数值与曲线 / 美术与视觉 / 音频与声音 / 内容与文案 / 领域专业性 / 平台与性能，每块都要有一行。level 取 强/一般/弱/无；source 取 对标/自产/用户提供/已授权自主。**弱项（弱/无）的来源必须是"用户提供"或"已授权自主"，否则不许进入 BUILD**——板块不得静默留空 |
| `gameplay_review` | object | `{ playtest_path, loop_observation, branch_evidence, retry_observation, replay_hook }` ——游戏真实入口、玩家输入路径、循环与变化、失败恢复和重玩理由。不得以代码断言代替实际操作 |
| `visual_review` | object | `{ runtime_screenshot, hierarchy_review, visual_rounds, ui_findings, retest_result }` ——真实运行截图、UI/视觉缺陷、基于缺陷的改动与同入口复测；无视觉能力必须标未验证 |
| `design` | object | `{ status, notes }`，status 取 未开始/进行中/已完成/需返工 ——DESIGN 阶段自己的状态，长设计期也要可见 |
| `modules` | array | `{ name, status, note }`，status 取 未开始/进行中/已完成/阻塞/等待用户 |
| `current_module` | string | 当前模块名 |
| `plan` | array | `{ step_id, title, status }`，step_id 使用 Y1 / Y2-X1 等编号 |
| `current_step` | string | 当前步骤编号 |
| `change_items` | array | `{ id, kind, title, status, classification, note }`，kind 取 Y/X/Z/B/G/S；**classification 取 沿用/复查/重做/作废**——用户中途改要求时，用它说明每项既有结果的处置 |
| `verification` | array | `{ what, command, result, evidence }` |
| `repair_history` | array | `{ id, what, tests, progress, next }`，progress 取 PROGRESS/INFO_GAIN/STALLED/REGRESSION/PASS |
| `technical_failures` | array | `{ what, kind, impact, recovered, evidence }`，kind 取 技术失败/业务失败 ——超时、网络波动、工具崩溃、临时环境错误、外部限流都记在这里，**不要混进业务 Repair 判定** |
| `resource_budget` | object | `{ time, cost, task_limit, note }` ——资源边界触发时在 note 里写"资源边界已到"，而不是谎称业务方案失败 |
| `progress_signal` | string | 当前进展判定的一句话 |
| `checkpoints` | array | `{ id, note, path }` |
| `blockers` | array | `{ what, why, need }` |
| `artifacts` | array | `{ path, note }` |
| `final_acceptance` | object | `{ status, user_path, evidence[] }` |
| `note` | string | 其它需要留痕的一句话 |

### 调用时点

开局判定后 → 需求收敛成 Brief 后 → 技术决策后 → 架构/计划确定后 → 每个模块开始/完成/阻塞时 → 每轮验证后 → 每轮 Repair 后 → 用户中途修改要求后 → 每次阶段切换 → 最终验收。

## 三级视图

1. 一级：全链 Pipeline。覆盖 需求输入 → 需求发现 → 外部现实侦察 → ConstructionBrief → 技术方案 → 总体架构 → 施工计划 → 模块施工 → 验证 → Repair / Replan → 产品级验收 → 最终交付。每阶段至少有状态、简短摘要、是否 Active Stage。
2. 二级：阶段详情。例如技术方案给出 `采用：Tauri / 用途：桌面壳 / 原因：资源占用较低、现有 Web UI 可复用、满足 Windows 本地能力需求`；外部研究给出 `已核对：官方文档、主要成熟方案、当前维护状态 / 结论：采用 A，不采用 B，主要原因 XXX`。
3. 三级：工程证据（默认折叠）。changed files、Artifact、测试详情、日志、Source/Reference、checkpoint、Repair history、Y/X/Z/B/G/S、关键 diff、错误证据。

## 模块与进度表达

模块状态用：未开始 / 进行中 / 已完成 / 阻塞 / 等待用户决定。**不要长期显示虚假百分比**；只有存在可计算任务量、测试数、节点数等真实分母时才显示百分比，否则用阶段状态与完成项表达。

## Repair 表达

不要只显示"第几轮"。展示这一轮解决了什么、测试变化、错误范围变化、新证据、判定（PROGRESS / INFO_GAIN / STALLED / REGRESSION）、下一步是继续 / Replan / Rollback。示例：

```
Y8-X1｜96 tests → 89 pass｜PROGRESS
Y8-X3｜94 → 94；定位事件重复绑定｜INFO_GAIN
Y8-X4｜96/96｜PASS
```

## 聊天中的状态卡（默认回执，也是 UI 不可用时的 fallback）

```
【落地流】<当前阶段> · <模块进度>
目标：<一句话最终目标>
本轮完成：<1-3 条真实完成项>
采用：<关键技术/工具 + 一句为什么>
验证：<真实执行的验证与结果>
还剩：<未完成 / 阻塞 / 等待你决定>
下一步：<你将继续做什么>
```

## 用户干预入口

Pipeline View 的展开面板里有一套**动作按钮**（composer 可用时出现）：「确认 Brief」「暂停」「只审计不修改」「回滚到最近 checkpoint」。它们**只把对应指令预填进输入框**，由用户按回车发送——面板不会替你发消息。面板同时展示：全链阶段（当前阶段带高亮标记）、模块、施工计划与当前步骤、变更项（含沿用/复查/重做/作废）、技术决策（含日期）、验证、Repair、技术失败、产物、阻塞与待你决定、需求缺口（待明确/推断/延期）、验收、checkpoint。

用户在对话里提出修改需求、暂停/继续、确认 G/S、请求回滚时，你照常在会话内执行并同步状态；面板只是把同样的动作变成一键预填。

## 边界

- 如果 Pipeline View 或 `d_state` 不可用，必须保留完整结构化状态（状态文件或状态卡），不得以"暂时没有 UI"为理由取消全链状态维护。
- 不展示模型隐藏推理过程。
- 不使用无法解释来源的假百分比。
- 用户修改要求后，明确给出沿用 / 复查 / 重做 / 作废的分类结果，并写进 `change_items[].classification`。
- 技术失败写进 `technical_failures`，资源边界写进 `resource_budget`；两者都不得与业务 Repair 判定混为一谈。
