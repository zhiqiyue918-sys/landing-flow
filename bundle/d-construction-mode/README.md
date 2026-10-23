# 落地流（dsh-deep-construction bundle）

一个可安装到 DeepSeek Harness profile 的 bundle，为 Harness 增加一个独立的施工 Agent 模式：
**落地流**（preset id：`d-construction`；规范 v1.0 中称「D｜深度施工模式」，显示名按用户命名改为「落地流」）。

## 这个 bundle 提供什么

| 组成 | 载体 | 作用 |
|---|---|---|
| Agent 预设 `d-construction` | `@deepseek-ai/dsh-agent-preset` 声明行 | 新建会话时可在预设选择器里选「落地流」 |
| 常驻角色与规则 | `prompt/d-mode.md` → Host 插件注册为 system prompt section（order 100） | 十二条核心原则、四类真相、状态机、提问/研究/施工纪律、默认回执格式 |
| 结构化施工状态 | `d_state` 工具 + `deepConstruction` 会话投影 | 阶段、模块、计划、Y/X/Z/B/G/S 变更项、验证、Repair 历史、技术失败、资源边界、设计状态、checkpoint、阻塞、技术决策、ConstructionBrief |
| 全链 Pipeline View | `client.js` → `conversation.input.dock` | 输入框上方的状态条：当前阶段、模块进度、进度信号；展开看阶段（含当前阶段高亮）/模块/计划/变更项/决策/验证/Repair/技术失败/产物/阻塞/需求缺口/验收/checkpoint，并提供四个预填动作 |
| 八个技能 | `skills/*/SKILL.md` | 需求发现、外部现实侦察、复用与原创、施工交付、Progress-aware Repair、状态与可视化、游戏核心循环试玩、游戏视觉与 UI 实机审查 |
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
node tests/host.test.mjs     # 13 项：状态合并、枚举校验、投影折叠、wire view、d_state 定义与镜像
node tests/client.test.mjs   # 7 项：模块装载、slot 注册、useProjection 取值、折叠/展开渲染树
node tests/package.test.mjs  # manifest / patch 声明 / 技能 front matter / locale / 常驻规则
node tests/gameplay-review.test.mjs # 游戏验收硬门、证据投影、非游戏兼容性
```

32 项全部通过（无需任何依赖，用 Harness 自带 Node.js 运行）。

## 验收

`ACCEPTANCE.md` 是 A–H 验收测试协议（真实会话、真实输入、真实结果）；
构造者从会话日志与工作区产物取证，不采信自述。

## 边界

- 只增强 D 自己：不接入任何外部 Agent，不做多 Agent 调度。
- Pipeline View 是只读可视化；修改需求、暂停/继续、确认 G/S、请求回滚通过对话提出。
- 不展示模型隐藏推理过程；不使用无法解释来源的百分比。
- 如果 Pipeline View 不可用，`d_state` 仍会维护完整结构化状态，回执里保留状态卡（降级不丢状态）。
