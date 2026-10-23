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

import { apply, mergeState, toView } from '../index.js';

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
const registered = {};
const stubCtx = {
  systemPrompt: { section: (section) => { registered.section = section; return () => {}; } },
  sessionProjections: { register: (definition) => { registered.projection = definition; return () => {}; } },
  tools: { register: (tool) => { registered.tool = tool; return () => {}; } },
};

const inert = { calls: 0 };
apply({ systemPrompt: { section: () => { inert.calls += 1; } } }, { inert: true });
await check('apply({inert:true}) registers nothing (the top-level client-only row)', () => {
  assert.equal(inert.calls, 0, 'the inert row must not touch systemPrompt');
});

apply(stubCtx);

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
    gameplay_review: { playtest_path: '真实入口', loop_observation: '三轮循环' },
    visual_review: { runtime_screenshot: 'artifacts/runtime.png', retest_result: '同路径复测' },
    final_acceptance: { status: '待用户确认', user_only: ['你按下去是否觉得爽'] },
  });
  assert.match(s.experience_contract.first_10s, /拖尾/);
  assert.equal(s.benchmarks[0].source, 'https://example.com/review');
  assert.equal(s.surfaces[1].form, '纯几何 + 程序化配色');
  assert.equal(s.surfaces[1].source, '已授权自主');
  assert.equal(s.intake.autonomy, '已授权');
  assert.deepEqual(s.final_acceptance.user_only, ['你按下去是否觉得爽']);
  assert.equal(s.gameplay_review.playtest_path, '真实入口');
  assert.equal(s.visual_review.runtime_screenshot, 'artifacts/runtime.png');
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

// ---------------------------------------------------------------- d_state tool
await check('d_state: registers a well-formed JSON Schema tool definition', () => {
  const tool = registered.tool;
  assert.equal(tool.name, 'd_state');
  assert.equal(typeof tool.description, 'string');
  assert.equal(tool.parameters.type, 'object');
  assert.equal(tool.parameters.additionalProperties, false);
  const names = Object.keys(tool.parameters.properties);
  for (const field of ['project_goal', 'current_stage', 'pipeline', 'modules', 'plan', 'change_items',
    'verification', 'repair_history', 'technical_failures', 'resource_budget', 'design', 'intake',
    'experience_contract', 'benchmarks', 'surfaces', 'design_basis', 'gameplay_review', 'visual_review',
    'blockers', 'decisions', 'construction_brief', 'final_acceptance']) {
    assert.ok(names.includes(field), `missing parameter ${field}`);
  }
  assert.deepEqual(tool.parameters.properties.intake.properties.autonomy.enum, ['未授权', '已授权']);
  assert.ok(tool.parameters.properties.final_acceptance.properties.user_only, 'user-only acceptance items');
  assert.ok(tool.parameters.properties.experience_contract.properties.first_10s);
  assert.deepEqual(tool.parameters.properties.surfaces.items.properties.source.enum, ['对标', '自产', '用户提供', '已授权自主']);
  assert.deepEqual(tool.parameters.properties.surfaces.items.properties.level.enum, ['强', '一般', '弱', '无']);
  assert.ok(tool.parameters.properties.decisions.items.properties.date, '§24: decision date');
  assert.ok(tool.parameters.properties.change_items.items.properties.classification, '§60: change classification');
  assert.deepEqual(tool.parameters.properties.change_items.items.properties.classification.enum, ['沿用', '复查', '重做', '作废']);
  assert.deepEqual(tool.parameters.properties.design.properties.status.enum, ['未开始', '进行中', '已完成', '需返工']);
  assert.match(tool.description, /technical_failures/);
  assert.match(tool.description, /沿用 \/ 复查 \/ 重做 \/ 作废/);
  assert.deepEqual(tool.parameters.properties.current_stage.enum.slice(0, 3), ['RECEIVE', 'UNDERSTAND', 'DISCOVERY']);
  assert.ok(tool.parameters.properties.gameplay_review.properties.replay_hook);
  assert.ok(tool.parameters.properties.visual_review.properties.runtime_screenshot);
  assert.equal(tool.parameters.properties.modules.items.additionalProperties, false);
  assert.equal(typeof tool.output.render, 'function');
  assert.deepEqual(tool.output.schema.required, ['summary', 'state_path']);
  assert.deepEqual(tool.output.render({}, { summary: 's', state_path: '' }), [{ type: 'text', text: 's' }]);
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
  const mirrored = JSON.parse(readFileSync(join(cwd, '.d-construction', 'state.json'), 'utf8'));
  assert.equal(mirrored.current_stage, 'VERIFY');
  assert.equal(mirrored.modules.length, 2);
});

await check('d_state: execute requires an owning session', async () => {
  const built = stateToolWith({ sessionProjections: { stateOf: () => null } });
  await assert.rejects(() => built.execute({}, {}), /requires an owning agent session/);
});

// The tool builder is internal; reach it through a fresh apply() so the test
// does not depend on module-private exports.
function stateToolWith(ctx) {
  let captured;
  apply({
    systemPrompt: { section: () => () => {} },
    sessionProjections: {
      register: () => () => {},
      stateOf: ctx.sessionProjections.stateOf,
    },
    tools: { register: (tool) => { captured = tool; return () => {}; } },
  });
  return captured;
}

rmSync(cwd, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exitCode = 1;
