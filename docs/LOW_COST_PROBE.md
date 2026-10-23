# 低成本多中转探针

## 目的

只验证同一个落地流施工过程能否把两个只读任务分别交给两个低成本 Provider，并收回结果。

本探针不做代码修改、不做并发施工、不使用 GPT-6A、不使用 `fork`、不使用 `workflow`。

## 前置

新建 DSH 会话，预设选择「落地流」，确认工具面出现 `d_delegate`。

## 探针 A：research → Provider `a`

发送：

```text
只做探针：用 d_delegate 的 research 读取当前工作区 landing-flow/README.md，返回三条事实。
不要修改文件，不要调用其他子代理。
```

记录：

```text
实际 Provider：
实际 Model：
子会话 ID：
stop_reason：
返回结果：
.d-construction/runs.jsonl 路径：
input_tokens：
output_tokens：
```

## 探针 B：analysis → Provider `f`

发送：

```text
只做探针：用 d_delegate 的 analysis 读取当前工作区 landing-flow/bundle/d-construction-mode/index.js，返回三条事实。
不要修改文件，不要调用其他子代理。
```

记录：

```text
实际 Provider：
实际 Model：
子会话 ID：
stop_reason：
返回结果：
.d-construction/runs.jsonl 路径：
input_tokens：
output_tokens：
```

## 通过条件

- A 的账本记录为 `provider=a`，模型为 `deepseek-v4.1-flash`。
- B 的账本记录为 `provider=f`，模型为 `deepseek-v4.1-flash`。
- 两个结果都回到主会话。
- 两个任务都没有修改正式项目文件。
- `stop_reason` 为 `completed`，或明确记录真实 Provider 错误。
- 预算超限时，第二次调用在 `startActivation()` 前被拦截。
- 账本没有伪造 token；宿主未暴露 usage 时保持 `null`。
