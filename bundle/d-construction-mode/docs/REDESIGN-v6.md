# 落地流 V6 · 改造记录（硬门 / 空状态 / 面板 / 审计）

> 目标：让它**真的会拦住自己**，而不是"写了很多规则、最后仍然交付一个不可信的结果"；
> 同时把"以后每次用它都更省事"的部分做成可复现的工具，而不是再往提示词里加一段话。
>
> 改的是 profile 里的插件本体：
> `Z:\AI\DeepSeekAgent\DSH-Home\profiles\desktop\node_modules\@local\dsh-deep-construction`
> **改动需重启 Harness 一次才生效**（预设插件的代际在启动/安装时激活）。

---

## 一、诊断（改造前的真实状态，含数字）

| 事实 | 数字 | 出处 |
|---|---|---|
| 常驻提示词 | 532 行 / 26,378 字 ≈ **1.6 万 token / 每轮** | `node tools/prompt-audit.mjs` |
| 技能总量 | 54,757 字 / 16 个文件（按需加载） | 同上 |
| 自身规则检查点 | **27 处** `out.push`，全部以字符串随 `d_state` 返回 | `index.js` `defectReport` |
| 真正能拦住动作的锁 | **1 个**（`ctx.tools.guard(consentGuard)`） | `index.js` `apply` |
| 技能中已被常驻提示词覆盖的篇幅 | 4%–20%（kickoff 20%、reuse 19%、discovery 15%、review 14%） | audit「in prompt」列 |
| 常驻提示词中被技能完整覆盖的段落 | 12 段 / 1,815 字 ≈ 1,125 token | audit 结论 |

两个结论，和最初凭印象说的不一样，按实测改口：

1. **重复的方向是反的。** 不是"提示词里堆了技能的抄件"，而是**技能在抄提示词**：kickoff 有 20% 的字与常驻提示词逐字相同，reuse 19%。所以"删掉重复就能省很多 token"是错的——删干净只有约 1.1k token/轮。真正的代价是**维护**：同一条规则要改两处，改漏就漂移（`Defold` 只出现在 §1.11、guard 文案里没有，就是漂移的现场）。
2. **规则不缺，缺的是"违约有代价"。** 27 个检查点里 26 个只是劝告；模型读完"美术没有参考图"，下一句照样能把阶段写成 COMPLETE。这才是"170 项断言全绿 + 用户说粗糙"能发生的机制原因。

---

## 二、这次改了什么（4 项，全部有测试）

### 1. 硬门：完成/验收不可谎报（核心）

`index.js` 新增 `hardDefects(state)`：从既有 27 条缺陷里挑出**5 条不许用文字糊过去**的，作为硬门：

| code | 触发 |
|---|---|
| `ART_NO_REFERENCE` | 美术权重 S/A 却没有参考图 |
| `SELF_BUILT_NO_ALTERNATIVES` | 选「无框架自研」却没列出否掉的成熟平台 |
| `RUBBER_STAMP` | 体验官记「通过」但不是独立子代理 |
| `LICENCE_REDLINE` | 素材许可命中 SA/GPL/NC/ND/需核实 |
| `HOST_VERSION_UNPINNED` | mod 的 `host_version` 不是唯一具体版本 |

**执行方式不是提示，是在 `mergeState` 里拒收这个状态转换**：

- 只要硬门未清，`current_stage` 写 `ACCEPTANCE` / `COMPLETE`、或 `final_acceptance.status` 写「完成/通过/已交付」→ **不落库**，阶段退回上一次的值；
- 拒绝这件事本身被记进 `completion_refused`（试图写的阶段、时间、原句），面板与回执都能看到，不会"悄悄回退成看起来很正常的状态"；
- 硬门清空后自动删除该记录，同一次声明就能正常落地；
- `待验收 / 待确认` 这类"还在等用户"的状态**照旧可写**——堵的是谎报，不是等待。

因为投影只折叠 `tool/call` 事件，这条约束放在 `mergeState` 里才对**调用成功与失败**都成立（放在 tool 返回里是没用的，事件已经先落库了）。

### 2. 空状态不再放行（补锁上的洞）

原来 `state === null` → 放行，于是新会话"第一件事直接 `write`"就能绕过整把施工锁。现在：

- 有归属会话但还没写过状态 → 返回**引导式拒绝**：先调一次 `d_state`（它不属于施工工具），把开局判定/阶段/intake 写进去，用户已授权就一并写 `consent`；
- 无法归属到 D 会话（没有 session）→ 仍然完全不干预，不污染别的预设；
- `read / glob / grep / web_search / web_fetch / d_state / ask_user_question` 一律不受影响。

### 3. 面板：硬门数上顶栏

`toView` 增加 `hardGates`，Pipeline 顶栏多一个红色 chip「硬门 N」。理由：卡点必须在你抬眼的一行里，而不是展开 20 多个板块去找。被拒过一次的状态也会继续计数，直到真的清掉。

### 4. 提示词审计工具（以后可以量着改）

新增 `tools/prompt-audit.mjs`（零依赖）：

```bash
node tools/prompt-audit.mjs           # 规模 + 双向重复率 + 可删段落候选（带行号）
node tools/prompt-audit.mjs --json
node tools/prompt-audit.mjs --min 0.4  # 放宽候选阈值
```

它同时算两个方向：常驻提示词里"已被技能覆盖"的段落（可删候选），以及每个技能里"已被常驻提示词覆盖"的比例（该不该留在技能里）。**以后任何瘦身都先跑它，再动刀**——不然又是凭感觉删规则。

---

## 三、没做的，以及为什么

- **没有把常驻提示词砍到 12k。** 实测可回收只有 1.1k token/轮，而风险是删掉一条教训。真正的瘦身得把规则**搬家**（提示词只留结论与指针，细则只住在技能里），那是另一件事：它要求"技能一定在对的时候被加载"，而当前契约本身就写着"按需加载，不要一次全读"。搬错一次，规则就从"读两遍"变成"一遍都没有"。
- **没有把 5 条硬门之外的东西也硬化。** 比如"开工文档的提问面覆盖度"、"体验官全员通过"——这些一旦硬拦，正常路径会被自己卡死（渲染样图本身要写文件，而写文件正是要拦的工具）。**能硬拦的前提是"修它不需要被拦的那个工具"**，这条判断标准写进代码注释了。
- **没有改 Workbench 那条产线。** 它走 `workbench-d` profile，不含落地流（记忆里已有结论）。同一个工作区两条纪律，属于产品决策，不是这次能顺手改的。

---

## 四、怎么验证（可复现）

```bash
cd Z:\AI\DeepSeekAgent\DSH-Home\profiles\desktop\node_modules\@local\dsh-deep-construction
node tests/host.test.mjs        # 57 项（新增 3 项硬门 + 改写 1 项空状态）
node tests/client.test.mjs      # 15 项
node tests/package.test.mjs     # 12 项
node tools/prompt-audit.mjs     # 规模与重复率
```

本次结果：**84 项全绿**（57 + 15 + 12）。新增的三条断言专门防漂移：

- 硬门未清时写 COMPLETE → 阶段不落库、`completion_refused` 有记录、`toView().hardGates > 0`；
- 硬门清空后同一次声明可以落地，`completion_refused` 被删除；
- **5 个硬门签名逐一在构造状态上真的触发**——文案被改写、签名失配，测试立刻红。这是这套门的"氧气检测"。

---

## 五、怎么回退（一条命令）

改动前的整份快照：

```
Z:\AI\DeepSeekAgent\workspace\_backup\d-construction-20261019-171047
```

回退（改完需重启 Harness）：

```cmd
robocopy "Z:\AI\DeepSeekAgent\workspace\_backup\d-construction-20261019-171047" "Z:\AI\DeepSeekAgent\DSH-Home\profiles\desktop\node_modules\@local\dsh-deep-construction" /MIR
```

回退后 `node tests/host.test.mjs` 应回到 54 项（旧断言集）。

---

## 六、下一步（按性价比，尚未动手）

1. **`lessons.json`**：把 20 条真机教训登记成「症状 / 对应字段 / 判定 / 是否硬门」，guard 与文档都从这张表生成。以后加 V7 是加一行，不是加一段散文——这是唯一能止住"每次迭代都在提示词里再抄一遍"的办法。
2. **主观项回流**：`repair_history` 加一列"用户原话 + 与上一轮的差距表"，让"还是粗糙"变得可比较，而不是每轮重新猜。
3. **提示词搬家**：先把 §1.5–§1.12 的细则整体移进对应技能（提示词只留一句话结论 + 技能名），跑一轮真机，确认没有规则丢失，再删。审计工具已经能给出前后对比。
