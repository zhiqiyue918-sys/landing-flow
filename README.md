# 落地流（landing-flow）

**一个让 AI 真正把东西做出来的施工 Agent 模式。**
DeepSeek Harness（DSH）的 Agent 预设，preset id：`d-construction`。

---

## 一、它是什么

「落地流」不是聊天模式，也不是代码补全。它是一条**从模糊需求走到产品级验收**的端到端施工链路。

职责划分只有一句：

> 用户负责「我要什么、我喜欢什么、结果我接不接受」；
> Agent 负责「行业现在怎么做、应该用什么、为什么这样用、怎么实现、怎么测试、怎么修到真正可用」。

它明确禁止两种降级：

- 不许把自己降级成「逐条执行指令的码农」；
- 不许把用户升级成「项目经理」。

## 二、它解决什么问题

大多数人用 AI 做东西，卡在三处：

1. **说不清**——需求本身就是模糊的，AI 直接开做，做出来的不是想要的；
2. **做不深**——一问一答式推进，做到一半就散，没人记得整体架构；
3. **收不了尾**——「能跑」被当成「做完了」，没有真实证据，没有产品级验收。

落地流把这三处接上：先做需求发现与外部现实侦察 → 给出 ConstructionBrief 请用户确认 → 自己拆计划连续施工 → 真实验证（运行、测试、真实路径可达）→ 按进展返修 → 产品级验收。

## 三、组成

| 部件 | 作用 |
|---|---|
| `prompt/d-mode.md` | 常驻规则：十二条核心原则、四类真相、状态机、研究/施工纪律、回执格式 |
| `d_state` 工具 | 结构化施工状态：阶段、模块、计划、变更项、验证、Repair、技术失败、资源边界、checkpoint、阻塞、技术决策、ConstructionBrief |
| `deepConstruction` 会话投影 | 把每次 `d_state` 调用从会话日志折叠出来，可重放、可恢复，直接驱动界面 |
| Pipeline View（`client.js`） | 输入框上方状态条：当前阶段、模块进度；展开看全链，含四个预填动作 |
| 8 个技能 | 需求发现、外部现实侦察、复用与原创、施工交付、Progress-aware Repair、状态可视化、游戏核心循环试玩、游戏视觉与 UI 实机审查 |
| 复用原生工具 | 终端 / 文件 / 搜索 / 后台任务 / 网页 / ask_user / todo / goal / subagent / workflow / 压缩 / 技能 |

## 四、状态落在哪

- **会话级（真源）**：`d_state` 每次调用的参数进入会话日志；投影按顺序折叠这些已提交的 `tool/call`，状态可重放、可恢复。投影不追加自定义事件类型，日志始终能重新打开。
- **项目级（镜像）**：同一次调用把合并后的状态写入 `<会话工作目录>/.d-construction/state.json`，跨会话延续；写失败不影响工具成功（真源仍是会话日志）。

## 五、仓库结构

```text
landing-flow/
├── bundle/d-construction-mode/     # 完整可安装的 bundle 源码
│   ├── cordis.patch.yml            # 预设声明 + 插件装配
│   ├── package.json
│   ├── index.js                    # 宿主半边：常驻规则 + d_state 工具 + 会话投影
│   ├── client.js                   # 浏览器半边：Pipeline View
│   ├── prompt/d-mode.md            # 常驻施工规则（十二条原则）
│   ├── skills/                     # 8 个施工技能
│   ├── locale/                     # 中英文案
│   ├── tests/                      # 32 项自测，无需依赖
│   ├── ACCEPTANCE.md               # A–H 真机验收协议
│   └── README.md                   # bundle 自身说明
└── docs/
    └── DEEP_REPORT_LANDINGFLOW-20261024-01.md   # 多中转路由 / 并发边界 / 子代理上下文设计
```

## 六、安装

```text
plugin_manager → install_bundle → target = bundle/d-construction-mode 的绝对路径
重启 Harness 一次（预设的插件代际在启动/安装时激活）
新会话 → 预设选择「落地流」
```

已有会话保持它启动时的预设；只有**新会话**才能选到落地流。

## 七、当前已知能力缺口

**一个会话窗口只能走一个中转 API。**

- 主会话在创建时绑定 `provider + model`；
- `subagent`（spawn）允许子代理独立选模型，`subagent_fork` 强制继承父会话的 provider/model；
- `d_state` 只记录状态，不负责模型路由。

所以同一窗口内的多中转目前只能靠 spawn 子代理手工指定，主会话自身不能按任务切换。

设计提案与 7 个待裁决问题见 [`docs/DEEP_REPORT_LANDINGFLOW-20261024-01.md`](docs/DEEP_REPORT_LANDINGFLOW-20261024-01.md)。

同时这份文档固定了四条设计前提：

1. **并发限制的目的是防止多个代理同时改乱同一份项目，不是控制预算**；
2. 费用控制是独立机制，按模型单价分档，贵模型只管关键节点；
3. 上下文窗口可以大，单次输出按任务给足；真正该治的是每轮重复塞回文件的上下文膨胀；
4. 子代理只拿最小必要上下文与最小工具包，只回传摘要。

## 八、边界（当前自述）

- 只增强自己：不接入任何外部 Agent，不做多 Agent 调度（**这条与上面的多中转设想存在冲突，待裁决**）；
- Pipeline View 是只读可视化；修改需求、暂停/继续、确认、回滚通过对话提出；
- 不展示模型隐藏推理过程；不使用无法解释来源的百分比；
- Pipeline View 不可用时，`d_state` 仍维护完整结构化状态，回执里保留状态卡（降级不丢状态）。

## 九、测试

```bash
node bundle/d-construction-mode/tests/host.test.mjs
node bundle/d-construction-mode/tests/client.test.mjs
node bundle/d-construction-mode/tests/package.test.mjs
node bundle/d-construction-mode/tests/gameplay-review.test.mjs
```

32 项全部通过，无需任何第三方依赖，用 Node.js 直接运行。

---

本仓库不含任何 API Key、端点密钥或凭据。
