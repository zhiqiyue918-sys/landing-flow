/**
 * Client-half structural tests for @local/dsh-deep-construction.
 *
 * Runs with the bundled Node.js, no dependencies and no browser:
 *   node tests/client.test.mjs
 *
 * It loads `client.js` through a stubbed `window.__ModuleLoader__`, applies the
 * returned Cordis plugin object against a stubbed slot/locale context, and
 * renders the Pipeline View component with a stubbed projection hook — proving
 * the registration options, the value path (`useProjection('deepConstruction')`)
 * and the collapsed/expanded render trees without a page.
 */
import assert from 'node:assert/strict';

let passed = 0;
const failures = [];
function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${label}`);
  } catch (error) {
    failures.push({ label, error });
    console.log(`FAIL  ${label}\n      ${error.message}`);
  }
}

// ------------------------------------------------------------- module loading
let registration;
globalThis.window = { __ModuleLoader__: { load: (value) => { registration = value; } } };

/**
 * Minimal React shim: enough for createElement + useState. `useStatePlan` holds
 * the values the component's hooks receive, in call order, so a test can expand
 * the panel (first hook) without also turning the hint state non-empty.
 */
let useStatePlan = [];
let useStateCalls = 0;
const React = {
  createElement(type, props, ...children) {
    return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } };
  },
  useState(initial) {
    const index = useStateCalls;
    useStateCalls += 1;
    const value = index < useStatePlan.length
      ? useStatePlan[index]
      : (typeof initial === 'function' ? initial() : initial);
    return [value, () => {}];
  },
};
const requireStub = (spec) => {
  if (spec === 'react') return React;
  throw new Error(`unexpected require("${spec}")`);
};

await import('../client.js');

await check('client module registers itself under the package name', () => {
  assert.ok(registration, 'window.__ModuleLoader__.load was called');
  assert.equal(registration.id, '@local/dsh-deep-construction');
  assert.equal(typeof registration.factory, 'function');
});

const mod = registration.factory(requireStub);

await check('factory returns a Cordis plugin object with services injected', () => {
  assert.deepEqual(mod.inject, ['slots', 'locale']);
  assert.equal(typeof mod.apply, 'function');
});

// ---------------------------------------------------------------- registration
let entry;
const localeRegistrations = [];
const ctx = {
  effect: (fn) => {
    const disposer = fn();
    return typeof disposer === 'function' ? disposer : () => {};
  },
  locale: { register: (ns, dicts) => { localeRegistrations.push({ ns, dicts }); return () => {}; } },
  slots: {
    inject: (key, callback) => {
      assert.equal(key, 'conversation.input.dock');
      callback();
      return () => {};
    },
    register: (options, Component) => { entry = { options, Component }; return () => {}; },
  },
};

mod.apply(ctx);

await check('apply: registers dictionaries and the composer-dock entry', () => {
  assert.equal(localeRegistrations.length, 1);
  assert.equal(localeRegistrations[0].ns, 'deepConstruction');
  assert.ok(localeRegistrations[0].dicts.zh['bar.title']);
  assert.ok(localeRegistrations[0].dicts.en['bar.title']);
  assert.equal(entry.options.name, 'conversation.input.dock');
  assert.equal(entry.options.id, 'deep-construction');
  assert.equal(entry.options.order, 20, 'renders after todo (0) and goal (10)');
  assert.equal(entry.options.locale, 'deepConstruction');
});

// -------------------------------------------------------------------- rendering
const View = entry.Component;
const t = (key) => key;
const collect = (node, out = []) => {
  if (node === null || node === undefined || node === false || node === true) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const child of node) collect(child, out); return out; }
  if (typeof node === 'object' && node.props) {
    if (node.type === 'style') return out;
    // The shim has no reconciler: expand function components by calling them.
    if (typeof node.type === 'function') { collect(node.type(node.props), out); return out; }
    collect(node.props.children, out);
    if (node.props.title) out.push(String(node.props.title));
    if (node.props['aria-label']) out.push(String(node.props['aria-label']));
  }
  return out;
};

/** Every `<button>` in the tree, with its label text and click handler. */
const buttons = (node, out = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const child of node) buttons(child, out); return out; }
  if (!node.props) return out;
  if (typeof node.type === 'function') { buttons(node.type(node.props), out); return out; }
  if (node.type === 'button') {
    out.push({ label: collect(node.props.children).join(''), onClick: node.props.onClick });
  }
  buttons(node.props.children, out);
  return out;
};

const sampleView = {
  goal: '做一个小游戏',
  stage: 'BUILD',
  stageState: 'running',
  stageNote: '正在施工核心循环',
  progress: 'Y4｜核心循环可运行｜PROGRESS',
  pipeline: [
    { stage: '需求发现', status: '通过', summary: '已确认 6 项', active: false },
    { stage: '外部现实侦察', status: '通过', summary: '采用 Phaser', active: false },
    { stage: '模块施工', status: '进行中', summary: '核心循环', active: true },
  ],
  modules: [{ name: '核心循环', status: '进行中', note: '输入 + 碰撞' }],
  currentModule: '核心循环',
  plan: [{ step_id: 'Y4', title: '核心循环', status: '进行中' }, { step_id: 'Y5', title: '关卡', status: '未开始' }],
  currentStep: 'Y4',
  changes: [{ id: 'Y4-B1', kind: 'B', title: '补回暂停入口', classification: '复查' }],
  design: { status: '已完成', notes: '单文件结构' },
  gameplayReview: { playtest_path: '真实入口', replay_hook: '有明确重玩理由' },
  visualReview: { runtime_screenshot: 'artifacts/runtime.png', retest_result: '复测通过' },
  decisions: [{ decision_id: 'D-001', choice: 'Phaser', reason: '2D 成熟底座', date: '2026-10-07' }],
  verification: [{ what: '关卡可玩', result: '1/1 pass' }],
  repair: [{ id: 'Y4-X1', what: '事件重复绑定', tests: '12 → 12', progress: 'INFO_GAIN' }],
  technicalFailures: [{ what: '网络波动', kind: '技术失败', recovered: '重试成功' }],
  resources: { time: null, cost: null, taskLimit: null },
  requirements: { unknown: ['验收标准'], assumptions: ['假设浏览器形态'], counts: { unknown: 1, assumptions: 1, delegated: 0, deferred: 1 } },
  artifacts: [{ path: 'game/index.html', note: '单文件游戏' }],
  acceptance: { status: '待验收', userPath: '双击 index.html', evidence: ['tests 10/10'] },
  blockers: [{ what: '缺少素材', need: '用户提供' }],
  pending: [{ question: '是否联网', status: '待回答' }],
  checkpoints: [{ id: 'C1', note: '骨架完成' }],
};

await check('collapsed bar: renders nothing without a projection value', () => {
  assert.equal(View({ useProjection: () => undefined, t }), null);
  assert.equal(View({ useProjection: () => null, t }), null);
});

await check('collapsed bar: reads deepConstruction and shows stage, modules and progress', () => {
  useStatePlan = [false];
  useStateCalls = 0;
  const tree = View({
    useProjection: (key) => { assert.equal(key, 'deepConstruction'); return sampleView; },
    t,
  });
  assert.equal(tree.props['data-deep-construction'], 'pipeline');
  const texts = collect(tree).join(' | ');
  assert.match(texts, /bar\.title/);
  assert.match(texts, /BUILD/);
  assert.match(texts, /chip\.modules 0\/1/, 'module counter counts only 已完成');
  assert.match(texts, /Y4｜核心循环可运行｜PROGRESS/);
  assert.match(texts, /bar\.expand/);
  assert.doesNotMatch(texts, /section\.stages/, 'the body is collapsed by default');
});

await check('expanded body: renders every section with real entries', () => {
  useStatePlan = [true];
  useStateCalls = 0;
  const tree = View({
    useProjection: (key) => { assert.equal(key, 'deepConstruction'); return sampleView; },
    t,
  });
  const texts = collect(tree).join(' | ');
  assert.match(texts, /section\.stages/);
  assert.match(texts, /需求发现/);
  assert.match(texts, /外部现实侦察/);
  assert.match(texts, /section\.modules/);
  assert.match(texts, /核心循环/);
  assert.match(texts, /section\.decisions/);
  assert.match(texts, /D-001/);
  assert.match(texts, /Phaser/);
  assert.match(texts, /section\.verification/);
  assert.match(texts, /1\/1 pass/);
  assert.match(texts, /section\.repair/);
  assert.match(texts, /INFO_GAIN/);
  assert.match(texts, /section\.blockers/);
  assert.match(texts, /是否联网/);
  assert.match(texts, /section\.checkpoints/);
  assert.match(texts, /C1/);
  assert.match(texts, /bar\.collapse/);
});

await check('expanded body: renders the experience contract, benchmarks, gaps, intake and user-only items', () => {
  useStatePlan = [true];
  useStateCalls = 0;
  const view = {
    ...sampleView,
    basis: {
      definition: '增量游戏＝最小操作换持续增长',
      motivation: '爽感来自增长曲线；取向：轻松纯爽',
      meaning: '第一次会话结束已解锁第二层资源',
      structure: '内容侧＝关卡；交互侧＝单屏 + 收起式面板',
      time_logic: '读系统日期做离线结算',
    },
    experience: {
      first_10s: '按 ←/→ 移动，出现拖尾',
      first_60s: '吃到 3 个金币，数字跳动 + 音效',
      first_5min: '攒分 → 解锁道具',
      screen: '左上角分数常驻',
      feedback: '粒子 + 音 + 数字',
    },
    benchmarks: [{ work: '某成熟增量游戏', what: '正反馈叠加', source: 'example.com' }],
    surfaces: [
      { area: '玩法与操作', level: '一般', form: '左右移动 + 收集', source: '对标' },
      { area: '美术', level: '弱', form: '纯几何 + 程序化配色', source: '已授权自主' },
    ],
    requirements: {
      unknown: ['验收标准'], assumptions: ['假设浏览器形态'], counts: { unknown: 1, assumptions: 1, delegated: 0, deferred: 1 },
      intake: { status: '已回答', autonomy: '已授权' },
    },
    acceptance: { status: '待用户确认', userPath: '双击 index.html', evidence: ['tests 10/10'], userOnly: ['你按下去是否觉得爽'] },
  };
  const tree = View({ useProjection: () => view, t });
  const texts = collect(tree).join(' | ');
  assert.match(texts, /section\.basis/, 'the zero-to-one design basis is visible');
  assert.match(texts, /basis\.time/);
  assert.match(texts, /读系统日期做离线结算/);
  assert.match(texts, /section\.experience/);
  assert.match(texts, /exp\.first10/);
  assert.match(texts, /按 ←\/→ 移动/);
  assert.match(texts, /游戏核心循环试玩证据/);
  assert.match(texts, /有明确重玩理由/);
  assert.match(texts, /游戏视觉与 UI 审查/);
  assert.match(texts, /artifacts\/runtime\.png/);
  assert.match(texts, /section\.benchmarks/);
  assert.match(texts, /某成熟增量游戏/);
  assert.match(texts, /section\.gaps/);
  assert.match(texts, /美术\[弱\]/, 'the surface list shows level');
  assert.match(texts, /已授权自主/, 'and where the board came from');
  assert.match(texts, /纯几何 \+ 程序化配色/);
  assert.match(texts, /intake\.granted/, 'the one-shot intake state is visible');
  assert.match(texts, /acceptance\.userOnly/);
  assert.match(texts, /你按下去是否觉得爽/);
});

await check('expanded body: renders plan, changes, failures, artifacts, gaps and acceptance (§57/§66)', () => {
  useStatePlan = [true];
  useStateCalls = 0;
  const tree = View({
    useProjection: () => sampleView,
    t,
  });
  const texts = collect(tree).join(' | ');
  assert.match(texts, /section\.plan/);
  assert.match(texts, /Y4/);
  assert.match(texts, /plan\.current/);
  assert.match(texts, /section\.changes/);
  assert.match(texts, /Y4-B1/);
  assert.match(texts, /复查/);
  assert.match(texts, /section\.failures/);
  assert.match(texts, /技术失败/);
  assert.match(texts, /section\.artifacts/);
  assert.match(texts, /game\/index\.html/);
  assert.match(texts, /section\.requirements/);
  assert.match(texts, /验收标准/);
  assert.match(texts, /section\.acceptance/);
  assert.match(texts, /双击 index\.html/);
  assert.match(texts, /2026-10-07/, 'the decision date (§24) reaches the panel');
});

await check('pipeline: the Active Stage row is marked, others are not (§55)', () => {
  useStatePlan = [true];
  useStateCalls = 0;
  const tree = View({ useProjection: () => sampleView, t });
  const marks = [];
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) walk(child); return; }
    if (!node.props) return;
    if (typeof node.type === 'function') { walk(node.type(node.props)); return; }
    if (node.props.className === 'dcStage') marks.push({ active: node.props['data-active'], text: collect(node.props.children).join('') });
    walk(node.props.children);
  };
  walk(tree);
  const active = marks.filter((row) => row.active === 'true');
  assert.equal(active.length, 1, 'exactly one Active Stage');
  assert.match(active[0].text, /模块施工/);
  assert.equal(marks.filter((row) => row.active === 'false').length, 2);
});

await check('intervention buttons prefill the composer and never send (§61)', () => {
  useStatePlan = [true];
  useStateCalls = 0;
  const drafted = [];
  const tree = View({
    useProjection: () => sampleView,
    inputActions: { setDraft: (text) => drafted.push(text) },
    t,
  });
  const found = buttons(tree).filter((button) => button.label.startsWith('action.'));
  assert.deepEqual(found.map((button) => button.label), ['action.confirm', 'action.pause', 'action.auditOnly', 'action.rollback']);
  for (const button of found) button.onClick();
  assert.equal(drafted.length, 4);
  assert.match(drafted[0], /确认 ConstructionBrief/);
  assert.match(drafted[1], /暂停/);
  assert.match(drafted[2], /只审计/);
  assert.match(drafted[3], /回滚到最近的 checkpoint/);
});

await check('intervention buttons stay hidden when the composer is unreachable', () => {
  useStatePlan = [true];
  useStateCalls = 0;
  const tree = View({ useProjection: () => sampleView, t });
  assert.equal(buttons(tree).filter((button) => button.label.startsWith('action.')).length, 0);
});

await check('empty state: every section renders its empty label, no fake percentages', () => {
  useStatePlan = [true];
  useStateCalls = 0;
  const tree = View({
    useProjection: () => ({ goal: null, stage: null, stageState: 'idle', pipeline: [], modules: [], decisions: [], verification: [], repair: [], blockers: [], pending: [], checkpoints: [] }),
    t,
  });
  const texts = collect(tree).join(' | ');
  assert.match(texts, /empty\.stages/);
  assert.match(texts, /empty\.repair/);
  assert.match(texts, /empty\.changes/);
  assert.match(texts, /empty\.artifacts/);
  assert.match(texts, /empty\.acceptance/);
  assert.doesNotMatch(texts, /%/, 'no percentage is ever rendered');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exitCode = 1;
