/**
 * Host-half tests for @local/dsh-deep-construction.
 *
 * Runs with the bundled Node.js, no dependencies:
 *   node tests/host.test.mjs
 *
 * It exercises the real module exports: the prompt section, the session
 * projection's fold over committed `tool/call` events, the Client wire view and
 * the `d_state` tool definition (schema shape, execute result, project mirror).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

import {
  apply, capabilityReport, consentGuard, defectReport, hardDefects, localStamp, mergeState,
  probeCapabilities, toView, visualSurfaces,
} from '../index.js';

let passed = 0;
const failures = [];
async function check(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${label}`);
  } catch (error) {
    failures.push({ label, error });
    console.log(`FAIL  ${label}\n      ${error.message}`);
  }
}

// ---------------------------------------------------------------- mergeState
await check('mergeState: rejects a non-object patch and returns the same state', () => {
  const base = mergeState(null, { project_goal: 'g' });
  assert.equal(mergeState(base, 'not json'), base);
  assert.equal(mergeState(base, 42), base);
  assert.equal(mergeState(base, [1, 2]), base);
});

await check('mergeState: scalars replace, objects merge, unknown keys are dropped', () => {
  const a = mergeState(null, { project_goal: 'goal-1', current_stage: 'DISCOVERY', bogus: 'x' });
  assert.equal(a.project_goal, 'goal-1');
  assert.equal(a.current_stage, 'DISCOVERY');
  assert.equal('bogus' in a, false);
  const b = mergeState(a, { research: { status: '进行中' } });
  assert.equal(b.research.status, '进行中');
  const c = mergeState(b, { research: { conclusion: '采用 A' } });
  assert.equal(c.research.status, '进行中');
  assert.equal(c.research.conclusion, '采用 A');
  const d = mergeState(c, { project_goal: 'goal-2' });
  assert.equal(d.project_goal, 'goal-2');
  assert.equal(d.current_stage, 'DISCOVERY');
});

await check('mergeState: enum fields reject unknown values, free text passes', () => {
  const a = mergeState(null, {
    pipeline: [
      { stage: '需求发现', status: '通过', summary: 'ok' },
      { stage: '模块施工', status: '瞎写', summary: 'x' },
      { status: '通过' },
    ],
  });
  assert.equal(a.pipeline.length, 2, 'a row without its key field is dropped');
  assert.equal(a.pipeline[0].status, '通过');
  assert.equal(a.pipeline[1].status, undefined, 'an invalid enum value is dropped');
  assert.equal(mergeState(null, { current_stage: 'NOPE' }).current_stage, null);
});

await check('mergeState: arrays replace wholesale and JSON-string arguments parse', () => {
  const a = mergeState(null, { modules: [{ name: 'M1', status: '进行中' }] });
  const b = mergeState(a, { modules: [{ name: 'M1', status: '已完成' }, { name: 'M2', status: '未开始' }] });
  assert.equal(b.modules.length, 2);
  const c = mergeState(b, JSON.stringify({
    change_items: [{ id: 'Y8-X1', kind: 'X', title: '修复事件重复绑定' }],
    repair_history: [{ id: 'Y8-X1', tests: '96 → 89 pass', progress: 'PROGRESS' }],
  }));
  assert.equal(c.change_items[0].kind, 'X');
  assert.equal(c.repair_history[0].progress, 'PROGRESS');
  assert.equal(mergeState(null, { repair_history: [{ id: 'Y1', progress: 'MAYBE' }] }).repair_history[0].progress, undefined);
});

// ------------------------------------------------------------------- toView
await check('toView: null state renders nothing; a view carries only execution facts', () => {
  assert.equal(toView(null), null);
  const state = mergeState(null, {
    project_goal: '做一个小游戏',
    current_stage: 'REPAIR',
    progress_signal: 'Y8-X1｜96 → 89 pass｜PROGRESS',
    modules: [{ name: '核心循环', status: '已完成' }],
    blockers: [{ what: '缺少署名密钥', need: '用户提供' }],
    decisions: [{ decision_id: 'D-001', choice: 'Tauri', reason: '体积小' }],
    repair_history: [{ id: 'Y8-X1', progress: 'PROGRESS', tests: '96 → 89 pass' }],
    pending_user_decisions: [{ question: '是否联网', status: '待回答' }, { question: '已经问过', status: '已确认' }],
  });
  const view = toView(state);
  assert.equal(view.stage, 'REPAIR');
  assert.equal(view.stageState, 'repair');
  assert.equal(view.goal, '做一个小游戏');
  assert.equal(view.modules[0].status, '已完成');
  assert.equal(view.blockers[0].need, '用户提供');
  assert.equal(view.decisions[0].choice, 'Tauri');
  assert.equal(view.pending.length, 1, 'confirmed decisions leave the pending list');
  assert.equal('known' in view, false, 'the view is a slice, not the whole state');
});

// -------------------------------------------------- apply(): prompt+projection+tool
const registered = { tools: [] };
const stubCtx = {
  systemPrompt: { section: (section) => { registered.section = section; return () => {}; } },
  sessionProjections: { register: (definition) => { registered.projection = definition; return () => {}; } },
  tools: {
    register: (tool) => { registered.tool = tool; registered.tools.push(tool); return () => {}; },
    guard: (guard) => { registered.guard = guard; return () => {}; },
  },
};

const inert = { calls: 0 };
apply({ systemPrompt: { section: () => { inert.calls += 1; } } }, { inert: true });
await check('apply({inert:true}) registers nothing (the top-level client-only row)', () => {
  assert.equal(inert.calls, 0, 'the inert row must not touch systemPrompt');
});

apply(stubCtx);

await check('d_delegate: blocks a second task before activation when the budget is exhausted', async () => {
  const calls = [];
  const captured = [];
  apply({
    systemPrompt: { section: () => () => {} },
    sessionProjections: { register: () => () => {} },
    tools: { register: (tool) => { captured.push(tool); return () => {}; }, guard: () => () => {} },
    subagents: { startActivation: async (spec) => { calls.push(spec); return { childId: 'c1', result: Promise.resolve({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' }), dispose: async () => {} }; } },
  }, { delegateRoutes: { research: { provider: 'a', model: 'cheap', maxTokens: 1024 } }, delegateBudget: { maxTasks: 1, maxTokens: 1024 } });
  const tool = captured.find((entry) => entry.name === 'd_delegate');
  const budgetCwd = mkdtempSync(join(process.cwd(), '.d-budget-test-'));
  const exec = { agent: { id: 'parent', session: { header: { cwd: budgetCwd } } }, signal: new AbortController().signal };
  await tool.execute({ kind: 'research', task: '一次任务' }, exec);
  await assert.rejects(() => tool.execute({ kind: 'research', task: '第二次任务' }, exec), /任务上限|额度/);
  assert.equal(calls.length, 1, 'the second request is blocked before startActivation');
  assert.equal(calls[0].signal, exec.signal, 'caller cancellation signal reaches activation');
  rmSync(budgetCwd, { recursive: true, force: true });
});

await check('apply: registers the mode charter as a non-empty ordered prompt section', () => {
  assert.equal(registered.section.name, 'deep-construction');
  assert.equal(registered.section.order, 100);
  assert.match(registered.section.text, /落地流/);
  assert.match(registered.section.text, /【落地流】/, 'the receipt card header uses the mode name');
  assert.ok(registered.section.text.length > 5000, `charter length ${registered.section.text.length}`);
});

await check('projection: key, version, empty init and reference reuse on unrelated events', () => {
  const def = registered.projection;
  assert.equal(def.key, 'deepConstruction');
  assert.equal(def.stateVersion, 1);
  assert.equal(def.init(), null);
  const s0 = def.apply(null, { type: 'turn/start', data: {} });
  assert.equal(s0, null, 'unrelated events keep the same reference');
  const s1 = def.apply(null, { type: 'tool/call', data: { name: 'todo_write', arguments: '{}' } });
  assert.equal(s1, null);
});

await check('projection: folds committed d_state tool calls into the wire view', () => {
  const def = registered.projection;
  const s1 = def.apply(null, {
    type: 'tool/call',
    seq: 12,
    data: {
      name: 'd_state',
      arguments: JSON.stringify({
        project_goal: '做一个小游戏',
        current_stage: 'BUILD',
        pipeline: [{ stage: '需求发现', status: '通过', summary: '已确认 6 项' }],
        modules: [{ name: '核心循环', status: '进行中' }],
        decisions: [{ decision_id: 'D-001', choice: 'Phaser', reason: '2D 成熟底座' }],
      }),
    },
  });
  assert.equal(s1.current_stage, 'BUILD');
  const s2 = def.apply(s1, {
    type: 'tool/call',
    data: { name: 'd_state', arguments: '{"current_stage":"VERIFY","verification":[{"what":"关卡可玩","result":"1/1 pass"}]}' },
  });
  assert.equal(s2.current_stage, 'VERIFY');
  assert.equal(s2.decisions.length, 1, 'earlier fields survive a partial patch');
  const view = def.wire.view(s2);
  assert.equal(view.stage, 'VERIFY');
  assert.equal(view.stageState, 'running');
  assert.equal(view.pipeline[0].stage, '需求发现');
  assert.equal(view.verification[0].result, '1/1 pass');
});

await check('projection: a malformed fold never throws (it runs inside the append path)', () => {
  const def = registered.projection;
  const state = def.apply(null, { type: 'tool/call', data: { name: 'd_state', arguments: '{oops' } });
  assert.equal(state, null);
  assert.equal(def.apply(state, { type: 'tool/call' }), state);
  assert.equal(def.apply(state, { type: 'tool/call', data: null }), state);
});

// ------------------------------------------------- new state fields (§24/§49/§50/§60/§66)
await check('mergeState: decision date, change classification, failures, budget and design', () => {
  const s = mergeState(null, {
    decisions: [{ decision_id: 'D-001', choice: 'Phaser', date: '2026-10-07' }],
    change_items: [{ id: 'Y8-X1', kind: 'X', title: '修竞态', classification: '重做' }],
    technical_failures: [{ what: 'API 超时', kind: '技术失败', recovered: '重试成功' }],
    resource_budget: { time: '2h', note: '资源边界已到' },
    design: { status: '进行中', notes: '模块边界已定' },
  });
  assert.equal(s.decisions[0].date, '2026-10-07', 'the decision record carries its date (§24)');
  assert.equal(s.change_items[0].classification, '重做', '§60 classification is accepted');
  assert.equal(s.technical_failures[0].kind, '技术失败');
  assert.equal(s.resource_budget.time, '2h');
  assert.equal(s.design.status, '进行中');
  // invalid enum members and unknown fields are still dropped
  const bad = mergeState(null, {
    change_items: [{ id: 'Y1', kind: 'Q', classification: '随便' }],
    design: { status: '瞎写' },
    technical_failures: [{ what: 'x', kind: '环境噪音' }],
  });
  assert.equal(bad.change_items[0].classification, undefined);
  assert.equal(bad.change_items[0].kind, undefined);
  assert.equal(bad.design.status, null);
  assert.equal(bad.technical_failures[0].kind, undefined);
});

await check('toView: marks the Active Stage by canonical name or state value (§55)', () => {
  const byName = toView(mergeState(null, {
    current_stage: 'BUILD',
    pipeline: [
      { stage: '需求发现', status: '通过' },
      { stage: '模块施工', status: '进行中' },
      { stage: '验证', status: '未开始' },
    ],
  }));
  assert.equal(byName.pipeline.filter((row) => row.active).length, 1);
  assert.equal(byName.pipeline.find((row) => row.active).stage, '模块施工');
  const byValue = toView(mergeState(null, {
    current_stage: 'WAITING_USER_DECISION',
    pipeline: [{ stage: 'ConstructionBrief', status: '等待用户' }],
  }));
  assert.equal(byValue.pipeline[0].active, true, 'the display name maps to its states');
  const none = toView(mergeState(null, { current_stage: 'BLOCKED', pipeline: [{ stage: '验证', status: '阻塞' }] }));
  assert.equal(none.pipeline[0].active, false);
});

await check('toView: seeds the twelve canonical stages when the model listed none (§55)', () => {
  const view = toView(mergeState(null, { current_stage: 'DISCOVERY' }));
  assert.equal(view.pipeline.length, 12);
  assert.equal(view.pipeline[0].stage, '需求输入');
  assert.equal(view.pipeline.find((row) => row.active).stage, '需求发现');
});

await check('toView: carries plan, changes, artifacts, failures, budget, gaps and acceptance (§57/§66)', () => {
  const state = mergeState(null, {
    current_stage: 'VERIFY',
    plan: [{ step_id: 'Y1', title: '骨架', status: '已完成' }, { step_id: 'Y2', title: '关卡', status: '进行中' }],
    current_step: 'Y2',
    change_items: [{ id: 'Y1-B1', kind: 'B', title: '补回入口', classification: '复查' }],
    artifacts: [{ path: 'src/index.html', note: '单文件游戏' }],
    technical_failures: [{ what: '网络波动', kind: '技术失败' }],
    resource_budget: { task_limit: '单任务 30 分钟' },
    unknown: ['验收标准'], assumptions: ['假设浏览器形态'], deferred: ['联机'],
    final_acceptance: { status: '待验收', user_path: '双击 index.html', evidence: ['tests 10/10'] },
  });
  const view = toView(state);
  assert.deepEqual(view.plan.map((row) => row.step_id), ['Y1', 'Y2']);
  assert.equal(view.currentStep, 'Y2');
  assert.equal(view.changes[0].classification, '复查');
  assert.equal(view.artifacts[0].path, 'src/index.html');
  assert.equal(view.technicalFailures[0].kind, '技术失败');
  assert.equal(view.resources.taskLimit, '单任务 30 分钟');
  assert.deepEqual(view.requirements.counts, { unknown: 1, assumptions: 1, delegated: 0, deferred: 1 });
  assert.equal(view.requirements.unknown[0], '验收标准');
  assert.equal(view.acceptance.userPath, '双击 index.html');
  assert.equal(view.acceptance.evidence[0], 'tests 10/10');
});

await check('mergeState: experience contract, benchmarks, gaps, intake and user-only acceptance', () => {
  const s = mergeState(null, {
    experience_contract: {
      first_10s: '按 ←/→ 移动，场上立刻出现跟随的拖尾',
      first_60s: '吃到 3 个金币 → 数字跳动 + 音效升高',
      first_5min: '攒分 → 解锁新道具 → 目标变成刷更高分',
      screen: '左上角分数常驻，右下角连击倍率常变',
      feedback: '每次收集：粒子 + 短音 + 数字 +1',
    },
    benchmarks: [{ work: '某成熟增量游戏', what: '核心循环是正反馈叠加', source: 'https://example.com/review' }],
    surfaces: [
      { area: '玩法与操作', level: '一般', form: '左右移动 + 收集', source: '对标' },
      { area: '美术', level: '弱', form: '纯几何 + 程序化配色', source: '已授权自主' },
    ],
    intake: { status: '已回答', autonomy: '已授权', note: '一次问全 11 组已答' },
    gameplay_review: { playtest_path: 'node game.mjs 实际键盘试玩', replay_hook: '第二轮路线选择有变化' },
    visual_review: { runtime_screenshot: 'artifacts/game.png', retest_result: 'HUD 修正后同路径复测' },
    final_acceptance: { status: '待用户确认', user_only: ['你按下去是否觉得爽'] }
  });
  assert.match(s.experience_contract.first_10s, /拖尾/);
  assert.equal(s.benchmarks[0].source, 'https://example.com/review');
  assert.equal(s.surfaces[1].form, '纯几何 + 程序化配色');
  assert.equal(s.surfaces[1].source, '已授权自主');
  assert.equal(s.intake.autonomy, '已授权');
  assert.deepEqual(s.final_acceptance.user_only, ['你按下去是否觉得爽']);
  assert.equal(s.gameplay_review.playtest_path, 'node game.mjs 实际键盘试玩');
  assert.equal(s.visual_review.runtime_screenshot, 'artifacts/game.png');
  const bad = mergeState(null, { intake: { status: '随便', autonomy: '也许' }, surfaces: [{ area: '美术', level: '很强', source: '猜的' }] });
  assert.equal(bad.intake.status, null);
  assert.equal(bad.intake.autonomy, null);
  assert.equal(bad.surfaces[0].level, undefined, 'invalid levels and sources are dropped');
  assert.equal(bad.surfaces[0].source, undefined);
  const view = toView(s);
  assert.match(view.experience.first_60s, /金币/);
  assert.equal(view.benchmarks[0].work, '某成熟增量游戏');
  assert.equal(view.surfaces[0].area, '玩法与操作');
  assert.equal(view.surfaces[1].source, '已授权自主');
  assert.equal(view.requirements.intake.autonomy, '已授权');
  assert.deepEqual(view.acceptance.userOnly, ['你按下去是否觉得爽']);
});

await check('mergeState: the zero-to-one design basis carries definition, motivation, meaning, structure and time logic', () => {
  const s = mergeState(null, {
    design_basis: {
      definition: '增量游戏＝用最小操作换取持续增长的数字反馈',
      motivation: '爽感来自增长曲线与解锁节奏；本次取向：轻松纯爽',
      meaning: '第一次会话结束时应已解锁第二层资源，回来理由是离线收益结算',
      structure: '内容侧＝关卡/升级；交互侧＝单屏 + 收起式面板；数据侧＝本地存档；工程侧＝单文件优先',
      time_logic: '读系统日期做离线结算，禁止改时间刷收益（回拨则以最后存档时间为准）',
    },
  });
  assert.match(s.design_basis.definition, /增量游戏/);
  assert.match(s.design_basis.time_logic, /系统日期/);
  const view = toView(s);
  assert.match(view.basis.motivation, /纯爽/);
  assert.match(view.basis.structure, /单屏/);
  const bad = mergeState(null, { design_basis: { definition: 'x', unknown_field: 'y' } });
  assert.equal(bad.design_basis.unknown_field, undefined, 'unknown keys are dropped');
});

// ------------------------------------------------- construction lock (consent)
await check('construction lock: refuses construction tools until consent is confirmed', () => {
  const states = new Map();
  const fakeCtx = { sessionProjections: { stateOf: (session) => states.get(session) ?? null } };
  const guard = consentGuard(fakeCtx);
  const session = { id: 's1' };
  const call = (name) => ({ name, agent: { session } });

  // V6: a D session that never wrote state has no recorded consent either. This
  // used to be a one-call hole — no state meant `undefined`, i.e. the very first
  // write of a fresh session ran before anything had recorded authorisation.
  const boot = guard(call('write'));
  assert.match(boot, /还没有任何落地流状态/, 'an empty state no longer waves the first write through');
  assert.match(boot, /d_state/, 'the denial tells the run how to bootstrap');
  for (const name of ['edit', 'pwsh', 'run_code', 'subagent', 'subagent_fork', 'workflow']) {
    assert.equal(typeof guard(call(name)), 'string', `${name} is locked before bootstrap too`);
  }
  for (const name of ['read', 'glob', 'grep', 'web_search', 'web_fetch', 'd_state', 'ask_user_question']) {
    assert.equal(guard(call(name)), undefined, `${name} stays available before bootstrap`);
  }

  // A D session that never recorded consent starts locked.
  states.set(session, mergeState(null, {}));
  assert.equal(states.get(session).consent.status, '未确认', 'consent defaults to open');
  for (const name of ['write', 'edit', 'pwsh', 'run_code', 'subagent', 'subagent_fork', 'workflow']) {
    const denied = guard(call(name));
    assert.equal(typeof denied, 'string', `${name} must be denied without consent`);
    assert.match(denied, /施工锁/);
  }
  // Research and asking are never locked.
  for (const name of ['read', 'glob', 'grep', 'web_search', 'web_fetch', 'ask_user_question', 'd_state']) {
    assert.equal(guard(call(name)), undefined, `${name} must stay available`);
  }
  // Silence cannot unlock it, and an invented basis is dropped.
  states.set(session, mergeState(states.get(session), { consent: { status: '未确认', note: '用户没回' } }));
  assert.equal(typeof guard(call('write')), 'string');
  const faked = mergeState(null, { consent: { status: '已确认', basis: '我觉得他同意了' } });
  assert.equal(faked.consent.basis, null, 'unknown bases are dropped');
  // A real basis unlocks.
  for (const basis of ['用户回答', '用户授权默认值', '用户原始需求已完整']) {
    states.set(session, mergeState(null, { consent: { status: '已确认', basis } }));
    assert.equal(guard(call('write')), undefined, `${basis} unlocks construction`);
  }
  // A guard must never throw on odd input.
  assert.equal(guard(undefined), undefined);
  assert.equal(guard({ name: 'write' }), undefined);
});

// ---------------------------------------------------------------- d_state tool
await check('d_state: registers a well-formed JSON Schema tool definition', () => {
  const tool = registered.tool;
  assert.equal(tool.name, 'd_state');
  assert.equal(typeof tool.description, 'string');
  assert.equal(tool.parameters.type, 'object');
  assert.equal(tool.parameters.additionalProperties, false);
  const names = Object.keys(tool.parameters.properties);
  for (const field of ['project_goal', 'current_stage', 'pipeline', 'modules', 'plan', 'change_items',
    'verification', 'repair_history', 'technical_failures', 'resource_budget', 'design', 'intake', 'consent',
    'experience_contract', 'benchmarks', 'surfaces', 'design_basis',
    'blockers', 'decisions', 'construction_brief', 'final_acceptance']) {
    assert.ok(names.includes(field), `missing parameter ${field}`);
  }
  assert.deepEqual(tool.parameters.properties.intake.properties.autonomy.enum, ['未授权', '已授权']);
  assert.deepEqual(tool.parameters.properties.consent.properties.status.enum, ['未确认', '已确认']);
  assert.deepEqual(tool.parameters.properties.consent.properties.basis.enum,
    ['用户回答', '用户授权默认值', '用户原始需求已完整', '超时推进默认值']);
  assert.equal(typeof registered.guard, 'function', 'apply registers the construction lock');
  assert.equal(registered.guard.disposer, undefined);
  assert.ok(tool.parameters.properties.final_acceptance.properties.user_only, 'user-only acceptance items');
  assert.ok(tool.parameters.properties.experience_contract.properties.first_10s);
  assert.ok(tool.parameters.properties.gameplay_review.properties.replay_hook);
  assert.ok(tool.parameters.properties.visual_review.properties.runtime_screenshot);
  assert.deepEqual(tool.parameters.properties.surfaces.items.properties.source.enum, ['对标', '自产', '用户提供', '已授权自主']);
  assert.deepEqual(tool.parameters.properties.surfaces.items.properties.level.enum, ['强', '一般', '弱', '无']);
  assert.ok(tool.parameters.properties.decisions.items.properties.date, '§24: decision date');
  assert.ok(tool.parameters.properties.change_items.items.properties.classification, '§60: change classification');
  assert.deepEqual(tool.parameters.properties.change_items.items.properties.classification.enum, ['沿用', '复查', '重做', '作废']);
  assert.deepEqual(tool.parameters.properties.design.properties.status.enum, ['未开始', '进行中', '已完成', '需返工']);
  assert.match(tool.description, /technical_failures/);
  assert.match(tool.description, /沿用 \/ 复查 \/ 重做 \/ 作废/);
  assert.deepEqual(tool.parameters.properties.current_stage.enum.slice(0, 3), ['RECEIVE', 'UNDERSTAND', 'DISCOVERY']);
  assert.equal(tool.parameters.properties.modules.items.additionalProperties, false);
  assert.equal(typeof tool.output.render, 'function');
  assert.deepEqual(tool.output.schema.required, ['summary', 'state_path', 'capability', 'warning', 'now']);
  assert.deepEqual(tool.output.render({}, { summary: 's', state_path: '', warning: '' }), [{ type: 'text', text: 's' }]);
  assert.deepEqual(
    tool.output.render({}, { summary: 's', state_path: '', warning: 'w' }),
    [{ type: 'text', text: 's\n\nw' }],
    'a capability warning rides along with the summary',
  );
  assert.equal(typeof tool.execute, 'function');
  assert.equal(tool.presentCall({}).kind, 'other');
});

const cwd = mkdtempSync(join(process.cwd(), '.d-construction-test-'));
await check('d_state: execute merges state, mirrors it to the project file and reports counts', async () => {
  const tool = registered.tool;
  const session = { header: { cwd } };
  const ctx = {
    sessionProjections: {
      stateOf: (sessionArg, key) => {
        assert.equal(sessionArg, session);
        assert.equal(key, 'deepConstruction');
        return mergeState(null, {
          current_stage: 'VERIFY',
          modules: [{ name: 'M1', status: '已完成' }, { name: 'M2', status: '进行中' }],
          blockers: [{ what: '缺少密钥' }],
          pending_user_decisions: [{ question: '是否联网', status: '待回答' }],
          repair_history: [{ id: 'Y8-X1', progress: 'PROGRESS' }],
        });
      },
    },
  };
  const built = stateToolWith(ctx);
  const value = await built.execute({ current_stage: 'VERIFY' }, { agent: { session } });
  assert.match(value.summary, /阶段 VERIFY/);
  assert.match(value.summary, /模块 1\/2/);
  assert.match(value.summary, /阻塞 1 项/);
  assert.match(value.summary, /待你决定 1 项/);
  // The session clock rides back on every call: the model has no other way to
  // get it while the construction lock blocks shells (real-machine finding).
  assert.match(value.summary, /服务器时间 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/);
  assert.equal(value.now, localStamp());
  const mirrored = JSON.parse(readFileSync(join(cwd, '.d-construction', 'state.json'), 'utf8'));
  assert.equal(mirrored.current_stage, 'VERIFY');
  assert.equal(mirrored.modules.length, 2);
});

await check('construction lock: advance-on-timeout needs evidence on record', () => {
  const guard = consentGuard({
    sessionProjections: {
      stateOf: () => mergeState(null, {
        consent: { status: '已确认', basis: '超时推进默认值' },
      }),
    },
  });
  const call = { name: 'write', agent: { session: {} } };
  assert.match(guard(call), /超时推进默认值/);
  assert.match(guard(call), /auto_advance_log/);

  // With the log written, the same claim unlocks exactly like any other basis.
  const evidenced = consentGuard({
    sessionProjections: {
      stateOf: () => mergeState(null, {
        consent: { status: '已确认', basis: '超时推进默认值' },
        auto_advance_log: [{ item: '美术风格', default_used: '成套 CC0 像素包' }],
      }),
    },
  });
  assert.equal(evidenced(call), undefined);

  // These bases are still valid for non-game projects.
  for (const basis of ['用户授权默认值', '用户原始需求已完整']) {
    const plain = consentGuard({
      sessionProjections: { stateOf: () => mergeState(null, { consent: { status: '已确认', basis } }) },
    });
    assert.equal(plain(call), undefined, `${basis} still unlocks`);
  }
});

await check('construction lock: game requirements are not game approval', () => {
  const base = {
    current_stage: 'BUILD',
    project_goal: '做一个小游戏',
    platform: { kind: '游戏引擎', choice: 'Godot 4.7' },
    consent: { status: '已确认', basis: '用户回答' },
  };
  const guard = consentGuard({ sessionProjections: { stateOf: () => mergeState(null, base) } });
  const call = { name: 'write', agent: { session: {} } };
  assert.match(guard(call), /方案/);

  const selected = mergeState(null, {
    ...base,
    game_approval: { status: '用户已选方案', proposal_id: 'P1', proposal_name: '退潮拾荒者' },
  });
  const selectedGuard = consentGuard({ sessionProjections: { stateOf: () => selected } });
  assert.match(selectedGuard(call), /方案/);

  const approved = mergeState(null, {
    ...base,
    game_approval: {
      status: '用户明确同意施工', proposal_id: 'P1', proposal_name: '退潮拾荒者',
      user_evidence: '我选 P1，就按这个方案开工',
    },
  });
  const approvedGuard = consentGuard({ sessionProjections: { stateOf: () => approved } });
  assert.equal(approvedGuard(call), undefined);
});

await check('d_state: execute probes capabilities and returns the defects it found', async () => {
  const state = mergeState(null, {
    project_goal: '做一个小游戏',
    platform: { kind: '游戏引擎', choice: 'Godot 4.7' },
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '自产', art_weight: 'S' }],
    pending_user_decisions: [{ question: '必须阻塞的问题', status: '待回答', level: '红' }],
  });
  const built = stateToolWith(
    { sessionProjections: { stateOf: () => state } },
    { schemas: () => [{ name: 'd_state' }] },
  );
  const session = { header: { cwd } };
  const value = await built.execute({}, { agent: { session } });
  assert.match(value.capability, /视觉（能不能自己看画面）：没有/);
  assert.match(value.warning, /没有视觉能力/);
  assert.match(value.warning, /不该有红色项/);
  assert.match(value.warning, /美术权重 S/);
  const rendered = built.output.render({}, value)[0].text;
  assert.match(rendered, /不该有红色项/, 'the warning rides along with the summary');

  // A sighted agent with a clean state gets no warning at all.
  const clean = stateToolWith(
    { sessionProjections: { stateOf: () => mergeState(null, {}) } },
    { schemas: () => [{ name: 'vision_describe' }] },
  );
  const ok = await clean.execute({}, { agent: { session } });
  assert.equal(ok.warning, '');
  assert.match(ok.capability, /视觉（能不能自己看画面）：有/);
});

await check('d_state: execute requires an owning session', async () => {
  const built = stateToolWith({ sessionProjections: { stateOf: () => null } });
  await assert.rejects(() => built.execute({}, {}), /requires an owning agent session/);
});

// The tool builder is internal; reach it through a fresh apply() so the test
// does not depend on module-private exports.
function stateToolWith(ctx, extraTools = {}) {
  let captured;
  apply({
    systemPrompt: { section: () => () => {} },
    sessionProjections: {
      register: () => () => {},
      stateOf: ctx.sessionProjections.stateOf,
    },
    tools: {
      register: (tool) => { captured = tool; return () => {}; },
      guard: () => () => {},
      ...extraTools,
    },
  });
  return captured;
}

// ------------------------------------------------------------------ V2 host
await check('probeCapabilities: reads the real tool list, ignores look-alikes', () => {
  const probe = probeCapabilities([
    { name: 'vision_html_screenshot' },
    { name: 'vision_pixel_diff' },
    { name: 'visionary_helper' },
    { name: 'generate_image' },
    { name: 'dsh_im_return_file' },
    { name: 'd_state' },
  ]);
  assert.deepEqual(probe.visual.tools, ['vision_html_screenshot', 'vision_pixel_diff']);
  assert.equal(probe.visual.available, true);
  assert.deepEqual(probe.image_generation.tools, ['generate_image']);
  assert.equal(probe.im_push.available, true);
  const blind = probeCapabilities(undefined);
  assert.equal(blind.visual.available, false);
  assert.deepEqual(blind.visual.tools, []);
});

await check('visualSurfaces: matches a delivery area by keyword, not by exact name', () => {
  const state = mergeState(null, {
    surfaces: [
      { area: '美术与视觉', level: '弱', form: 'f', source: '自产' },
      { area: '数值与曲线', level: '强', form: 'f', source: '自产' },
      { area: '音频', level: '一般', form: 'f', source: '自产' },
    ],
  });
  assert.deepEqual(visualSurfaces(state).map((row) => row.area), ['美术与视觉', '音频']);
  assert.deepEqual(visualSurfaces(null), []);
});

await check('capabilityReport: warns only when blind AND a visual area is declared', () => {
  const surfaces = mergeState(null, {
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '自产' }],
  });
  const blind = capabilityReport(probeCapabilities([{ name: 'd_state' }]), surfaces);
  assert.match(blind.warning, /没有视觉能力/);
  assert.match(blind.warning, /美术与视觉/);
  assert.match(blind.warning, /不得声称看过任何画面/);

  const sighted = capabilityReport(probeCapabilities([{ name: 'vision_describe' }]), surfaces);
  assert.equal(sighted.warning, '');
  assert.match(sighted.line, /视觉（能不能自己看画面）：有（vision_describe）/);

  // Blind but nothing visual to judge: nothing to warn about.
  assert.equal(capabilityReport(probeCapabilities([]), mergeState(null, {})).warning, '');
  // An unprobeable tool service says so instead of pretending to know.
  assert.match(capabilityReport(null, surfaces).line, /无法探测/);
});

await check('mergeState: V2 kickoff, asset policy, auto-advance log and capability note', () => {
  const next = mergeState(null, {
    kickoff: {
      status: '已发出', path: 'docs/开工文档.md', question_count: '9',
      blocking_count: '0', note: '覆盖美术/音频/领域',
    },
    asset_policy: {
      image_api: '未接', budget_note: '单次 ≤ ¥20', licence_note: '仅 CC0/MIT',
    },
    auto_advance_log: [{
      item: '美术风格', default_used: '成套 CC0 像素包 + 统一色相偏移',
      reason: '标黄项超 40 分钟无回应', at: '2026-10-09T20:00:00+08:00', notified_via: 'IM 推送',
    }],
    capabilities_note: '视觉（能不能自己看画面）：有（vision_describe）',
  });
  assert.equal(next.kickoff.status, '已发出');
  assert.equal(next.kickoff.path, 'docs/开工文档.md');
  assert.equal(next.kickoff.blocking_count, '0');
  assert.equal(next.asset_policy.image_api, '未接');
  assert.equal(next.auto_advance_log.length, 1);
  assert.equal(next.auto_advance_log[0].default_used, '成套 CC0 像素包 + 统一色相偏移');
  assert.match(next.capabilities_note, /vision_describe/);

  // An unknown kickoff status is refused rather than stored as-is.
  const refused = mergeState(null, { kickoff: { status: '瞎写' } });
  assert.equal(refused.kickoff.status, null);
});

await check('mergeState: V2 reviewers keep the officer, drop illegal enum values', () => {
  const next = mergeState(null, {
    reviewers: [
      { officer: '初见官', status: '通过', isolation: '独立子代理', evidence: 'shot-01.png @12s' },
      { officer: '对抗官', status: '不通过', isolation: '独立子代理', overturned: '推翻 留存官 第 3 条' },
      { officer: '自封官', status: '通过', isolation: '独立子代理' },
      { officer: '留存官', status: '差不多吧', isolation: '独立子代理' },
    ],
  });
  // A row lives or dies by its key: an unknown officer is not a reviewer at all,
  // while a known officer with a bogus status survives without a status — the
  // record that it ran matters more than the value it made up.
  assert.deepEqual(next.reviewers.map((row) => row.officer), ['初见官', '对抗官', '留存官']);
  assert.equal('status' in next.reviewers[2], false);
  assert.equal(next.reviewers[1].overturned, '推翻 留存官 第 3 条');
});

await check('mergeState: V2 surfaces carry material, origin, licence and art weight', () => {
  const next = mergeState(null, {
    surfaces: [{
      area: '美术与视觉', level: '弱', form: '成套 CC0 像素包', source: '对标',
      material: 'Kenney 1-Bit Pack', origin: '开源素材', licence: 'CC0', art_weight: 'S',
    }],
  });
  assert.equal(next.surfaces[0].origin, '开源素材');
  assert.equal(next.surfaces[0].art_weight, 'S');
  assert.equal(next.surfaces[0].licence, 'CC0');
  // An origin outside the decision tree is dropped, not silently accepted.
  const bogus = mergeState(null, {
    surfaces: [{ area: '音频', level: '弱', form: 'f', source: '自产', origin: '随手抄的' }],
  });
  assert.equal('origin' in bogus.surfaces[0], false);
});

await check('mergeState: V2 pending decisions carry a yellow level and a fallback', () => {
  const next = mergeState(null, {
    pending_user_decisions: [
      { question: '画面重要吗', status: '待回答', level: '黄', fallback: '按 A 级处理', timeout_min: '40' },
      { question: '要不要红色阻塞', status: '待回答', level: '红' },
      { question: '随便填的等级', status: '待回答', level: '紫' },
    ],
  });
  assert.equal(next.pending_user_decisions[0].fallback, '按 A 级处理');
  assert.equal(next.pending_user_decisions[0].level, '黄');
  // 红 is kept on purpose: erasing it would hide the mode defect. 紫 is not a
  // level at all, so only the illegal-but-meaningful value survives.
  assert.equal(next.pending_user_decisions[1].level, '红');
  assert.equal('level' in next.pending_user_decisions[2], false);
});

await check('defectReport: catches the mode breaking its own rules', () => {
  assert.deepEqual(defectReport(mergeState(null, {})), []);
  assert.deepEqual(defectReport(null), []);

  const red = defectReport(mergeState(null, {
    pending_user_decisions: [{ question: '必须阻塞的问题', status: '待回答', level: '红' }],
  }));
  assert.equal(red.length, 1);
  assert.match(red[0], /不该有红色项/);
  assert.match(red[0], /必须阻塞的问题/);

  assert.match(
    defectReport(mergeState(null, { kickoff: { blocking_count: '2' } }))[0],
    /必须恒为 0/,
  );
  assert.deepEqual(defectReport(mergeState(null, { kickoff: { blocking_count: '0' } })), []);

  const stamp = defectReport(mergeState(null, {
    reviewers: [
      { officer: '初见官', status: '通过', isolation: '同会话' },
      { officer: '留存官', status: '通过', isolation: '独立子代理' },
    ],
  }));
  assert.equal(stamp.length, 1);
  assert.match(stamp[0], /橡皮图章/);
  assert.match(stamp[0], /初见官/);

  const licence = defectReport(mergeState(null, {
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '对标', licence: 'CC-BY-SA' }],
  }));
  assert.match(licence[0], /许可红线/);
  assert.deepEqual(defectReport(mergeState(null, {
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '对标', licence: 'CC0' }],
  })), []);

  const artS = defectReport(mergeState(null, {
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '自产', art_weight: 'S' }],
  }));
  assert.match(artS[0], /美术权重 S/);
  assert.deepEqual(defectReport(mergeState(null, {
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '用户提供', art_weight: 'S' }],
  })), []);
});

await check('defectReport: a yellow item with no fallback cannot auto-advance', () => {
  // Real-machine finding: the run stamped asked_at from a shell it could not
  // reach. The clock is host-supplied now; a missing fallback is the other half
  // of the same rule — at the 40-minute mark there is nothing to advance *to*.
  const missing = defectReport(mergeState(null, {
    pending_user_decisions: [{ question: '美术风格选哪种', status: '待回答', level: '黄', asked_at: '2026-10-09T20:00:00+08:00' }],
  }));
  assert.match(missing[0], /缺少 fallback/);
  assert.match(missing[0], /美术风格选哪种/);
  assert.match(missing[0], /服务器时间/, 'the fix must point at the host clock');

  const blank = defectReport(mergeState(null, {
    pending_user_decisions: [{ question: 'q', status: '待回答', level: '黄', fallback: '   ' }],
  }));
  assert.match(blank[0], /缺少 fallback/);

  assert.deepEqual(defectReport(mergeState(null, {
    pending_user_decisions: [{ question: 'q', status: '待回答', level: '黄', fallback: '按 A 推进' }],
  })), []);
  // An answered item no longer needs a fallback, and an unanswered one without a
  // level was never a kickoff item.
  assert.deepEqual(defectReport(mergeState(null, {
    pending_user_decisions: [{ question: 'q', status: '已确认' }],
  })), []);
});

await check('defectReport: a blank platform is a defect once design has started', () => {
  // V2.1 real-machine finding: a full single-file game was built — physics,
  // renderer, audio graph, input, save — without a single game engine ever being
  // considered. The rule is not "you must use an engine"; it is "self-building
  // must be an answer you gave, not a default nobody asked about".
  const early = defectReport(mergeState(null, { current_stage: 'DISCOVERY' }));
  assert.deepEqual(early, [], 'before design it is simply not time yet');

  const late = defectReport(mergeState(null, { current_stage: 'BUILD' }));
  assert.equal(late.length, 1);
  assert.match(late[0], /没写承载平台/);
  assert.match(late[0], /Godot/, 'the candidate engines must be named');
  assert.match(late[0], /alternatives/, 'and it must say where the rejected list goes');

  assert.deepEqual(defectReport(mergeState(null, {
    current_stage: 'BUILD',
    platform: { choice: 'Godot 4.4', kind: '游戏引擎' },
  })), [], 'naming an engine settles it; no alternatives are owed');
});

await check('defectReport: choosing 无框架自研 owes at least two rejected platforms', () => {
  const blank = defectReport(mergeState(null, {
    current_stage: 'BUILD',
    platform: { choice: '自写 Canvas 引擎', kind: '无框架自研' },
  }));
  assert.equal(blank.length, 1);
  assert.match(blank[0], /没有列出考虑过并否掉的平台/);
  assert.match(blank[0], /why_not/);

  const one = defectReport(mergeState(null, {
    current_stage: 'BUILD',
    platform: {
      choice: '自写 Canvas 引擎',
      kind: '无框架自研',
      alternatives: [{ name: 'Godot 4.4', why_not: '导出为多文件，不满足单文件交付' }],
    },
  }));
  assert.equal(one.length, 1);
  assert.match(one[0], /候选只有 1 个/);

  // Rows with a blank name survive recordList only if the key is a non-empty
  // string, so a blank row is simply not a candidate.
  const named = defectReport(mergeState(null, {
    current_stage: 'BUILD',
    platform: {
      choice: '自写 Canvas 引擎',
      kind: '无框架自研',
      alternatives: [
        { name: 'Godot 4.4', why_not: 'web 导出为 wasm+pck 多文件，file:// 下受限' },
        { name: 'Phaser 3', why_not: '会引入外部依赖，用户要求零依赖单文件' },
      ],
    },
  }));
  assert.deepEqual(named, [], 'two real candidates with reasons settles the choice');
});

await check('platform: mergeState keeps scalars and replaces the alternatives list', () => {
  const first = mergeState(null, {
    platform: {
      choice: 'Godot 4.4',
      kind: '游戏引擎',
      alternatives: [{ name: 'Unity', why_not: '许可与体积' }],
    },
  });
  assert.equal(first.platform.choice, 'Godot 4.4');
  assert.equal(first.platform.alternatives.length, 1);

  // One scalar update must not wipe the rest.
  const second = mergeState(first, { platform: { cost: '免费，无分成' } });
  assert.equal(second.platform.choice, 'Godot 4.4', 'scalars merge by key');
  assert.equal(second.platform.alternatives.length, 1, 'untouched arrays survive');

  // An explicit array replaces wholesale — the same rule every list field follows.
  const third = mergeState(second, { platform: { alternatives: [] } });
  assert.deepEqual(third.platform.alternatives, []);

  // A blank row has no usable key, so it is not a candidate at all.
  const junk = mergeState(null, { platform: { alternatives: [{ why_not: 'no name' }] } });
  assert.deepEqual(junk.platform.alternatives, []);
});

// ------------------------------------------------------------------ V4 美术达标
// The user's verdict on a complete, playable, 170-assertion-verified single-file
// game was "美术还是一般，比较粗糙". These four rules encode what was missing:
// a target to hit, a palette that encodes depth, a counted loop, and a loop that
// actually changes something.

await check('defectReport: heavy art without references is a defect', () => {
  const base = {
    current_stage: 'BUILD',
    surfaces: [{ area: '美术与视觉', art_weight: 'S', origin: '程序化', licence: 'CC0' }],
  };
  const bare = defectReport(base);
  assert.ok(bare.some((line) => line.includes('美术没有参考图')), bare.join('\n'));

  // One reference is still not "built against references".
  const one = defectReport({ ...base, art: { references: [{ name: 'Inside', what_to_steal: '分层' }] } });
  assert.ok(one.some((line) => line.includes('美术没有参考图')), one.join('\n'));

  // Two, each with an extraction, clears that rule.
  const two = defectReport({
    ...base,
    art: {
      references: [
        { name: 'Inside', source: 'https://x', what_to_steal: '三层剪影，最暗在最远层' },
        { name: '用户给的图', source: '用户提供', what_to_steal: '暖光从右侧进入' },
      ],
    },
  });
  assert.ok(!two.some((line) => line.includes('美术没有参考图')), two.join('\n'));
});

await check('defectReport: references nobody extracts anything from are called out', () => {
  const out = defectReport({
    current_stage: 'BUILD',
    surfaces: [{ area: '美术与视觉', art_weight: 'A' }],
    art: {
      references: [
        { name: 'A', what_to_steal: '分层方式' },
        { name: 'B' },
        { name: 'C' },
      ],
    },
  });
  assert.ok(out.some((line) => line.includes('有参考图但没从中提取做法')), out.join('\n'));
});

await check('defectReport: a value-only palette is the "dirty grey" defect', () => {
  const base = {
    current_stage: 'BUILD',
    surfaces: [{ area: '美术与视觉', art_weight: 'S' }],
  };
  const grey = defectReport({
    ...base,
    art: {
      references: [{ name: 'A', what_to_steal: 'x' }, { name: 'B', what_to_steal: 'y' }],
      // Same hue walked down in value — exactly what made the shipped art read flat.
      palette: [{ hex: '#333344' }, { hex: '#444455' }, { hex: '#555566' }],
    },
  });
  assert.ok(grey.some((line) => line.includes('色板不够分层')), grey.join('\n'));
  assert.ok(/色板不够分层[\s\S]*?3 个不同色值/.test(grey.find((l) => l.includes('色板不够分层'))),
    'the count must be named');

  const ok = defectReport({
    ...base,
    art: {
      references: [{ name: 'A', what_to_steal: 'x' }, { name: 'B', what_to_steal: 'y' }],
      palette: [{ hex: '#2B3A55' }, { hex: '#3D5A80' }, { hex: '#EE6C4D' }, { hex: '#F4A261' }],
    },
  });
  assert.ok(!ok.some((line) => line.includes('色板不够分层')), ok.join('\n'));
});

await check('defectReport: art that was rendered once and called done is a defect', () => {
  const base = {
    current_stage: 'VERIFY',
    surfaces: [{ area: '美术与视觉', art_weight: 'A' }],
    art: {
      references: [{ name: 'A', what_to_steal: 'x' }, { name: 'B', what_to_steal: 'y' }],
      palette: [{ hex: '#2B3A55' }, { hex: '#3D5A80' }, { hex: '#EE6C4D' }, { hex: '#F4A261' }],
    },
  };
  const once = defectReport({ ...base, art: { ...base.art, view_rounds: [{ round: '1', changed: '调了雾' }] } });
  assert.ok(once.some((line) => line.includes('美术没有真的迭代')), once.join('\n'));

  // Three rounds clears the count rule, but a round that changed nothing is still a defect.
  const idle = defectReport({
    ...base,
    art: {
      ...base.art,
      view_rounds: [
        { round: '1', changed: '加了色相偏移' },
        { round: '2', changed: '加了噪点' },
        { round: '3', gaps: '角色读不出来', changed: '' },
      ],
    },
  });
  assert.ok(idle.some((line) => line.includes('只看了没改')), idle.join('\n'));
  assert.ok(!idle.some((line) => line.includes('美术没有真的迭代')), 'three rounds is enough');

  const done = defectReport({
    ...base,
    art: {
      ...base.art,
      view_rounds: [
        { round: '1', changed: '加了色相偏移' },
        { round: '2', changed: '加了噪点' },
        { round: '3', changed: '角色加边缘光' },
      ],
    },
  });
  assert.ok(!done.some((line) => line.includes('美术')), done.join('\n'));
});

await check('defectReport: art rules stay silent when no area carries real art weight', () => {
  const out = defectReport({
    current_stage: 'BUILD',
    surfaces: [{ area: '数值与曲线', art_weight: 'B' }],
  });
  assert.ok(!out.some((line) => line.includes('美术')), out.join('\n'));
});

await check('defectReport: the design package must exist before the dossier goes out', () => {
  // V5 real-machine finding: a one-line greenfield request ("挂机的唯美画风游戏…
  // 你多想几个") went straight to eight template questions — screen layout, scenery
  // structure, art weight, disaster intensity, save, sound, exclusions, acceptance
  // — without a single game ever being named. Discovery step 0 requires the
  // zero-to-one design package *first*, so the questions grow out of "which game
  // is this". The engine policed seven other principles and never looked at
  // design_basis at all, which is why this passed silently.

  // Before the dossier is out, an empty package is simply not time yet.
  assert.deepEqual(defectReport(mergeState(null, { current_stage: 'DISCOVERY' })), []);

  const empty = defectReport(mergeState(null, {
    kickoff: { status: '已发出', blocking_count: '0' },
  }));
  assert.ok(empty.some((line) => line.includes('design_basis 整个是空的')), empty.join('\n'));
  // The fix has to point at step 0 and at the template-questionnaire failure.
  assert.ok(empty.some((line) => line.includes('第 0 条')), empty.join('\n'));
  assert.ok(empty.some((line) => line.includes('固定问卷')), empty.join('\n'));

  // A partially filled package names the missing fields.
  const partial = defectReport(mergeState(null, {
    kickoff: { status: '已发出' },
    design_basis: { definition: '挂机型观赏游戏', motivation: '低注意力陪伴' },
  }));
  assert.ok(
    partial.some((line) => line.includes('少了') && line.includes('feeling')),
    partial.join('\n'),
  );

  // All six fields but nothing nameable underneath is still the same failure:
  // granularity is the judgement, not count.
  const filled = {
    definition: 'd', motivation: 'm', meaning: 'e', structure: 's', time_logic: 't', feeling: 'f',
  };
  const unnamed = defectReport(mergeState(null, {
    kickoff: { status: '已发出' }, design_basis: { ...filled },
  }));
  assert.ok(unnamed.some((line) => line.includes('没有可命名的具体方案')), unnamed.join('\n'));

  // Name-only rows do not count either — a pitch with no meat is a label.
  const nameOnly = defectReport(mergeState(null, {
    kickoff: { status: '已发出' },
    design_basis: { ...filled, pitches: [{ name: '甲' }, { pitch: '乙' }] },
  }));
  assert.ok(nameOnly.some((line) => line.includes('没有可命名的具体方案')), nameOnly.join('\n'));

  // The passing shape: six fields and >= 2 named pitches.
  const good = defectReport(mergeState(null, {
    kickoff: { status: '已发出', blocking_count: '0' },
    design_basis: {
      ...filled,
      pitches: [
        { name: '退潮后的滩涂拾荒者', pitch: '等潮水退去后捡拾，画面常驻潮位与光' },
        { name: '候鸟迁徙的领航员', pitch: '按气流调整航向，常驻风向与鸟群' },
      ],
    },
  }));
  assert.deepEqual(good, [], good.join('\n'));

  // An answered dossier is held to the same gate, and so is a timed-out one.
  for (const status of ['已回答', '已超时推进']) {
    const out = defectReport(mergeState(null, { kickoff: { status } }));
    assert.ok(out.some((line) => line.includes('design_basis 整个是空的')), `${status}: ${out.join('\n')}`);
  }
});

await check('defectReport: an invented asked_at destroys the 40-minute rule', () => {
  // V5 hole 1. Two skills insist the stamp come from the host's 服务器时间 and one
  // records that a run already fabricated it. Nothing checked, so a past-dated
  // stamp advances instantly and a future-dated one never advances — and the mode
  // cannot tell either apart from genuine user silence.
  const item = (askedAt) => mergeState(null, {
    kickoff: { status: '已发出' },
    design_basis: {
      definition: 'd', motivation: 'm', meaning: 'e', structure: 's', time_logic: 't', feeling: 'f',
      pitches: [{ name: '甲', pitch: 'p' }, { name: '乙', pitch: 'q' }],
    },
    pending_user_decisions: [{
      question: '美术风格选哪种', status: '待回答', level: '黄', fallback: 'A', asked_at: askedAt,
    }],
  });

  const stale = defectReport(item('2020-01-01T00:00:00+08:00'));
  assert.ok(stale.some((line) => line.includes('asked_at 不是服务器时间')), stale.join('\n'));
  assert.ok(stale.some((line) => line.includes('美术风格选哪种')), stale.join('\n'));

  const future = defectReport(item('2099-01-01T00:00:00+08:00'));
  assert.ok(future.some((line) => line.includes('asked_at 不是服务器时间')), future.join('\n'));

  const garbage = defectReport(item('等一下'));
  assert.ok(garbage.some((line) => line.includes('不是合法时间')), garbage.join('\n'));

  // The host clock passes, and a long-but-real turn must not trip the tolerance.
  assert.deepEqual(defectReport(item(localStamp())), []);
  const skewed = defectReport(item(localStamp(new Date(Date.now() - 60 * 60 * 1000))));
  assert.deepEqual(skewed, [], 'an hour-old stamp is a real turn, not an invention');
  // A blank stamp is the missing-fallback rule's business, not this one.
  const blank = mergeState(null, {
    pending_user_decisions: [{ question: 'q', status: '待回答', level: '黄', fallback: 'A' }],
  });
  assert.ok(!defectReport(blank).some((line) => line.includes('asked_at')), defectReport(blank).join('\n'));
});

await check('defectReport: a G change direction is owed the user, not assumed', () => {
  // V5 hole 3. §变更权限 defaults G to需要用户确认; nothing checked, so a run
  // could re-plan its own direction and file the paperwork as if agreed.
  const g = (extra = {}) => defectReport(mergeState(null, {
    change_items: [{ id: 'G1', kind: 'G', title: '重做体验设计', status: '进行中', classification: '重做' }],
    ...extra,
  }));
  assert.ok(g().some((line) => line.includes('方向变更 G 未经用户确认')), g().join('\n'));
  assert.ok(g().some((line) => line.includes('G1')), g().join('\n'));
  // An authorized run may regoal; a non-G change was never gated.
  assert.deepEqual(g({ consent: { status: '已确认', basis: '用户回答' } }), []);
  assert.deepEqual(defectReport(mergeState(null, {
    change_items: [{ id: 'X1', kind: 'X', title: '修 bug', status: '进行中', classification: '沿用' }],
  })), []);
});

await check('defectReport: the art-weight answer must land in surfaces', () => {
  // V5 hole 2. The dossier must ask art weight and surfaces must carry it, but
  // nothing tied the two — and the entire art gate keys off that field, so
  // losing it switched references/palette/rounds off silently.
  const sent = {
    kickoff: { status: '已发出', blocking_count: '0' },
    design_basis: {
      definition: 'd', motivation: 'm', meaning: 'e', structure: 's', time_logic: 't', feeling: 'f',
      pitches: [{ name: '甲', pitch: 'p' }, { name: '乙', pitch: 'q' }],
    },
    current_stage: 'DISCOVERY',
  };
  const lost = defectReport(mergeState(null, {
    ...sent,
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '自产', licence: 'CC0' }],
  }));
  assert.ok(lost.some((line) => line.includes('美术权重问了没落地')), lost.join('\n'));
  // Before the dossier goes out it is simply not time yet.
  assert.deepEqual(defectReport(mergeState(null, {
    current_stage: 'DISCOVERY',
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '自产', licence: 'CC0' }],
  })), []);
});

await check('defectReport: style direction is owed from DISCOVERY, not from DESIGN', () => {
  // V5 hole 5. The art gate used to switch on at DESIGN, but style direction is
  // settled *during* DISCOVERY — it is the question the dossier asks. The light
  // came on after the room was dark.
  const heavy = (stage, extra = {}) => defectReport(mergeState(null, {
    current_stage: stage,
    kickoff: { status: '已发出', blocking_count: '0' },
    design_basis: {
      definition: 'd', motivation: 'm', meaning: 'e', structure: 's', time_logic: 't',
      pitches: [{ name: '甲', pitch: 'p' }, { name: '乙', pitch: 'q' }],
    },
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '用户提供', licence: 'CC0', art_weight: 'S' }],
    ...extra,
  }));
  const dark = heavy('DISCOVERY');
  assert.ok(dark.some((line) => line.includes('画风方向没定就发问了')), dark.join('\n'));

  // Either a translated feeling or a real reference satisfies it.
  const viaFeeling = heavy('DISCOVERY', { design_basis: {
    definition: 'd', motivation: 'm', meaning: 'e', structure: 's', time_logic: 't',
    feeling: '唯美 → 低饱和远景 + 空气透视',
    pitches: [{ name: '甲', pitch: 'p' }, { name: '乙', pitch: 'q' }],
  } });
  assert.ok(!viaFeeling.some((line) => line.includes('画风方向没定')), viaFeeling.join('\n'));
  const viaRefs = heavy('DISCOVERY', { art: { references: [{ name: 'Alto', what_to_steal: '分层剪影' }] } });
  assert.ok(!viaRefs.some((line) => line.includes('画风方向没定')), viaRefs.join('\n'));

  // B-weight never owes a style direction at all.
  const light = defectReport(mergeState(null, {
    current_stage: 'DISCOVERY',
    kickoff: { status: '已发出' },
    design_basis: {
      definition: 'd', motivation: 'm', meaning: 'e', structure: 's', time_logic: 't', feeling: 'f',
      pitches: [{ name: '甲', pitch: 'p' }, { name: '乙', pitch: 'q' }],
    },
    surfaces: [{ area: '数值与曲线', level: '弱', form: 'f', source: '自产', licence: 'CC0', art_weight: 'B' }],
  }));
  assert.ok(!light.some((line) => line.includes('画风方向没定')), light.join('\n'));
});

await check('defectReport: a host-game mod owes its host, version and loader', () => {
  // V5 §宿主游戏 mod. A mod is not a standalone product: the carrying platform is
  // someone else's game, and the loader is bound to the version. These three facts
  // decide whether the jar loads anywhere at all — so a blank one is not a missing
  // note, it is an unloadable deliverable.
  const mod = (platform) => defectReport(mergeState(null, {
    current_stage: 'DESIGN', platform: { kind: '宿主游戏 mod', choice: 'MC mod', ...platform },
  }));
  const bare = mod({});
  assert.ok(bare.some((line) => line.includes('宿主游戏 mod 没写清载体')), bare.join('\n'));
  assert.ok(bare.some((line) => line.includes('host_game')), bare.join('\n'));
  assert.ok(bare.some((line) => line.includes('host_loader')), bare.join('\n'));
  // The version/loader question is a spec question: it belongs to the user.
  assert.ok(bare.some((line) => line.includes('必须问用户')), bare.join('\n'));

  // Partial is still owed the rest — and only the rest.
  const partial = mod({ host_game: 'Minecraft Java 版', host_version: '1.20.1' });
  assert.ok(partial.some((line) => line.includes('host_loader')), partial.join('\n'));
  // The missing-list is the sentence's own claim; read it, not the prose around it.
  const missingClause = partial.find((line) => line.includes('platform 少了')) ?? '';
  assert.ok(/少了\s*host_loader/.test(missingClause), missingClause);
  assert.ok(!/少了[^。]*host_game/.test(missingClause), missingClause);

  // A named combination is the passing shape.
  const good = mod({
    host_game: 'Minecraft Java 版', host_version: '1.20.1', host_loader: 'Forge 47.2.0',
  });
  assert.deepEqual(good, [], good.join('\n'));

  // A non-mod platform never owes any of this.
  assert.deepEqual(defectReport(mergeState(null, {
    current_stage: 'DESIGN', platform: { kind: '游戏引擎', choice: 'Godot 4.7' },
  })), []);
});

await check('defectReport: a mod must not be labelable as a plain engine', () => {
  // The kind is a *selection*, so it can simply be missed — and writing
  // "游戏引擎" routes the whole deliverable around every mod rule below it.
  // Saying "Minecraft mod" while claiming an engine is the same jar under a
  // label that skips version locking, loader binding and the host-aware gate.
  const at = (kind, choice) => defectReport(mergeState(null, {
    current_stage: 'DESIGN', platform: { kind, choice },
  }));
  const caught = (kind, choice) => at(kind, choice).some((l) => l.includes('这看起来是做 mod'));

  for (const [kind, choice] of [
    ['游戏引擎', 'Minecraft Forge mod'],
    ['游戏引擎', 'Minecraft Fabric 模组'],
    ['应用框架', 'NeoForge mod'],
    ['其它', '写一个 Minecraft mod'],
    ['游戏引擎', 'Bukkit 插件'],
    ['游戏引擎', 'tModLoader 模组'],
  ]) {
    assert.ok(caught(kind, choice), `disguised mod missed: ${kind} / ${choice}`);
  }
  // A genuine non-mod must never be flagged...
  for (const [kind, choice] of [
    ['游戏引擎', 'Godot 4.7'],
    ['浏览器原生', 'Canvas 2D + Web Audio'],
    ['无框架自研', '自写引擎'],
    ['游戏引擎', '3D model viewer with Godot'], // "model" must not match \bmod\b
    ['宿主游戏 mod', 'Minecraft mod'],          // correct kind: the other rule owns it
  ]) {
    assert.ok(!caught(kind, choice), `false positive: ${kind} / ${choice}`);
  }
});

await check('defectReport: host_version must pin exactly one version', () => {
  // MC major versions do not share an API. Writing a range into host_version
  // claims a property that only exists as separately compiled artifacts — and a
  // vague version ("最新版", "1.20.x") pins nothing, so the jar that ships is
  // exactly the one nobody can load. Both are the same failure: no single target.
  const at = (version) => defectReport(mergeState(null, {
    current_stage: 'DESIGN',
    platform: {
      kind: '宿主游戏 mod', choice: 'MC mod', host_game: 'Minecraft Java 版',
      host_version: version, host_loader: 'Forge 47.2.0',
    },
  }));
  const flagged = (version) => at(version).some((line) => line.includes('不是一个具体版本'));

  // Ranges: more than one version named.
  for (const bad of ['1.20.1 / 1.21', '1.20.1-1.21', '1.20.1 与 1.21', '1.20.1 或 1.21',
    '多版本', '全版本', '跨版本', '多个版本']) {
    assert.ok(flagged(bad), `range not caught: ${bad} -> ${at(bad).join('\n')}`);
  }
  // Vague or open-ended: names no version at all.
  for (const bad of ['最新版', 'latest', '稳定版', '推荐版', '任意版本', '随便',
    '1.20.x', '1.20.1 以上', '>=1.20.1', '>1.20', '1.20+', '1.20.1+', '~1.20.1', '*']) {
    assert.ok(flagged(bad), `vague version not caught: ${bad} -> ${at(bad).join('\n')}`);
  }

  // One concrete version is the whole point — and a loader joined to it by `+`
  // or `/` must NOT be mistaken for a range (that would block a correct answer).
  for (const ok of ['1.20.1', '1.21', '1.12.2', '1.7.10', '1.21.4',
    '1.20.1（我们的整合包）', '1.20.1 Forge', '1.20.1+Forge 47.2.0',
    '1.20.1 / Forge 47.2.0', '1.20.1 + NeoForge 21.1']) {
    assert.deepEqual(at(ok), [], `legitimate version blocked: ${ok} -> ${at(ok).join('\n')}`);
  }
});

await check('defectReport: a mod reaching acceptance must name the environment', () => {
  // The product gate is "别人照你的自述能跑起来" — for a mod that sentence needs a
  // subject. Without the version+loader combination the criterion is untestable.
  const at = (stage, extra = {}) => defectReport(mergeState(null, {
    current_stage: stage,
    platform: {
      kind: '宿主游戏 mod', choice: 'MC mod', host_game: 'Minecraft Java 版',
      host_version: '1.20.1', host_loader: 'Forge 47.2.0',
    },
    ...extra,
  }));
  const noPath = at('ACCEPTANCE');
  assert.ok(noPath.some((line) => line.includes('验收路径没写清环境')), noPath.join('\n'));
  assert.equal(noPath.some((line) => line.includes('游戏试玩证据未闭环')), false, 'hosted-game mods are not standalone playable games');
  assert.ok(noPath.some((line) => line.includes('user_path')), noPath.join('\n'));
  assert.ok(at('COMPLETE').some((line) => line.includes('验收路径没写清环境')));
  assert.equal(at('COMPLETE').some((line) => line.includes('游戏试玩证据未闭环')), false);

  // A real acceptance path closes it.
  assert.deepEqual(at('ACCEPTANCE', {
    final_acceptance: {
      user_path: 'PCL 启动 1.20.1-Forge，jar 放进 .minecraft/mods，进世界看到新方块',
    },
  }), []);

  // Build stages are not gated on the acceptance path.
  assert.deepEqual(at('BUILD'), []);
});

await check('mergeState: design basis carries the named pitches', () => {
  const next = mergeState(null, {
    design_basis: {
      feeling: '唯美 → 低饱和远景 + 空气透视',
      pitches: [{ name: '退潮拾荒者', pitch: '捡拾 + 潮位变化' }],
    },
  });
  assert.equal(next.design_basis.pitches.length, 1);
  assert.equal(next.design_basis.pitches[0].name, '退潮拾荒者');
  // The field keys are the identity, so a row without a name is dropped.
  const junk = mergeState(null, { design_basis: { pitches: [{ pitch: 'no name' }] } });
  assert.deepEqual(junk.design_basis.pitches, []);
  assert.equal(junk.design_basis.feeling, null, 'an untouched field keeps its seeded value');
});

await check('toView: the named pitches reach the Client wire view', () => {
  const view = toView(mergeState(null, {
    design_basis: { pitches: [{ name: '甲', pitch: '乙' }] },
  }));
  assert.equal(view.basis.pitches.length, 1);
  assert.equal(view.basis.pitches[0].name, '甲');
});

await check('art: mergeState keeps direction scalars, replaces lists, and survives numeric rounds', () => {
  const first = mergeState(null, {
    art: {
      references: [{ name: 'Inside', what_to_steal: '三层剪影' }],
      light: '光源右上，角色加边缘光',
      layers: 5,
    },
  });
  assert.equal(first.art.light, '光源右上，角色加边缘光');
  assert.equal(first.art.layers, 5);
  assert.equal(first.art.references.length, 1);

  const second = mergeState(first, { art: { texture: '噪点 + 颗粒' } });
  assert.equal(second.art.light, '光源右上，角色加边缘光', 'scalars merge by key');
  assert.equal(second.art.references.length, 1, 'untouched lists survive');

  const third = mergeState(second, { art: { references: [] } });
  assert.deepEqual(third.art.references, []);

  // A model writing round numbers as integers must not lose the row: the key field
  // is the whole point of the field, so it is normalized rather than dropped.
  const numeric = mergeState(null, {
    art: { view_rounds: [{ round: 1, gaps: '脏灰', changed: '加色相偏移' }] },
  });
  assert.equal(numeric.art.view_rounds.length, 1, 'a numeric round must not vanish');
  assert.equal(numeric.art.view_rounds[0].round, '1');

  const junk = mergeState(null, { art: { palette: [{ role: 'no hex' }] } });
  assert.deepEqual(junk.art.palette, []);
});

await check('localStamp: a local ISO stamp with offset, not a UTC or invented one', () => {
  const stamp = localStamp(new Date(2026, 9, 9, 20, 5, 11));
  assert.match(stamp, /^2026-10-09T20:05:11[+-]\d{2}:\d{2}$/, stamp);
  // The offset must describe this machine, so the model can compute a real delta.
  const offset = stamp.slice(-6);
  assert.match(offset, /^[+-](0\d|1[0-4]):[0-5]\d$/, offset);
  assert.equal(localStamp(new Date(2026, 0, 2, 3, 4, 5)).startsWith('2026-01-02T03:04:05'), true);
});

await check('mergeState: V2 design basis carries the feeling translation', () => {
  const next = mergeState(null, {
    design_basis: { feeling: '孤零零的、风很大的感觉 → 对标 Alto\'s Odyssey 的渐变天空 + 多层剪影' },
  });
  assert.match(next.design_basis.feeling, /风很大/);
});

await check('toView: V2 fields reach the Client wire view', () => {
  const view = toView(mergeState(null, {
    kickoff: { status: '已回答', path: 'p', blocking_count: '0' },
    reviewers: [{ officer: '初见官', status: '通过', isolation: '独立子代理' }],
    asset_policy: { image_api: '未接' },
    auto_advance_log: [{ item: '音频方案', default_used: 'ZzFX 合成' }],
    capabilities_note: '视觉：有',
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '自产', origin: '开源素材', art_weight: 'S' }],
    design_basis: { feeling: 'f' },
    pending_user_decisions: [{ question: 'q', status: '待回答', fallback: 'd' }],
  }));
  assert.equal(view.kickoff.blockingCount, '0');
  assert.equal(view.reviewers[0].isolation, '独立子代理');
  assert.equal(view.assets.imageApi, '未接');
  assert.equal(view.autoAdvanced[0].defaultUsed, 'ZzFX 合成');
  assert.equal(view.capabilities, '视觉：有');
  assert.equal(view.surfaces[0].artWeight, 'S');
  assert.equal(view.basis.feeling, 'f');
  assert.equal(view.pending[0].fallback, 'd');
});

// ------------------------------------------------------------- V6 hard gates
await check('hard gates: a run cannot record COMPLETE while a hard gate is open', () => {
  const building = mergeState(null, {
    current_stage: 'BUILD',
    surfaces: [{ area: '美术与视觉', level: '弱', form: '程序化渐变', source: '已授权自主', art_weight: 'S' }],
  });
  assert.equal(building.current_stage, 'BUILD');

  const refused = mergeState(building, { current_stage: 'COMPLETE' });
  assert.equal(refused.current_stage, 'BUILD', 'the stage stays where the work really is');
  assert.ok(Array.isArray(refused.completion_refused?.items), 'the refusal is recorded, not hidden');
  assert.match(refused.completion_refused.items[0], /美术没有参考图/);
  assert.equal(refused.completion_refused.attempted_stage, 'COMPLETE');
  assert.equal(toView(refused).hardGates > 0, true, 'the panel keeps saying why');

  // Writing "完成" into the acceptance status is the same claim in a smaller box.
  const viaStatus = mergeState(building, { final_acceptance: { status: '完成' } });
  assert.notEqual(viaStatus.final_acceptance.status, '完成', 'a status-only completion claim is refused too');

  // Waiting for the user must stay writable, or the run cannot even say that.
  const waiting = mergeState(building, { final_acceptance: { status: '待用户确认' } });
  assert.equal(waiting.final_acceptance.status, '待用户确认');
});

await check('hard gates: the same claim lands once the gate is really cleared', () => {
  const s = mergeState(null, {
    current_stage: 'VERIFY',
    surfaces: [{ area: '美术与视觉', level: '弱', form: 'f', source: '已授权自主', art_weight: 'A' }],
    art: {
      references: [
        { name: 'Inside 第 3 章', source: '截图', what_to_steal: '分层数量与色相推移' },
        { name: 'Alto’s Odyssey', source: '截图', what_to_steal: '渐变天空 + 多层剪影' },
      ],
      palette: [
        { hex: '#2B3A55', role: '远景山体' }, { hex: '#8A5A44', role: '近景' },
        { hex: '#F2C57C', role: '受光面' }, { hex: '#1B1B1F', role: '剪影' },
      ],
      view_rounds: [
        { round: '1', looked_at: 'r1.png', gaps: '第 2 层与第 3 层色相太近', changed: '远景降饱和' },
        { round: '2', looked_at: 'r2.png', gaps: '角色夜里读不出轮廓', changed: '加边缘光' },
        { round: '3', looked_at: 'r3.png', gaps: 'UI 对比度不够', changed: '抬高字号层级' },
      ],
    },
  });
  assert.deepEqual(hardDefects(s), [], 'no hard gate once references / palette / rounds are real');
  const done = mergeState(s, { current_stage: 'COMPLETE' });
  assert.equal(done.current_stage, 'COMPLETE');
  assert.equal(done.completion_refused, undefined);
  assert.equal(toView(done).hardGates, 0);
});

// The gates match on the sentences defectReport() already emits. This is what
// stops a reworded message from silently switching a gate off — the exact class
// of failure the whole layer exists to prevent.
await check('game hard gates: real play and visual evidence block completion until complete', () => {
  const base = {
    project_goal: '做一个游戏：潮汐拾荒者',
    current_stage: 'BUILD',
    platform: { choice: 'Godot 4.7', kind: '游戏引擎' },
  };
  const blank = mergeState(null, base);
  assert.equal(hardDefects(blank).length, 0, 'game evidence and approval are not required before acceptance');
  const attempted = mergeState(blank, { current_stage: 'COMPLETE' });
  assert.equal(attempted.current_stage, 'BUILD', 'a missing game review blocks the completion attempt');
  assert.ok(attempted.completion_refused.items.some((line) => line.includes('游戏试玩证据未闭环')));
  assert.ok(attempted.completion_refused.items.some((line) => line.includes('游戏视觉/UI 证据未闭环')));
  assert.equal(attempted.completion_refused.items.filter((line) => line.includes('试玩证据未闭环')).length, 1);
  assert.equal(attempted.completion_refused.items.filter((line) => line.includes('视觉/UI 证据未闭环')).length, 1);
  assert.equal(hardDefects(attempted).length, 0, 'stage reverts to BUILD, so refusal evidence is read from completion_refused');

  const evidence = {
    gameplay_review: {
      playtest_path: '实际启动 game.exe；WASD 移动并按 E 搜集，记录 test/play-session.md',
      loop_observation: '三轮 8/11/9 秒；观察每轮选择、拾取反馈与潮位变化',
      branch_evidence: '选择浅滩路线先得材料但少时间；深水路线相反，见 test/route-a.png 与 route-b.png',
      retry_observation: '失误后点击重试，5 秒内回到关卡；没有载入旧状态',
      replay_hook: '第二轮解锁潮汐预报后想再尝试无损路线，记录于 play-session.md',
    },
    visual_review: {
      runtime_screenshot: 'artifacts/game-real-run-v2.png',
      hierarchy_review: '首屏目标与 E 交互提示可读，潮位 HUD 不遮角色',
      visual_rounds: '2 轮；首轮 HUD 遮挡目标，调整后按相同路线复拍',
      ui_findings: 'HUD 从左下移至右上并提高提示对比度',
      retest_result: '同一 game.exe 路径复测，目标可见且提示不遮挡拾取区',
    },
  };
  const complete = mergeState(blank, {
    ...evidence,
    game_approval: {
      status: '用户明确同意施工',
      proposal_id: 'P1',
      proposal_name: '潮汐拾荒者',
      user_evidence: '我选这个方案，就按这个方案开工',
    },
    current_stage: 'COMPLETE',
  });
  assert.equal(complete.current_stage, 'COMPLETE', 'complete concrete evidence closes both game gates');
  assert.deepEqual(hardDefects(complete), []);
  assert.equal(toView(complete).gameplayReview.replay_hook, evidence.gameplay_review.replay_hook);
  assert.equal(toView(complete).visualReview.runtime_screenshot, evidence.visual_review.runtime_screenshot);
});

await check('game hard gates: unrelated CLI projects remain unaffected', () => {
  const cli = mergeState(null, {
    project_goal: '本地文件批量整理 CLI',
    current_stage: 'COMPLETE',
  });
  assert.equal(cli.current_stage, 'COMPLETE');
  assert.deepEqual(hardDefects(cli), []);
});

await check('hard gates: every signature actually fires', () => {
  const fixtures = [
    [{ current_stage: 'BUILD', surfaces: [{ area: '美术与视觉', art_weight: 'S', source: '已授权自主' }] },
      '美术没有参考图'],
    [{ current_stage: 'BUILD', platform: { kind: '无框架自研', choice: '自研' } },
      '没有列出考虑过并否掉的平台'],
    [{ reviewers: [{ officer: '初见官', status: '通过', isolation: '同会话' }] }, '审阅不可信'],
    [{ surfaces: [{ area: '美术与视觉', licence: 'CC-BY-SA' }] }, '许可红线'],
    [{
      current_stage: 'BUILD',
      platform: { kind: '宿主游戏 mod', choice: 'Minecraft mod', host_game: 'MC', host_version: '最新版', host_loader: 'Forge' },
    }, 'host_version 不是一个具体版本'],
  ];
  for (const [patch, needle] of fixtures) {
    const lines = hardDefects(mergeState(null, patch));
    assert.ok(
      lines.some((line) => line.includes(needle)),
      `hard gate for "${needle}" did not fire — lines were: ${lines.join(' | ') || '(none)'}`,
    );
  }
});

rmSync(cwd, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exitCode = 1;
