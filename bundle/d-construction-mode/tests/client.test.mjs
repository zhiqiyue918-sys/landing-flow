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
  gameApproval: { status: '用户明确同意施工', proposal_name: '潮汐拾荒者', user_evidence: '我选这个方案，就按这个方案开工' },
  gameplayReview: { playtest_path: '真实玩家路径', replay_hook: '第二次有新选择' },
  visualReview: { runtime_screenshot: 'artifacts/game.png', retest_result: '同入口复测通过' },
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
      feeling: '唯美 → 低饱和远景 + 空气透视，参考 Alto 的分层剪影',
      pitches: [
        { name: '退潮后的滩涂拾荒者', pitch: '等潮水退去后捡拾；常驻潮位与天色' },
        { name: '候鸟迁徙的领航员', pitch: '按气流调整航向；常驻风向与鸟群' },
      ],
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
      consent: { status: '未确认', basis: null },
    },
    acceptance: { status: '待用户确认', userPath: '双击 index.html', evidence: ['tests 10/10'], userOnly: ['你按下去是否觉得爽'] },
  };
  const tree = View({ useProjection: () => view, t });
  const texts = collect(tree).join(' | ');
  assert.match(texts, /section\.basis/, 'the zero-to-one design basis is visible');
  assert.match(texts, /basis\.time/);
  assert.match(texts, /读系统日期做离线结算/);
  // V5: the feeling translation and the named pitches are the two things the
  // questionnaire failure dropped, so both must be visible, not just stored.
  assert.match(texts, /basis\.feeling/, 'the feeling→picture translation is visible');
  assert.match(texts, /唯美 → 低饱和远景/);
  assert.match(texts, /section\.pitches/, 'the named pitches are visible');
  assert.match(texts, /退潮后的滩涂拾荒者/);
  assert.match(texts, /候鸟迁徙的领航员/);
  assert.match(texts, /section\.experience/);
  assert.match(texts, /游戏方案批准状态/);
  assert.match(texts, /潮汐拾荒者/);
  assert.match(texts, /游戏核心循环试玩证据/);
  assert.match(texts, /第二次有新选择/);
  assert.match(texts, /游戏视觉与 UI 实机复测/);
  assert.match(texts, /artifacts\/game\.png/);
  assert.match(texts, /exp\.first10/);
  assert.match(texts, /按 ←\/→ 移动/);
  assert.match(texts, /section\.benchmarks/);
  assert.match(texts, /某成熟增量游戏/);
  assert.match(texts, /section\.gaps/);
  assert.match(texts, /美术\[弱\]/, 'the surface list shows level');
  assert.match(texts, /已授权自主/, 'and where the board came from');
  assert.match(texts, /纯几何 \+ 程序化配色/);
  assert.match(texts, /intake\.granted/, 'the one-shot intake state is visible');
  assert.match(texts, /consent\.locked/, 'the construction lock is visible while consent is open');
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

await check('pipeline: a host-game mod shows its host, version and loader (V5)', () => {
  // The triple a mod's loadability rests on has to be on the panel, not just in
  // state: "which version is this for" is the first thing a user asks.
  const asMod = (platform) => {
    useStatePlan = [true];
    useStateCalls = 0;
    const tree = View({
      useProjection: () => ({ ...sampleView, platform: { ...sampleView.platform, ...platform } }),
      t,
    });
    const texts = collect(tree).join(' | ');
    // Read the red flag, not the prose: the row claims whether it is sourced.
    const flagged = [];
    const walk = (node) => {
      if (node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const child of node) walk(child); return; }
      if (!node.props) return;
      if (typeof node.type === 'function') { walk(node.type(node.props)); return; }
      if (node.props['data-unsourced'] === 'true') flagged.push(collect(node.props.children).join(''));
      walk(node.props.children);
    };
    walk(tree);
    return { texts, flagged };
  };

  const good = asMod({
    kind: '宿主游戏 mod',
    hostGame: 'Minecraft Java 版', hostVersion: '1.20.1', hostLoader: 'Forge 47.2.0',
  });
  assert.match(good.texts, /platform\.host/);
  assert.match(good.texts, /Minecraft Java 版 \+ 1\.20\.1 \+ Forge 47\.2\.0/);
  assert.ok(!good.flagged.some((line) => line.includes('platform.host')),
    `a fully specified host must not be flagged: ${good.flagged.join(' / ')}`);

  const bad = asMod({ kind: '宿主游戏 mod', hostGame: 'Minecraft Java 版' });
  assert.match(bad.texts, /platform\.hostMissing/);
  assert.ok(bad.flagged.some((line) => line.includes('platform.host')),
    `a half-specified host must be flagged: ${bad.flagged.join(' / ')}`);

  // A non-mod platform never shows the row at all.
  const plain = asMod({ kind: '游戏引擎', hostGame: null, hostVersion: null, hostLoader: null });
  assert.ok(!plain.texts.includes('platform.host'), 'no host row for a plain engine');
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

// ------------------------------------------------------------------- V2 panel
/** Every node carrying `data-unsourced="true"`, flattened to its text. */
const flagged = (node, out = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const child of node) flagged(child, out); return out; }
  if (!node.props) return out;
  if (typeof node.type === 'function') { flagged(node.type(node.props), out); return out; }
  if (node.props['data-unsourced'] === 'true') out.push(collect(node.props.children).join(''));
  flagged(node.props.children, out);
  return out;
};

const v2View = {
  ...sampleView,
  surfaces: [
    { area: '美术与视觉', level: '弱', form: '成套 CC0 像素包', source: '用户提供', material: 'Kenney 1-Bit Pack', origin: '开源素材', licence: 'CC0', artWeight: 'S' },
    { area: '音频', level: '一般', form: 'ZzFX 合成', source: '自产', origin: '程序化', licence: 'MIT', artWeight: 'B' },
  ],
  assets: { imageApi: '未接', budgetNote: '单次 ≤ ¥20', licenceNote: '仅 CC0/MIT' },
  platform: {
    choice: '浏览器原生 Canvas 2D + Web Audio',
    kind: '无框架自研',
    licence: '自有',
    cost: '¥0',
    exportTargets: '单文件 HTML，file:// 双击即玩',
    note: '自研：物理/渲染/音频/输入/存档',
    alternatives: [
      { name: 'Godot 4.4', whyNot: 'web 导出为 wasm+pck 多文件，file:// 下受限' },
      { name: 'Phaser 3', whyNot: '会引入外部依赖，与零依赖单文件要求冲突' },
    ],
  },
  kickoff: { status: '已回答', path: 'docs/开工文档.md', questionCount: '12', blockingCount: '0' },
  reviewers: [
    { officer: '初见官', status: '通过', isolation: '独立子代理', verdict: '通过；第一次想放弃：第 41 秒' },
    { officer: '对抗官', status: '不通过', isolation: '独立子代理', overturned: '推翻 留存官 第 3 条' },
  ],
  autoAdvanced: [{ item: '音频方案', defaultUsed: 'ZzFX 合成', reason: '标黄项等待超 40 分钟无回应' }],
  // V4: a real art direction — references it extracts from, a palette that actually
  // shifts hue for depth (not just value), and a counted loop that changed things.
  art: {
    layers: 5,
    light: '光源右上；角色加边缘光，山体受光面偏暖',
    texture: '噪点 + 颗粒叠加，天空加径向渐变',
    ui: '思源黑体子集；标题 42px / 正文 16px；文字加半透明底板保证对比度',
    references: [
      { name: 'Inside 第 3 章', source: 'https://example.com/inside', whatToSteal: '三层剪影，最远层最暗最冷；雾把层与层隔开' },
      { name: '用户给的图', source: '用户提供', whatToSteal: '暖色阳光从右侧进入，受光面偏橙' },
    ],
    palette: [
      { hex: '#2B3A55', role: '远景山体' },
      { hex: '#3D5A80', role: '中景山体' },
      { hex: '#EE6C4D', role: '近景受光面' },
      { hex: '#F4A261', role: '阳光与角色高光' },
    ],
    viewRounds: [
      { round: '1', lookedAt: 'tests/evidence/level1.png', gaps: '各层只有明度差，一片脏灰', changed: '按色板加色相偏移：远景偏冷、近景偏暖' },
      { round: '2', lookedAt: 'tests/evidence/level1.png', gaps: '山体是纯平涂，没有材质', changed: '加噪点与颗粒叠加' },
      { round: '3', lookedAt: 'tests/evidence/level3.png', gaps: '夜里角色读不出轮廓', changed: '角色加边缘光' },
    ],
  },
  capabilities: '视觉（能不能自己看画面）：有',
  capabilityDetail: { visual: { available: true, tools: ['vision_describe'] } },
};

await check('V2 panel: renders kickoff, assets, reviewers, auto-advance and capabilities', () => {
  useStatePlan = [true];
  useStateCalls = 0;
  const tree = View({ useProjection: () => v2View, t });
  const texts = collect(tree).join(' | ');
  assert.match(texts, /section\.kickoff/);
  assert.match(texts, /docs\/开工文档\.md/);
  assert.match(texts, /kickoff\.questions 12/);
  assert.match(texts, /section\.assets/);
  assert.match(texts, /assets\.budget/);
  // The platform decision and, crucially, what it rejected are on the wire.
  assert.match(texts, /section\.platform/);
  assert.match(texts, /浏览器原生 Canvas 2D \+ Web Audio/);
  assert.match(texts, /✗ Godot 4\.4/);
  assert.match(texts, /✗ Phaser 3/);
  assert.match(texts, /wasm\+pck 多文件/);
  assert.match(texts, /platform\.export 单文件 HTML/);
  // V4: the art direction and the loop that produced it.
  assert.match(texts, /section\.art/);
  assert.match(texts, /art\.refs 2/);
  assert.match(texts, /art\.palette 4/);
  assert.match(texts, /art\.rounds 3/);
  assert.match(texts, /◇ Inside 第 3 章/);
  assert.match(texts, /最远层最暗最冷/);
  assert.match(texts, /#2B3A55/);
  assert.match(texts, /远景山体/);
  assert.match(texts, /角色加边缘光/);
  assert.match(texts, /section\.reviewers/);
  assert.match(texts, /初见官/);
  assert.match(texts, /推翻 留存官 第 3 条/);
  assert.match(texts, /section\.autoAdvanced/);
  assert.match(texts, /标黄项等待超 40 分钟无回应/);
  assert.match(texts, /section\.capabilities/);
  // The surfaces row now carries the V2 material/origin/licence/weight line.
  assert.match(texts, /开源素材 \/ CC0 \/ 权重S/);
  assert.match(texts, /Kenney 1-Bit Pack/);
  // Nothing is flagged when the state is clean.
  assert.deepEqual(flagged(tree), []);
});

await check('V2 panel: flags each rule violation the host would report', () => {
  const dirty = {
    ...v2View,
    kickoff: { ...v2View.kickoff, blockingCount: '2' },
    reviewers: [{ officer: '初见官', status: '通过', isolation: '同会话' }],
    capabilityDetail: { visual: { available: false, tools: [] } },
    // Self-building with nothing rejected is exactly the "一个人单打独斗" case.
    platform: { ...v2View.platform, alternatives: [] },
    // V4: art with no references and no loop is the "rendered once and called it done" case.
    art: { ...v2View.art, references: [], viewRounds: [] },
  };
  useStatePlan = [true];
  useStateCalls = 0;
  const tree = View({ useProjection: () => dirty, t });
  const texts = collect(tree).join(' | ');

  // The blindness chip rides in the collapsed bar, so it is visible without opening.
  assert.match(texts, /chip\.blind/);
  const marked = flagged(tree).join(' | ');
  assert.match(marked, /kickoff\.blocking 2/, 'a non-zero blocking count is loud');
  assert.match(marked, /初见官/, 'a rubber-stamp review is loud');
  assert.match(marked, /视觉（能不能自己看画面）：有/, 'the capability line is loud when blind');
  assert.match(marked, /浏览器原生 Canvas 2D \+ Web Audio/, 'self-building without rejected candidates is loud');
  assert.match(marked, /art\.refs 0/, 'art with no references is loud');
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
  assert.match(texts, /empty\.kickoff/);
  assert.match(texts, /empty\.reviewers/);
  assert.match(texts, /empty\.assets/);
  assert.match(texts, /empty\.art/);
  assert.match(texts, /empty\.capabilities/);
  assert.doesNotMatch(texts, /%/, 'no percentage is ever rendered');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exitCode = 1;
