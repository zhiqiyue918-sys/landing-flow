---
name: deep-construction-repair
description: Use whenever verification fails, a defect appears, an audit finds issues, or the user changes requirements mid-flight — to classify progress versus stall, replan root causes, roll back regressions, bound audits, and re-scope existing work as keep/recheck/redo/discard.
---

# 落地流 · Progress-aware Repair、审计边界与变更影响

## 默认闭环

`BUILD → AUDIT → ISSUE QUEUE → BUILD`

审计的目标是发现足以继续施工的问题，而不是证明"世界上再也没有问题"。除非用户明确要求"只检查，不修改"，禁止 AUDIT → AUDIT → ANALYZE → AUDIT 而永不施工。发现问题后立刻进入可执行修复队列（`d_state.change_items` 中登记 X 项）。

## "不好玩 / 没感觉"是一类独立的业务失败

用户对**体验**的否定（不好玩、没感觉、画面粗糙、不知道爽在哪）不是"打磨项"，也不是主观噪音：

- 归为**业务失败**，登记一轮 `repair_history`（判定写 `INFO_GAIN` 或 `STALLED` 都行，但必须写明"体验层失败"）。
- **回到 DISCOVERY / DESIGN**：重做体验契约、必要时补做品类与体验层侦察（`benchmarks`）、重写 `experience_contract`，再让用户确认。
- **禁止**在现有实现上打补丁式"加点粒子/加个音效"就宣称改进——那是把设计债当 bug 修。
- 只有当体验契约被用户确认后，才重新进入 BUILD。

**沉默不是验收通过**：如果体验验收项没有用户答复，状态停在 WAITING_USER_DECISION，不得写 COMPLETE、也不得开始"顺手再加点东西"。

## 游戏体验缺陷路由

- 核心动作无决策、选择不改变结果、反馈不可读、循环重复或没有重玩理由：加载 `deep-construction-reviewer-core-loop`，回到 DESIGN 重做循环，再从真实入口试玩。
- HUD 遮挡、目标不清、主操作不醒目、视觉风格混杂：加载 `deep-construction-art` 与 `deep-construction-reviewer-usability`，用真实运行截图定位具体缺陷，修后同入口复测。
- 不以“多加内容 / 换色 / 加粒子”掩盖根因；每项体验返修都要对应可复现问题，并给出改前改后证据。宿主的 `gameplay_review` / `visual_review` 记录用于 COMPLETE 硬门。

## 不以次数为停损条件

业务返修不能简单以轮数作为唯一停损条件。核心问题是：**每一轮是否仍然在向正确答案靠近？**

每轮 Repair 都登记进 `d_state.repair_history`：`id / 解决了什么 / 测试变化 / 错误范围变化 / 新证据 / 判定 / 下一步`。

## 四类判定

| 判定 | 证据形态 |
|---|---|
| PROGRESS | failing tests 减少；错误范围缩小；从编译错误推进到运行错误；真实链路走得更远；一个不可达能力变得可达；完成度真实增加 |
| INFO_GAIN | 即使表面数字没变，但获得了真正缩小问题空间的新证据：已定位到具体事件竞争；已确认第三方库行为与预期不同；已排除数据库层；已确认问题来自权限/环境而非业务逻辑；未知问题变成明确问题；排除了重要错误假设 |
| STALLED | 连续尝试后错误基本不变；没有新增证据；同几个文件反复改；A 修好 B 坏、B 修好 A 又坏；workaround 越来越多；修改范围不断扩大但完成度不提高；原架构假设持续被现实否定 |
| REGRESSION | 修复明显让系统更差，或开始出现大量新回归 |

只要仍有真实进展且风险和资源成本合理，可以继续超过 2 轮，不机械停止。

## STALLED → ROOT_CAUSE_REPLAN

重新检查：根因假设、架构、输入、环境、权限、第三方依赖、技术路线、当前 Scope。

必须采用与上一轮有实质差异的新策略，而不是换个写法继续撞墙。把 replan 结论写进 `d_state.repair_history` 与 `d_state.blockers`（若仍存在）。

## REGRESSION → ROLLBACK

优先回到最近安全 checkpoint 再重新判断，不要补丁叠补丁。checkpoint 记录在 `d_state.checkpoints`（`id / 说明 / 位置 / 何时创建`）。

## 什么时候真正 BLOCK

只有以下之一成立时才 BLOCK（并同步 `d_state.current_stage = BLOCKED` 与 `d_state.blockers`）：

- 更换合理策略后仍持续无结果、也无新信息；
- 当前工具能力确实不足；
- 缺少只能由用户提供的关键事实；
- 缺失不可绕过的权限；
- 继续会产生不可接受的成本或风险；
- 目标本身存在不可调和冲突。

BLOCK 时明确写出：卡在哪里、已经试过什么、需要用户提供什么。

## 技术失败与业务失败分开

API 超时、网络波动、工具崩溃、临时环境错误、外部服务限流不属于"方案返修失败"，单独记录，避免误判产品方向。

## 资源停损

本模式不设固定业务返修轮数，但允许存在时间预算、API 成本预算、单任务资源上限、用户主动停止。资源上限触发时，报告"资源边界已到"，而不是谎称业务方案已经失败。

## 用户中途修改要求后的影响分类

用户修改要求时，重新计算依赖影响，把已有结果分类，并写进 `d_state.change_items`：

| 分类 | 判定 | 处理 |
|---|---|---|
| 沿用 | 不受影响 | 保留，不返工 |
| 复查 | 本身可继续，但需确认兼容性 | 定向检查后再定 |
| 重做 | 真实依赖旧要求 | 重新施工 |
| 作废 | 不应继续作为当前有效结果 | 标记作废，不再引用 |

局部修改不得默认让整个项目归零。在回执中明确写出：沿用 N 项 / 复查 N 项 / 重做 N 项 / 作废 N 项，以及为什么。

## 汇报格式（Repair 期间）

```
Y8-X1｜96 tests → 89 pass｜PROGRESS
Y8-X2｜89 → 94 pass｜PROGRESS
Y8-X3｜94 → 94；定位事件重复绑定｜INFO_GAIN
Y8-X4｜96/96｜PASS
```

不要只报"第几轮"，要报这一轮解决了什么、变化是什么、下一步是继续、Replan 还是 Rollback。
