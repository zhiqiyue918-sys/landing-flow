/**
 * @local/dsh-deep-construction — host half.
 *
 * Ships the always-on charter of the D｜深度施工模式 agent preset and the
 * structured construction state that drives its Pipeline View:
 *
 * - one `systemPrompt.section()` carrying `prompt/d-mode.md`;
 * - one model-facing `d_state` tool that merges a partial state patch into the
 *   session's construction state (best-effort mirrored to
 *   `<session cwd>/.d-construction/state.json`);
 * - one session projection (`deepConstruction`) that folds every committed
 *   `tool/call` for `d_state` out of the session log, so the state is durable,
 *   replay-safe and publishable to the Client through `wire.view`.
 *
 * The projection never appends a new session event type: `tool/call` is a known
 * event, so logs written by this plugin reopen normally.
 *
 * @module @local/dsh-deep-construction
 */
import { readFileSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'deep-construction';

/** Services this plugin consumes; it provides none, so no isolate realm is needed. */
export const inject = ['systemPrompt', 'tools', 'sessionProjections', 'subagents'];

/** Session-projection key published to the Client as the Pipeline View value. */
const PROJECTION_KEY = 'deepConstruction';

/** Model-facing tool name whose calls are folded into the projection. */
const TOOL_NAME = 'd_state';

/** Prompt section name and order (after the deployment persona prefix). */
const SECTION_NAME = 'deep-construction';
const SECTION_ORDER = 100;

/** Where the project-level mirror of the session state is written. */
const MIRROR_DIR = '.d-construction';
const MIRROR_FILE = 'state.json';

/** The D-mode state machine, in main-chain order. */
const STAGES = [
  'RECEIVE', 'UNDERSTAND', 'DISCOVERY', 'RESEARCH', 'BRIEFING', 'WAITING_USER_DECISION',
  'DESIGN', 'PLAN', 'EXPERIMENT', 'BUILD', 'VERIFY', 'AUDIT', 'REPAIR',
  'ROOT_CAUSE_REPLAN', 'ROLLBACK', 'BLOCKED', 'ACCEPTANCE', 'COMPLETE',
];

/** Stage statuses accepted on `pipeline` rows and on module rows. */
const STATUSES = ['未开始', '进行中', '等待用户', '通过', '需修复', '阻塞', '作废'];
const MODULE_STATUSES = ['未开始', '进行中', '已完成', '阻塞', '等待用户'];
const DECISION_STATUSES = ['ACTIVE', 'SUPERSEDED', 'EXPERIMENTAL'];
const PROGRESS_SIGNALS = ['PROGRESS', 'INFO_GAIN', 'STALLED', 'REGRESSION', 'PASS'];
const CHANGE_KINDS = ['Y', 'X', 'Z', 'B', 'G', 'S'];
const PLAN_STATUSES = ['未开始', '进行中', '已完成', '阻塞', '作废', '延期'];
const PENDING_STATUSES = ['待回答', '已回答', '已确认'];
/** §60: how a user change re-classifies work that already exists. */
const CHANGE_CLASSES = ['沿用', '复查', '重做', '作废'];
const DESIGN_STATUSES = ['未开始', '进行中', '已完成', '需返工'];
const FAILURE_KINDS = ['技术失败', '业务失败'];
/** The one-shot intake: ask everything once, then run autonomously. */
const INTAKE_STATUSES = ['未开始', '已发出', '已回答'];
const AUTONOMY = ['未授权', '已授权'];
/** §交付面清单: every delivery board must be assigned, never silently empty. */
const SURFACE_LEVELS = ['强', '一般', '弱', '无'];
const SURFACE_SOURCES = ['对标', '自产', '用户提供', '已授权自主'];
/** §零到一前置设计包: the product thinking that must exist before any Brief. */
const DESIGN_BASIS_FIELDS = ['definition', 'motivation', 'meaning', 'structure', 'time_logic', 'feeling'];

/**
 * V2 capability self-check. The base model here is text-only, so "can I see"
 * is not a mood — it is a tool-set fact. `vision_*` is the dsh-vision-router
 * family (vision_html_screenshot / vision_pixel_diff / vision_describe / ...);
 * without it D literally cannot look at what it produced, and the previous
 * delivery shipped a placeholder art board because nothing ever checked.
 */
const VISION_TOOL_PREFIX = 'vision_';
const IMAGE_GEN_TOOL_PATTERN = /(^|_)(image_gen|generate_image|text_to_image|image_generation|imagen|dalle)(_|$)/i;
const IM_PUSH_TOOLS = ['dsh_im_return_file'];

/** Delivery areas whose result the agent cannot judge without seeing/hearing it. */
const VISUAL_SURFACE_KEYWORDS = ['美术', '视觉', '画面', '音频', '声音', '音效', 'UI', '界面', '动效', '动画'];

/** V2 §体验官: the six review officers, each with one non-overlapping slice. */
const REVIEW_OFFICERS = [
  '初见官', '核心循环官', '留存官', '学习官', '可用性官', '对抗官',
];
const REVIEW_STATUSES = ['未开始', '进行中', '通过', '不通过', '退回', '不适用'];
/** Whether an officer ran as an isolated subagent (the anti-rubber-stamp rule). */
const REVIEW_ISOLATION = ['独立子代理', '同会话', '未隔离'];

/**
 * V2 §素材策略: how much the product's look carries its value. S blocks until
 * the user answers; A may auto-advance on timeout; B never blocks.
 */
const ART_WEIGHTS = ['S', 'A', 'B'];
/** Where one delivery area's material actually comes from. */
const ASSET_ORIGINS = ['用户提供', '开源素材', '图像API', '程序化', '自制', '对标复刻', '待定'];
/**
 * Licence classes. The usable ones come first; the forbidden ones are listed
 * after them on purpose — a value the schema refuses to store is a violation the
 * host can never catch and report, so share-alike / non-commercial values must
 * be storable in order to be policed (see `defectReport`).
 */
const ASSET_LICENCES = [
  'CC0', 'MIT', 'ISC', 'OFL', '自有', '已购买', 'CC-BY',
  'CC-BY-SA', 'GPL', 'NC', 'ND', '需核实', '未核实',
];

/** V2 §不该有红色: yellow is the only legitimate level. Red is accepted so it can
 * be caught and reported as a mode defect, never so it can block the run. */
const DECISION_LEVELS = ['黄', '红'];
const KICKOFF_STATUSES = ['未开始', '已发出', '已回答', '已超时推进'];

/**
 * §不要一个人单打独斗: the carrying platform — a game engine, an app framework,
 * a native toolkit, the browser's own primitives, or self-built. **Every** product
 * has one (writing raw Canvas by hand is itself a platform choice), so the field is
 * universal rather than genre-specific: the host never has to guess whether this is
 * "a game". Self-building stays legal, but it must be an *answer* — with the
 * platforms that were considered and rejected on the record — instead of a default
 * nobody ever asked about.
 */
const PLATFORM_KINDS = ['游戏引擎', '应用框架', '浏览器原生', '原生平台', '宿主游戏 mod', '无框架自研', '其它'];
/** The kind that always owes an alternative list. */
const PLATFORM_SELF_BUILT = '无框架自研';
/**
 * V5 §宿主游戏 mod: a mod is not a standalone product, so "which engine" is the
 * wrong question — the carrying platform is *someone else's game*. That makes two
 * facts load-bearing that no other kind needs, and they are exactly the two that
 * decide whether the artifact can run at all:
 *
 *   - **host_version**: a Minecraft mod is pinned to one game version. 1.20.1 and
 *     1.21 do not share an API; the jar that loads on one will not load on the
 *     other. "支持多版本" is not a property you assert, it is a second build.
 *   - **host_loader**: Forge / NeoForge / Fabric / Quilt are separate ecosystems
 *     with separate APIs, and the loader choice is bound to the version choice.
 *
 * Recording these is the difference between "我做完了" and a jar nobody can load.
 * It is also the acceptance criterion: a mod is only "done" if a named
 * combination of versions can actually launch with it.
 */
const PLATFORM_HOST_MOD = '宿主游戏 mod';
/** Where a mod is aimed; asked of the user, never assumed (it is a spec question). */
const HOST_MOD_FIELDS = ['host_game', 'host_version', 'host_loader'];
/** Runtimes a mod is tested under; multiplayer is a separate axis, not a version. */
const HOST_MOD_RUNTIME = ['单机', '局域网', '联机专用服务器'];
/**
 * A platform decision is owed once design has started. Before that it is simply
 * not time yet; after that, a blank choice means the question was never asked.
 */
const PLATFORM_REQUIRED_STAGES = [
  'DESIGN', 'PLAN', 'EXPERIMENT', 'BUILD', 'VERIFY', 'AUDIT', 'REPAIR',
  'ROOT_CAUSE_REPLAN', 'ROLLBACK', 'ACCEPTANCE', 'COMPLETE', 'BLOCKED',
];

/**
 * §美术达标 (V4): the real-machine finding. A finished, working, well-verified
 * single-file game was delivered and the user's verdict was still "美术还是一般,
 * 比较粗糙". The host's own review then showed why: the art had been built against
 * *adjectives* ("剪影渐层", "要好看") instead of against references, so there was
 * nothing to hit and nothing to measure the result against.
 *
 * Three things are therefore owed once a delivery area carries real art weight:
 * references to build against, a palette that actually encodes depth (hue/saturation
 * shift — not value alone), and a *counted* view-compare loop. The last one is the
 * one that matters most: "rendered it once and called it fine" is exactly how the
 * crude result shipped.
 */
const ART_HEAVY_WEIGHTS = ['S', 'A'];
/**
 * §美术达标 timing (V5). These used to be one list, and that was the bug: the
 * whole art gate switched on at DESIGN, but *style direction* is decided during
 * DISCOVERY — it is what the kickoff question "which of these three looks?" is
 * answering. So the light came on after the room was already dark, and an agent
 * could send a dossier that asked about art while `surfaces` never carried the
 * answer at all.
 *
 * Split in two: the style question is owed as soon as the dossier goes out, the
 * build-art loop (references / palette / rounds) once design has started.
 */
const ART_STYLE_REQUIRED_STAGES = ['DISCOVERY', ...PLATFORM_REQUIRED_STAGES];
/** The build-art loop needs a build; before DESIGN it is simply not time yet. */
const ART_REQUIRED_STAGES = PLATFORM_REQUIRED_STAGES;
/** Below this the art was not built against anything. */
const ART_MIN_REFERENCES = 2;
/**
 * Rounds of render → look → compare against the references → change something.
 * One round is a screenshot; three is a loop. The end-to-end run that produced the
 * crude art did zero.
 */
const ART_MIN_VIEW_ROUNDS = 3;
/** Value-only ramps read as flat grey; a depth ramp needs at least this many hues. */
const ART_MIN_PALETTE = 4;

/**
 * §零到一前置设计包 (V5): the real-machine finding that prompted this check.
 *
 * A one-line greenfield request ("有没有挂机的唯美画风游戏…你多想几个") went
 * straight to a questionnaire: screen layout / scenery structure / art weight /
 * disaster intensity / save / sound / exclusions / acceptance — eight questions
 * lifted from the domain checklist, with no game ever named. The user had asked
 * for *several concrete games* and got market research plus a form. "唯美" came
 * back to him untranslated, because it was never turned into a palette, a
 * composition or a reference.
 *
 * The mode already said the right thing — discovery step 0 and prompt §1.6 both
 * require the zero-to-one design package *before* the questions, so the questions
 * grow out of "which game is this" instead of out of a template. What was missing
 * was any enforcement: `defectReport` policed seven other principles and never
 * looked at `design_basis`, so this violation passed silently. A rule that lives
 * only in prose gets diluted by context; this one now has a mechanical backstop.
 *
 * The judgement is granularity, not count: three pitches all called "a simulator"
 * are zero pitches. You must be able to read *which game* it is.
 */
/** Filled-and-named design packages owed before the kickoff dossier goes out. */
const DESIGN_BASIS_MIN_PITCHES = 2;
/** Statuses that mean the author has already put questions to the user. */
const KICKOFF_ASKED_STATUSES = ['已发出', '已回答', '已超时推进'];
/**
 * How far a recorded `asked_at` may drift from the host clock before it counts
 * as invented (V5 hole 1). Generous on purpose: a long turn, a paused session or
 * a slow autonomous round must not trip it. It only has to catch a stamp that was
 * *made up* — and the rule is meaningless if one can slip through, because the
 * 40-minute decision reads this value and nothing else.
 */
const ASKED_AT_TOLERANCE_MS = 6 * 60 * 60 * 1000;
/** The one licence rule that stops construction: share-alike / non-commercial. */
const LICENCE_STOP_PATTERN = /(SA|NC|ND|GPL|ShareAlike|非商用|禁止商用|需核实)/i;
/**
 * §施工锁: the user's authorization, recorded explicitly. The default is
 * "未确认", and the engine refuses construction tools until it flips — silence,
 * guessed impatience, autonomous rounds and a broken question channel are not
 * authorization, so none of them may be turned into one.
 */
const CONSENT_STATUSES = ['未确认', '已确认'];
const CONSENT_BASES = ['用户回答', '用户授权默认值', '用户原始需求已完整', '超时推进默认值'];
const GAME_APPROVAL_STATUSES = ['未展示', '待用户选择', '用户已选方案', '用户明确同意施工'];
const GAME_APPROVAL_REQUIRED_STAGES = ['ACCEPTANCE', 'COMPLETE'];
function isGameProject(state) {
  if (!state || state.platform?.kind === PLATFORM_HOST_MOD) return false;
  const textValue = [
    state.project_goal,
    state.construction_brief?.final_goal,
    state.construction_brief?.product_form,
    state.construction_brief?.core_experience,
  ].filter((value) => typeof value === 'string').join(' ');
  const platform = String(state.platform?.choice ?? '');
  return /游戏|小游戏|game|\bmod\b|模组|关卡|玩家|gameplay/i.test(textValue)
    || (state.platform?.kind === '游戏引擎' && /godot|unity|unreal|phaser|gamemaker|construct/i.test(platform));
}
/** Tools that can create or modify a deliverable; locked while consent is open. */
const CONSTRUCTION_TOOLS = new Set([
  'write', 'edit', 'pwsh', 'run_code', 'subagent', 'subagent_fork', 'workflow',
]);
/** The denial text the model sees instead of a silent build. */
const CONSENT_DENIED = [
  '【落地流 · 施工锁】施工调用被拦截：当前状态没有足够的用户授权证据。',
  '非游戏任务的解锁方式（必须真的发生，不能由你推断）：',
  '① 用户明确说按默认/由你决定；② 用户原始请求已包含完整设计和验收并明确要求实施；③ 非品味默认项按完整超时流程推进。仅回答需求问题不等于授权施工。',
  '游戏额外两步：先展示具体游戏方案，用户明确选中/认可其中一个；再取得“按这个方案开工”的明确表态。答平台、存档、时长、美术等问题不等于喜欢该游戏，也不等于同意开工。',
  '② 用户明确说过"按你的默认做 / 随便你 / 你决定" → basis: "用户授权默认值"；',
  '③ 用户最初的请求本身已包含完整设计与验收标准、且明确要求直接实施 → basis: "用户原始需求已完整"；',
  '④ 非游戏、非品味默认项：你已把开工文档发出、等满 40 分钟无回应、并按 fallback 推进 → basis: "超时推进默认值"。',
  '   ⚠️ 这一条宿主会核对证据：d_state.auto_advance_log 里必须真的有对应记录，否则照样拒绝。',
  '   "他大概不会回"不是证据；凭推测写这一条会被引擎挡回来。',
  '以下都**不是**授权：用户没回答但你没等满 40 分钟、没发出过开工文档、没写过 auto_advance_log、你推测"他不耐烦了 / 他想要个雏形"、自主续跑（goal round）到了下一轮、提问通道报"没有回答器"。',
  '正确动作：把待你决定的事写进 d_state.pending_user_decisions（每条带 fallback），用一次问全把问题问完，然后结束本轮等用户回答。研究和只读检查（read / glob / grep / web_search / web_fetch）不受此锁限制。',
].join('\n');

/** The narrower denial for an invented advance-on-timeout claim. */
const CONSENT_DENIED_TIMEOUT = [
  '【落地流 · 施工锁】你把 consent.basis 记成了「超时推进默认值」，但状态里没有任何自动推进记录——这条授权宿主会核对证据，凭推测写不算。',
  '要合法走这条路，必须同时发生：① 开工文档真的发出过（kickoff.path 指向一份实际文件）；② 黄色项等满 40 分钟无回应；③ 按 fallback 推进并把这件事写进 d_state.auto_advance_log。',
  '如果你还没等满或还没发出文档：结束本轮，等用户回答；期间可以做研究、只读检查和结构搭建。',
].join('\n');

/**
 * V6 §空状态不再放行. The guard used to return `undefined` when a session had no
 * state yet, which meant the very first `write` of a fresh D session ran before
 * anything had recorded whether the user had authorised it — a one-call hole in
 * a lock that otherwise holds. A session on this preset with no state has not
 * been given consent either; the honest answer is "record yourself first".
 * Bootstrapping is cheap and never blocked: `d_state` is not a construction tool.
 */
const CONSENT_DENIED_BOOTSTRAP = [
  '【落地流 · 施工锁】这个会话还没有任何落地流状态，施工动作先不放行——不是你不能做，而是「用户是否授权」还没被记录过。',
  '先调一次 d_state（它不属于施工动作，不受锁限制）：写入开局判定、当前阶段与 intake；用户已经明确授权时同时写 consent = { status: "已确认", basis: "<三条依据之一>" }。',
  '写完之后，write / edit / pwsh / run_code / subagent / workflow 才按正常依据放行。',
  '研究、只读检查（read / glob / grep / web_search / web_fetch）与提问始终不受影响。',
].join('\n');

/**
 * §55: the twelve canonical pipeline stages and the states that make each one
 * the Active Stage. Accepting both spellings keeps the active marker reliable
 * whether the model writes the display name or the state-machine value.
 */
const STAGE_ALIASES = new Map([
  ['需求输入', ['RECEIVE', 'UNDERSTAND']],
  ['需求发现', ['DISCOVERY']],
  ['外部现实侦察', ['RESEARCH']],
  ['ConstructionBrief', ['BRIEFING', 'WAITING_USER_DECISION']],
  ['技术方案', ['DESIGN']],
  ['总体架构', ['DESIGN']],
  ['施工计划', ['PLAN']],
  ['模块施工', ['BUILD', 'EXPERIMENT']],
  ['验证', ['VERIFY', 'AUDIT']],
  ['Repair / Replan', ['REPAIR', 'ROOT_CAUSE_REPLAN', 'ROLLBACK']],
  ['产品级验收', ['ACCEPTANCE']],
  ['最终交付', ['COMPLETE']],
]);

/** §55: the canonical stage list, used to seed a stage row the model omitted. */
const CANONICAL_STAGES = [...STAGE_ALIASES.keys()];

/** The empty construction state: one JSON value, safe to checkpoint. */
function emptyState() {
  return {
    project_goal: null,
    current_stage: null,
    stage_note: null,
    pipeline: [],
    known: [],
    unknown: [],
    assumptions: [],
    delegated: [],
    deferred: [],
    pending_user_decisions: [],
    intake: { status: null, autonomy: null, note: null },
    consent: { status: '未确认', basis: null, note: null },
    research: { status: null, sources_used: [], conclusion: null },
    decisions: [],
    construction_brief: {},
    experience_contract: { first_10s: null, first_60s: null, first_5min: null, screen: null, feedback: null },
    benchmarks: [],
    surfaces: [],
    design_basis: {
      definition: null, motivation: null, meaning: null, structure: null, time_logic: null,
      feeling: null,
      joy: null,
      choice_impact: null,
      return_reason: null,
      boredom_risk: null,
      // V5 §零到一前置设计包: the named pitches the questions grow out of.
      pitches: [],
    },
    // V2 §开工文档: the one-shot dossier that makes red items impossible.
    kickoff: {
      status: null, path: null, question_count: null, blocking_count: null, note: null,
    },
    // V2 §体验官: the pre-handover review panel. Only the user closes the loop.
    reviewers: [],
    // V2 §素材策略: image-API posture and the material plan per delivery area.
    asset_policy: { image_api: null, budget_note: null, licence_note: null },
    // V2.1 §不要一个人单打独斗: what carries the product, and what was rejected.
    platform: {
      choice: null, kind: null, alternatives: [], licence: null, cost: null,
      export_targets: null, note: null,
    },
    // V4 §美术达标: the direction (references + palette + light + texture) and the
    // counted loop that proves the result was actually looked at against it.
    art: {
      references: [], palette: [], layers: null, light: null, texture: null,
      ui: null, view_rounds: [], note: null,
    },
    game_approval: { status: '未展示', proposal_id: null, proposal_name: null, user_evidence: null },
    gameplay_review: Object.fromEntries(GAMEPLAY_REVIEW_FIELDS.map((field) => [field, null])),
    visual_review: Object.fromEntries(VISUAL_REVIEW_FIELDS.map((field) => [field, null])),
    // V2 §超时推进: every yellow item the clock decided on its own, in one place.
    auto_advance_log: [],
    // Host-probed, never model-authored: the tool set this session can really use.
    capabilities: null,
    capabilities_note: null,
    design: { status: null, notes: null },
    modules: [],
    current_module: null,
    plan: [],
    current_step: null,
    change_items: [],
    verification: [],
    repair_history: [],
    technical_failures: [],
    resource_budget: { time: null, cost: null, task_limit: null, note: null },
    progress_signal: null,
    checkpoints: [],
    blockers: [],
    artifacts: [],
    final_acceptance: { status: null, user_path: null, evidence: [], user_only: [] },
    note: null,
  };
}

/** A trimmed string, or undefined when the value carries no text. */
function text(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** A list of trimmed, non-empty strings. */
function textList(value) {
  if (!Array.isArray(value)) return undefined;
  const out = [];
  for (const entry of value) {
    const item = text(entry);
    if (item !== undefined) out.push(item);
  }
  return out;
}

/**
 * `recordList` keys must be non-empty strings, but a model writing "round 1" almost
 * always sends `round: 1` as a number — and a dropped row here would silently erase
 * exactly the evidence the art loop is built on. Normalize the key instead.
 */
function normalizeRoundKeys(value) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const round = entry.round;
    if (typeof round === 'number' && Number.isFinite(round)) {
      return { ...entry, round: String(round) };
    }
    return entry;
  });
}

/** A list of sanitized records built from `fields`, dropping rows without a key. */
function recordList(value, key, fields) {
  if (!Array.isArray(value)) return undefined;
  const out = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = {};
    for (const [field, allowed] of Object.entries(fields)) {
      const raw = entry[field];
      if (Array.isArray(allowed)) {
        const item = text(raw);
        // An empty allow-list means "any non-empty string"; otherwise the value
        // must be one of the declared enum members.
        if (item !== undefined && (allowed.length === 0 || allowed.includes(item))) row[field] = item;
        continue;
      }
      const item = text(raw);
      if (item !== undefined) row[field] = item;
    }
    const rowKey = row[key];
    if (rowKey === undefined) continue;
    out.push(row);
  }
  return out;
}

/** The ConstructionBrief: every field is optional and flat. */
const BRIEF_TEXT_FIELDS = [
  'final_goal', 'users', 'scenarios', 'product_form', 'core_experience', 'platform',
  'preferences', 'references', 'constraints', 'risks', 'acceptance', 'inputs',
];
const BRIEF_LIST_FIELDS = ['must_have', 'not_doing', 'delegated', 'deferred'];

/** The five action-level slots of the experience contract. */
const EXPERIENCE_FIELDS = ['first_10s', 'first_60s', 'first_5min', 'screen', 'feedback'];
const GAMEPLAY_REVIEW_FIELDS = ['playtest_path', 'loop_observation', 'branch_evidence', 'retry_observation', 'replay_hook'];
const VISUAL_REVIEW_FIELDS = ['runtime_screenshot', 'hierarchy_review', 'visual_rounds', 'ui_findings', 'retest_result'];

/**
 * Merge one model-authored patch into the current state.
 *
 * Scalars replace, objects merge key-by-key, arrays replace wholesale (the model
 * passes the complete list for a field it updates). Unknown fields are dropped,
 * so a malformed call can never corrupt the projection.
 *
 * @param current - the state before this patch, or null before the first call.
 * @param patch - the raw `d_state` arguments (object, or a JSON string).
 * @returns the merged state, or `current` when the patch changes nothing.
 */
export function mergeState(current, patch) {
  const raw = typeof patch === 'string' ? safeParse(patch) : patch;
  // An unusable patch must not fabricate state: the caller keeps its reference,
  // so the projection publishes nothing for a call it cannot read.
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return current === undefined ? null : current;
  }
  const base = current === null || current === undefined || typeof current !== 'object'
    ? emptyState()
    : current;

  const next = { ...base };

  const goal = text(raw.project_goal);
  if (goal !== undefined) next.project_goal = goal;
  const stage = text(raw.current_stage);
  if (stage !== undefined && STAGES.includes(stage)) next.current_stage = stage;
  const stageNote = text(raw.stage_note);
  if (stageNote !== undefined) next.stage_note = stageNote;
  const currentModule = text(raw.current_module);
  if (currentModule !== undefined) next.current_module = currentModule;
  const currentStep = text(raw.current_step);
  if (currentStep !== undefined) next.current_step = currentStep;
  const signal = text(raw.progress_signal);
  if (signal !== undefined) next.progress_signal = signal;
  const note = text(raw.note);
  if (note !== undefined) next.note = note;

  const pipeline = recordList(raw.pipeline, 'stage', {
    stage: [], status: STATUSES, summary: [],
  });
  if (pipeline !== undefined) next.pipeline = pipeline;

  for (const field of ['known', 'unknown', 'assumptions', 'delegated', 'deferred']) {
    const list = textList(raw[field]);
    if (list !== undefined) next[field] = list;
  }

  // The one-shot intake: everything user-owned is asked once, and the recorded
  // `autonomy` is what lets the run continue without per-round round-trips.
  if (raw.intake !== null && typeof raw.intake === 'object' && !Array.isArray(raw.intake)) {
    const intake = { ...(base.intake ?? {}) };
    const status = text(raw.intake.status);
    if (status !== undefined && INTAKE_STATUSES.includes(status)) intake.status = status;
    const autonomy = text(raw.intake.autonomy);
    if (autonomy !== undefined && AUTONOMY.includes(autonomy)) intake.autonomy = autonomy;
    const intakeNote = text(raw.intake.note);
    if (intakeNote !== undefined) intake.note = intakeNote;
    next.intake = intake;
  }

  // The施工锁 switch. Only an explicit basis unlocks it; see CONSENT_DENIED.
  if (raw.consent !== null && typeof raw.consent === 'object' && !Array.isArray(raw.consent)) {
    const consent = { ...(base.consent ?? {}) };
    const status = text(raw.consent.status);
    if (status !== undefined && CONSENT_STATUSES.includes(status)) consent.status = status;
    const basis = text(raw.consent.basis);
    if (basis !== undefined && CONSENT_BASES.includes(basis)) consent.basis = basis;
    const consentNote = text(raw.consent.note);
    if (consentNote !== undefined) consent.note = consentNote;
    next.consent = consent;
  }

  // V2 §不该有红色: every open question must be yellow. A red (blocking) item is
  // a defect of the intake, not a fact of the project — the model records what it
  // failed to ask instead of parking the run on it. Yellow items carry their own
  // default so the clock can advance them without the user.
  const pending = recordList(raw.pending_user_decisions, 'question', {
    question: [], status: PENDING_STATUSES, level: DECISION_LEVELS, fallback: [],
    asked_at: [], timeout_min: [], auto_advanced: [], advanced_value: [],
  });
  if (pending !== undefined) next.pending_user_decisions = pending;

  if (raw.research !== null && typeof raw.research === 'object' && !Array.isArray(raw.research)) {
    const research = { ...(base.research ?? {}) };
    const status = text(raw.research.status);
    if (status !== undefined) research.status = status;
    const sources = textList(raw.research.sources_used);
    if (sources !== undefined) research.sources_used = sources;
    const conclusion = text(raw.research.conclusion);
    if (conclusion !== undefined) research.conclusion = conclusion;
    next.research = research;
  }

  const decisions = recordList(raw.decisions, 'decision_id', {
    decision_id: [], choice: [], purpose: [], reason: [], alternatives: [],
    rejected_reason: [], evidence: [], impact: [], status: DECISION_STATUSES, date: [],
  });
  if (decisions !== undefined) next.decisions = decisions;

  if (raw.construction_brief !== null && typeof raw.construction_brief === 'object'
    && !Array.isArray(raw.construction_brief)) {
    const brief = { ...(base.construction_brief ?? {}) };
    for (const field of BRIEF_TEXT_FIELDS) {
      const value = text(raw.construction_brief[field]);
      if (value !== undefined) brief[field] = value;
    }
    for (const field of BRIEF_LIST_FIELDS) {
      const value = textList(raw.construction_brief[field]);
      if (value !== undefined) brief[field] = value;
    }
    next.construction_brief = brief;
  }

  // Experience gate (§设计责任): the action-level script that must exist before
  // DESIGN/BUILD, plus the category benchmarks and the declared weak spots.
  if (raw.experience_contract !== null && typeof raw.experience_contract === 'object'
    && !Array.isArray(raw.experience_contract)) {
    const contract = { ...(base.experience_contract ?? {}) };
    for (const field of EXPERIENCE_FIELDS) {
      const value = text(raw.experience_contract[field]);
      if (value !== undefined) contract[field] = value;
    }
    next.experience_contract = contract;
  }

  const benchmarks = recordList(raw.benchmarks, 'work', {
    work: [], what: [], source: [],
  });
  if (benchmarks !== undefined) next.benchmarks = benchmarks;

  // V2 §素材策略: a delivery area is not "assigned" until its material has a
  // real origin. `form` alone was the old hole — "纯几何" could pass as a plan
  // while no pixel, sound or licence had been decided.
  const gaps = recordList(raw.surfaces, 'area', {
    area: [], level: SURFACE_LEVELS, form: [], source: SURFACE_SOURCES,
    material: [], origin: ASSET_ORIGINS, licence: ASSET_LICENCES, art_weight: ART_WEIGHTS,
  });
  if (gaps !== undefined) next.surfaces = gaps;

  // V2 §开工文档: the one-shot dossier produced before any construction.
  if (raw.kickoff !== null && typeof raw.kickoff === 'object' && !Array.isArray(raw.kickoff)) {
    const kickoff = { ...(base.kickoff ?? {}) };
    const status = text(raw.kickoff.status);
    if (status !== undefined && KICKOFF_STATUSES.includes(status)) kickoff.status = status;
    for (const field of ['path', 'question_count', 'blocking_count', 'note']) {
      const value = text(raw.kickoff[field]);
      if (value !== undefined) kickoff[field] = value;
    }
    next.kickoff = kickoff;
  }

  // V2 §体验官: the pre-handover review panel. An officer that did not run
  // isolated cannot count as evidence — that rule lives here, not in prose.
  const reviewers = recordList(raw.reviewers, 'officer', {
    officer: REVIEW_OFFICERS, status: REVIEW_STATUSES, isolation: REVIEW_ISOLATION,
    report: [], evidence: [], verdict: [], overturned: [], agent_id: [], date: [],
  });
  if (reviewers !== undefined) next.reviewers = reviewers;

  if (raw.asset_policy !== null && typeof raw.asset_policy === 'object'
    && !Array.isArray(raw.asset_policy)) {
    const policy = { ...(base.asset_policy ?? {}) };
    for (const field of ['image_api', 'budget_note', 'licence_note']) {
      const value = text(raw.asset_policy[field]);
      if (value !== undefined) policy[field] = value;
    }
    next.asset_policy = policy;
  }

  // V2.1 §不要一个人单打独斗: the carrying platform. Scalars merge by key;
  // `alternatives` replaces wholesale like every other array field.
  if (raw.platform !== null && typeof raw.platform === 'object'
    && !Array.isArray(raw.platform)) {
    const choice = { ...(base.platform ?? {}) };
    // V5: a host-game mod owes the host, its version and its loader — the three
    // facts that decide whether the jar loads anywhere at all.
    for (const field of [
      'choice', 'kind', 'licence', 'cost', 'export_targets', 'note',
      'host_game', 'host_version', 'host_loader',
    ]) {
      const value = text(raw.platform[field]);
      if (value !== undefined) choice[field] = value;
    }
    const alts = recordList(raw.platform.alternatives, 'name', { name: [], why_not: [] });
    if (alts !== undefined) choice.alternatives = alts;
    next.platform = choice;
  }

  if (raw.game_approval !== null && typeof raw.game_approval === 'object' && !Array.isArray(raw.game_approval)) {
    const approval = { ...(base.game_approval ?? {}) };
    const approvalStatus = text(raw.game_approval.status);
    if (approvalStatus !== undefined && GAME_APPROVAL_STATUSES.includes(approvalStatus)) approval.status = approvalStatus;
    for (const key of ['proposal_id', 'proposal_name', 'user_evidence']) {
      const value = text(raw.game_approval[key]);
      if (value !== undefined) approval[key] = value;
    }
    next.game_approval = approval;
  }
  for (const [field, fields] of [['gameplay_review', GAMEPLAY_REVIEW_FIELDS], ['visual_review', VISUAL_REVIEW_FIELDS]]) {
    if (raw[field] !== null && typeof raw[field] === 'object' && !Array.isArray(raw[field])) {
      const review = { ...(base[field] ?? {}) };
      for (const key of fields) {
        const value = text(raw[field][key]);
        if (value !== undefined) review[key] = value;
      }
      next[field] = review;
    }
  }

  // V4 §美术达标: the art direction and the counted view-compare loop. `references`,
  // `palette` and `view_rounds` are all whole-table replacements — a round is only
  // meaningful together with its `changed` field, so partial merging would let
  // "看了但没改" survive.
  if (raw.art !== null && typeof raw.art === 'object' && !Array.isArray(raw.art)) {
    const art = { ...(base.art ?? {}) };
    for (const field of ['light', 'texture', 'ui', 'note']) {
      const value = text(raw.art[field]);
      if (value !== undefined) art[field] = value;
    }
    if (raw.art.layers !== undefined) {
      const layers = Number(raw.art.layers);
      art.layers = Number.isFinite(layers) ? layers : null;
    }
    const refs = recordList(raw.art.references, 'name', { name: [], source: [], what_to_steal: [] });
    if (refs !== undefined) art.references = refs;
    const palette = recordList(raw.art.palette, 'hex', { hex: [], role: [] });
    if (palette !== undefined) art.palette = palette;
    const rounds = recordList(normalizeRoundKeys(raw.art.view_rounds), 'round', {
      round: [], looked_at: [], gaps: [], changed: [],
    });
    if (rounds !== undefined) art.view_rounds = rounds;
    next.art = art;
  }

  // V2 §超时推进: every decision the clock made on the user's behalf, in one
  // auditable list, so "它替我决定了什么" is answerable at a glance.
  const advanced = recordList(raw.auto_advance_log, 'item', {
    item: [], default_used: [], reason: [], at: [], notified_via: [],
  });
  if (advanced !== undefined) next.auto_advance_log = advanced;

  // V2 §能力自检: the host probes and returns this every call; the model copies
  // it back so the Pipeline View can show whether D has eyes at all.
  const capabilitiesNote = text(raw.capabilities_note);
  if (capabilitiesNote !== undefined) next.capabilities_note = capabilitiesNote;

  // Zero-to-one pre-design pack: definition, motivation, meaning, structure and
  // the time/state logic that must exist before a Brief can be confirmed.
  if (raw.design_basis !== null && typeof raw.design_basis === 'object'
    && !Array.isArray(raw.design_basis)) {
    const basis = { ...(base.design_basis ?? {}) };
    for (const field of DESIGN_BASIS_FIELDS) {
      const value = text(raw.design_basis[field]);
      if (value !== undefined) basis[field] = value;
    }
    // §零到一前置设计包 (V5): the named pitches the questions must grow out of.
    const pitches = recordList(raw.design_basis.pitches, 'name', { name: [], pitch: [] });
    if (pitches !== undefined) basis.pitches = pitches;
    next.design_basis = basis;
  }

  const modules = recordList(raw.modules, 'name', {
    name: [], status: MODULE_STATUSES, note: [],
  });
  if (modules !== undefined) next.modules = modules;

  const plan = recordList(raw.plan, 'step_id', {
    step_id: [], title: [], status: PLAN_STATUSES,
  });
  if (plan !== undefined) next.plan = plan;

  const changeItems = recordList(raw.change_items, 'id', {
    id: [], kind: CHANGE_KINDS, title: [], status: [], classification: CHANGE_CLASSES, note: [],
  });
  if (changeItems !== undefined) next.change_items = changeItems;

  const verification = recordList(raw.verification, 'what', {
    what: [], command: [], result: [], evidence: [],
  });
  if (verification !== undefined) next.verification = verification;

  const repair = recordList(raw.repair_history, 'id', {
    id: [], what: [], tests: [], progress: PROGRESS_SIGNALS, next: [],
  });
  if (repair !== undefined) next.repair_history = repair;

  // §49: technical failures (timeouts, network, tool crashes, environment) are
  // recorded apart from business failures so they never misjudge the direction.
  const failures = recordList(raw.technical_failures, 'what', {
    what: [], kind: FAILURE_KINDS, impact: [], recovered: [], evidence: [],
  });
  if (failures !== undefined) next.technical_failures = failures;

  // §50: resource stop-loss is independent of business repair rounds.
  if (raw.resource_budget !== null && typeof raw.resource_budget === 'object'
    && !Array.isArray(raw.resource_budget)) {
    const budget = { ...(base.resource_budget ?? {}) };
    for (const field of ['time', 'cost', 'task_limit', 'note']) {
      const value = text(raw.resource_budget[field]);
      if (value !== undefined) budget[field] = value;
    }
    next.resource_budget = budget;
  }

  // §66 `design_status`: the design stage's own state, beside DESIGN in the
  // state machine, so a long design phase stays visible.
  if (raw.design !== null && typeof raw.design === 'object' && !Array.isArray(raw.design)) {
    const design = { ...(base.design ?? {}) };
    const status = text(raw.design.status);
    if (status !== undefined && DESIGN_STATUSES.includes(status)) design.status = status;
    const notes = text(raw.design.notes);
    if (notes !== undefined) design.notes = notes;
    next.design = design;
  }

  const checkpoints = recordList(raw.checkpoints, 'id', { id: [], note: [], path: [] });
  if (checkpoints !== undefined) next.checkpoints = checkpoints;

  const blockers = recordList(raw.blockers, 'what', { what: [], why: [], need: [] });
  if (blockers !== undefined) next.blockers = blockers;

  const artifacts = recordList(raw.artifacts, 'path', { path: [], note: [] });
  if (artifacts !== undefined) next.artifacts = artifacts;

  if (raw.final_acceptance !== null && typeof raw.final_acceptance === 'object'
    && !Array.isArray(raw.final_acceptance)) {
    const acceptance = { ...(base.final_acceptance ?? {}) };
    const status = text(raw.final_acceptance.status);
    if (status !== undefined) acceptance.status = status;
    const userPath = text(raw.final_acceptance.user_path);
    if (userPath !== undefined) acceptance.user_path = userPath;
    const evidence = textList(raw.final_acceptance.evidence);
    if (evidence !== undefined) acceptance.evidence = evidence;
    // §验收两半：these items can only be closed by the user's own "yes".
    const userOnly = textList(raw.final_acceptance.user_only);
    if (userOnly !== undefined) acceptance.user_only = userOnly;
    next.final_acceptance = acceptance;
  }

  // ── V6 §完成不可谎报 (hard gates) ─────────────────────────────────────────
  // Checked against the state the caller is *asking for*: several gates only
  // exist at ACCEPTANCE / COMPLETE (art, mod acceptance path), so testing the
  // previous state would let the last step through. A refused attempt leaves the
  // previous stage in place and records why — silently reverting would look like
  // a saved completion, which is the worse failure.
  const requestingCompletion = COMPLETION_STAGES.includes(String(next.current_stage ?? ''))
    || COMPLETION_CLAIM.test(String(next.final_acceptance?.status ?? '').trim());
  const hard = hardDefects(next);
  if (requestingCompletion && hard.length > 0) {
    next.current_stage = base.current_stage ?? null;
    const acceptance = { ...(next.final_acceptance ?? {}) };
    if (COMPLETION_CLAIM.test(String(acceptance.status ?? '').trim())) {
      acceptance.status = base.final_acceptance?.status ?? '待验收';
    }
    next.final_acceptance = acceptance;
    next.completion_refused = {
      attempted_stage: String(raw.current_stage ?? ''),
      at: localStamp(),
      items: hard,
    };
  } else if (hard.length === 0 && next.completion_refused !== undefined) {
    // Clearing is deliberate: the record exists to be seen, not to be permanent.
    delete next.completion_refused;
  }

  return next;
}

/** Parse a JSON object defensively; returns null on anything unexpected. */
function safeParse(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** The chip state the Client renders for the current stage. */
function stageState(stage) {
  switch (stage) {
    case 'WAITING_USER_DECISION': return 'wait';
    case 'REPAIR':
    case 'ROOT_CAUSE_REPLAN':
    case 'ROLLBACK': return 'repair';
    case 'BLOCKED': return 'blocked';
    case 'COMPLETE': return 'done';
    case null:
    case undefined: return 'idle';
    default: return 'running';
  }
}

/** The last `count` entries of a list, newest last. */
function tail(list, count) {
  return Array.isArray(list) ? list.slice(Math.max(0, list.length - count)) : [];
}

/**
 * The Client-visible value of the projection: a compact, UI-shaped slice that
 * carries no hidden reasoning, only execution facts.
 *
 * @param state - the projection state, or null before the first `d_state` call.
 * @returns the wire view, or null so the Client renders nothing.
 */
/**
 * The session clock, handed to the model instead of asked of it.
 *
 * Real-machine finding (2026-10-09): the agent needed "now" to stamp
 * `pending_user_decisions[].asked_at`, reached for `pwsh Get-Date`, and was
 * correctly refused by the construction lock — so it invented a timestamp
 * (`2026-02-13T00:00:00+08:00`). A fabricated anchor silently breaks the whole
 * 40-minute auto-advance rule. The clock is data, not construction, so the host
 * supplies it on every call and the model never needs a shell for it.
 *
 * @returns a local ISO-8601 stamp with offset, e.g. `2026-10-09T20:05:11+08:00`.
 */
export function localStamp(date = new Date()) {
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Ground-truth capability probe. V2's whole point here is that "can I see" is a
 * tool-set fact, not a mood: the base model is text-only, and the previous
 * delivery shipped a placeholder art board because nothing ever checked.
 *
 * Host-run and never model-authored: pass the schemas this agent can really
 * call (`ctx.tools.schemas(agent)`) and read the answer.
 *
 * @param schemas - tool schemas visible to the owning agent, or anything shaped like them.
 * @returns a small, comparable capability record.
 */
export function probeCapabilities(schemas) {
  const names = (Array.isArray(schemas) ? schemas : [])
    .map((row) => (row !== null && typeof row === 'object' && typeof row.name === 'string' ? row.name : ''))
    .filter((entry) => entry.length > 0)
    .sort();
  const vision = names.filter((entry) => entry.startsWith(VISION_TOOL_PREFIX));
  const imageGen = names.filter((entry) => IMAGE_GEN_TOOL_PATTERN.test(entry));
  const im = names.filter((entry) => IM_PUSH_TOOLS.includes(entry));
  return {
    visual: { available: vision.length > 0, tools: vision },
    image_generation: { available: imageGen.length > 0, tools: imageGen },
    im_push: { available: im.length > 0, tools: im },
  };
}

/** The recorded delivery areas whose result the agent cannot judge while blind. */
export function visualSurfaces(state) {
  const rows = state !== null && typeof state === 'object' && Array.isArray(state.surfaces)
    ? state.surfaces
    : [];
  return rows.filter((row) => {
    const area = row !== null && typeof row === 'object' && typeof row.area === 'string' ? row.area : '';
    return VISUAL_SURFACE_KEYWORDS.some((word) => area.includes(word));
  });
}

/**
 * V2 §能力自检: the block the model must be told, and the warning that fires when
 * it is about to judge something it cannot see.
 *
 * @param capabilities - the probe result, or null when the probe could not run.
 * @param state - the merged construction state.
 * @returns `{ line, warning }` — `warning` is an empty string when nothing is wrong.
 */
export function capabilityReport(capabilities, state) {
  if (capabilities === null || capabilities === undefined) {
    return { line: '能力自检：无法探测（工具服务不可用）', warning: '' };
  }
  const visual = capabilities.visual ?? { available: false, tools: [] };
  const imageGen = capabilities.image_generation ?? { available: false, tools: [] };
  const im = capabilities.im_push ?? { available: false, tools: [] };
  const line = [
    `视觉（能不能自己看画面）：${visual.available ? `有（${visual.tools.join(' / ')}）` : '没有'}`,
    `图像生成：${imageGen.available ? `有（${imageGen.tools.join(' / ')}）` : '没有'}`,
    `IM 推送：${im.available ? '有' : '没有'}`,
  ].join('；');

  const blind = visual.available !== true;
  const areas = visualSurfaces(state).map((row) => row.area).filter((area) => typeof area === 'string');
  if (!blind || areas.length === 0) return { line, warning: '' };

  return {
    line,
    warning: [
      `⚠️ 能力自检告警：本会话没有视觉能力（未挂载 vision_* 工具，通常是输入框的「👁 识图」没开或客户端半边没加载），`,
      `但状态里已登记需要看的交付板块：${areas.join(' / ')}。`,
      '你没有眼睛，所以：不得声称看过任何画面；不得把这些板块标记为已验证或已完成；',
      '必须先向用户报告这个限制，并把「需要视觉能力」写进 blockers（need = 用户开启识图或恢复视觉插件）。',
    ].join(''),
  };
}


/**
 * V2 §自我纠错: the host polices the mode's own principles on every state write,
 * so a violation comes back to the model instead of being stored quietly.
 *
 * The first principle is the load-bearing one. A red (blocking) item means the
 * kickoff dossier did not ask everything up front — that is a defect of the
 * mode, not a fact of the project, and the fix is to go back and ask, never to
 * park the run on it. Accepting `红` as a legal value is what makes it visible:
 * erasing it at the merge would hide the evidence.
 *
 * @param state - the merged construction state.
 * @returns one self-contained sentence per violation, ready to hand to the model.
 */
export function defectReport(state) {
  if (state === null || typeof state !== 'object') return [];
  const out = [];

  const red = (state.pending_user_decisions ?? []).filter((row) => row?.level === '红');
  if (red.length > 0) {
    const names = red.map((row) => row.question).filter((name) => typeof name === 'string');
    out.push(
      `⛔ 模式缺陷：有 ${red.length} 条待决项被标成红色（${names.join(' / ')}）。`
      + '不该有红色项——需要阻塞才能问清，说明开工文档当初没问全。回头把同类问题一次问完，'
      + '并把它记进 blockers（what = 当初漏问的问题，need = 用户补答），不要停等。',
    );
  }

  const declared = Number.parseInt(String(state.kickoff?.blocking_count ?? ''), 10);
  if (Number.isFinite(declared) && declared > 0) {
    out.push(
      `⛔ 模式缺陷：kickoff.blocking_count = ${declared}，必须恒为 0。`
      + '开工文档的目的是把属于用户的未知项一次问全；出现阻塞项说明问得不够，补问，不要停等。',
    );
  }

  // §零到一前置设计包 (V5). The load-bearing rule, and the one the engine used
  // to police with nothing at all. A one-line greenfield request went straight to
  // eight template questions without a single game ever being named: the user
  // asked for "几个" and got a questionnaire, and the adjective he actually cared
  // about ("唯美") was handed straight back. The fix is not more questions, it is
  // the design package the questions are supposed to grow out of.
  //
  // The gate sits at the moment the dossier goes out — that is the only point
  // where the ordering claim ("先设计包，再提问") is checkable at all.
  const kickoffStatus = String(state.kickoff?.status ?? '').trim();
  if (KICKOFF_ASKED_STATUSES.includes(kickoffStatus)) {
    const basis = state.design_basis ?? {};
    const missing = DESIGN_BASIS_FIELDS.filter(
      (field) => typeof basis[field] !== 'string' || basis[field].trim() === '',
    );
    if (missing.length === DESIGN_BASIS_FIELDS.length) {
      out.push(
        '⛔ 模式缺陷：开工文档已发出，但 d_state.design_basis 整个是空的。'
        + '一次问全清单第 0 条要求"**先给出零到一前置设计包草案，再据此提问**——问题从这份草案里长出来，'
        + '而不是凭空列清单"。没有这份草案，你问的就是领域固定问卷（技能明文禁止），'
        + '而且你会把用户说的形容词（"唯美""治愈""宏大"）原样还回去——那等于没做设计。'
        + '回头补 design_basis 的六项（definition 定义 / motivation 动机与取向 / meaning 对用户的意义 / '
        + 'structure 产品结构分解 / time_logic 时间与状态逻辑 / feeling 感觉→画面的翻译），'
        + '再据此重写问题。',
      );
    } else if (missing.length > 0) {
      out.push(
        `⛔ 设计包缺字段：d_state.design_basis 少了 ${missing.join(' / ')}（共 ${DESIGN_BASIS_FIELDS.length} 项）。`
        + '这六项是提问的来源，缺一项就意味着有一类问题不是从"这是哪款游戏"里长出来的。补全后再发问。',
      );
    }

    // Granularity, not count. §提问纪律 forbids a domain questionnaire; the way
    // that failure shows up in the state is a pile of correctly-filled fields
    // with nothing nameable underneath them.
    const pitches = Array.isArray(state.design_basis?.pitches) ? state.design_basis.pitches : [];
    const named = pitches.filter(
      (row) => typeof row?.name === 'string' && row.name.trim() !== ''
        && typeof row?.pitch === 'string' && row.pitch.trim() !== '',
    );
    if (named.length < DESIGN_BASIS_MIN_PITCHES) {
      out.push(
        `⛔ 没有可命名的具体方案：d_state.design_basis.pitches 只有 ${named.length} 条`
        + `（至少 ${DESIGN_BASIS_MIN_PITCHES} 条，每条写 name + pitch）。`
        + '用户说"你多想几个"时，他要的是**几个具体的游戏**，不是一份问卷。'
        + '判据是**命名粒度，不是方案数量**——能读出"这是哪款游戏"，而不是"这是什么品类"；'
        + '三条都叫"模拟器"等于零条。每条写 name（方案名）+ pitch（一句话：玩家反复做的那一个动作、'
        + '画面里常驻什么、三十秒内发生什么）。',
      );
    }
  }

  // A yellow item with no fallback cannot auto-advance: at the 40-minute mark
  // there is nothing to fall back *to*, so the whole timeout rule stalls and the
  // run ends up waiting forever — the exact failure the rule exists to prevent.
  const noFallback = (state.pending_user_decisions ?? []).filter((row) => (
    row?.level === '黄'
    && row?.status !== '已确认'
    && String(row?.fallback ?? '').trim() === ''
  ));
  if (noFallback.length > 0) {
    out.push(
      `⛔ 黄色项缺少 fallback：${noFallback.map((row) => row.question).join(' / ')}。`
      + '每条黄色项都必须给出你推荐、且真敢交付的默认值——否则 40 分钟超时推进没有可推进的目标，'
      + '这条规则就形同不存在。补上 fallback 与 asked_at（时间取 d_state 返回里的「服务器时间」）。',
    );
  }

  // ── V5 hole 1: the clock has one source, and now it has a check. ──────────
  // Two places in the skills insist the timestamp come from the host's
  // "服务器时间" field, and one of them says a run already fabricated it once.
  // Nothing verified that. A stale or invented stamp silently destroys the whole
  // 40-minute rule: past-dated advances instantly, future-dated never advances,
  // and the mode cannot tell the difference from the user's silence.
  const imagined = (state.pending_user_decisions ?? []).filter((row) => {
    if (row?.level !== '黄' || row?.status === '已确认') return false;
    const raw = String(row?.asked_at ?? '').trim();
    if (raw === '') return false;
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) return true;
    return Math.abs(Date.now() - parsed) > ASKED_AT_TOLERANCE_MS;
  });
  if (imagined.length > 0) {
    const detail = imagined
      .map((row) => {
        const raw = String(row.asked_at ?? '').trim();
        return Number.isFinite(Date.parse(raw))
          ? `${row.question}（${raw}）`
          : `${row.question}（"${raw}" 不是合法时间）`;
      })
      .join(' / ');
    out.push(
      `⛔ asked_at 不是服务器时间：${detail}。`
      + '超时判定完全依赖这个时间戳，编一个会让 40 分钟规则失准——填早了立刻"超时"，'
      + '填晚了永远不超时，而模式分不出这跟"用户真的没回"的区别。'
      + '时间只有一个来源：**上一次 d_state 返回里的「服务器时间」（now 字段）**，照抄它，不要自己推。',
    );
  }

  // ── V5 hole 3: a G change is owed the user's confirmation, not a guess. ────
  // §变更权限: G (direction / order / method / dependency) defaults to needing
  // user confirmation. Nothing checked it, so a run could re-plan its own
  // direction and record the paperwork as if it had been agreed.
  const regoal = (state.change_items ?? []).filter(
    (row) => String(row?.kind ?? '').trim() === 'G' && row?.classification !== '作废',
  );
  if (regoal.length > 0 && state.consent?.status !== '已确认') {
    out.push(
      `⛔ 方向变更 G 未经用户确认：${regoal.map((row) => row.id ?? row.title ?? '(未命名)').join(' / ')}。`
      + 'G 是"调整方向 / 顺序 / 方法 / 依赖"，它改了要做成什么，不是怎么实现——'
      + '§变更权限 规定 G 默认需要用户确认，除非用户本人明确要求了这个改变。'
      + '先把变更内容与影响告诉用户并拿到答复，再把 consent.basis 写成对应依据（以及 consent.status = "已确认"）；'
      + '用户没回应就只有 DISC 与提问可做，施工动作会被引擎拒绝。',
    );
  }

  const stamp = (state.reviewers ?? [])
    .filter((row) => row?.status === '通过' && row?.isolation !== '独立子代理');
  if (stamp.length > 0) {
    out.push(
      `⛔ 审阅不可信：${stamp.map((row) => row.officer).join(' / ')} 记为「通过」但并非独立子代理。`
      + '不受隔离的结论不算验收证据（橡皮图章），必须用独立子代理重跑：全新上下文、只看成品与用户原始意图。',
    );
  }

  // §不要一个人单打独斗. Two rules, both aimed at the same failure: hand-writing
  // what the ecosystem already ships, without ever asking whether it exists.
  const stage = String(state.current_stage ?? '');
  const platform = state.platform ?? {};
  const platformChosen = typeof platform.choice === 'string' && platform.choice.trim() !== '';
  if (!platformChosen && PLATFORM_REQUIRED_STAGES.includes(stage)) {
    out.push(
      `⛔ 没写承载平台：当前阶段已是 ${stage}，但 platform.choice 为空。`
      + '每一件作品都有承载平台——游戏引擎（Godot / Unity / Unreal / GameMaker / Construct / RPG Maker / Phaser / Cocos / LÖVE / Bevy）、'
      + '应用框架（Electron / Tauri / Qt / WinUI）、浏览器原生（Canvas / WebGL / Web Audio），'
      + '或明确选择的无框架自研。**自研也是一种答案**，但必须先问过、并把否掉的候选写进 platform.alternatives。'
      + '不许不做比较就默认从零手写。',
    );
  }
  if (platform.kind === PLATFORM_SELF_BUILT) {
    const alts = Array.isArray(platform.alternatives) ? platform.alternatives : [];
    const named = alts.filter((row) => typeof row?.name === 'string' && row.name.trim() !== '');
    if (named.length === 0) {
      out.push(
        '⛔ 选择「无框架自研」但没有列出考虑过并否掉的平台（platform.alternatives 为空）。'
        + '一个人单打独斗不是默认选项：至少列出 2 个真实存在的成熟平台，逐个写 why_not（'
        + '单文件/离线交付约束、许可与费用、目标平台导出、包体与性能、维护状态……）。'
        + '写不出 why_not，说明你根本没查过，应当回去查，而不是继续手写引擎的物理/渲染/音频/输入/存档。',
      );
    } else if (named.length < 2) {
      out.push(
        `⛔ 自研平台的候选只有 ${named.length} 个：${named.map((row) => row.name).join(' / ')}。`
        + '至少比较 2 个成熟平台再决定自研，否则「比较」没有意义。',
      );
    }
  }

  const gameLike = isGameProject(state);
  const decisionStage = String(state.current_stage ?? '');
  if (gameLike && GAME_APPROVAL_REQUIRED_STAGES.includes(decisionStage)) {
    const approval = state.game_approval ?? {};
    const hasChosenProposal = approval.status === '用户已选方案' || approval.status === '用户明确同意施工';
    const hasBuildApproval = approval.status === '用户明确同意施工'
      && typeof approval.proposal_id === 'string' && approval.proposal_id.trim() !== ''
      && typeof approval.user_evidence === 'string' && approval.user_evidence.trim() !== '';
    if (!hasChosenProposal || !hasBuildApproval) {
      out.push(
        '⛔ 游戏方案尚未得到用户明确认可：回答需求问题只是在补充条件，不代表用户喜欢某个游戏方案，也不代表同意开工。'
        + '先把具体方案与“为什么玩/快乐来源/用户选择会改变什么”展示给用户；记录其明确选中的 proposal_id、原话证据，并取得按该方案开工的明确表态。'
        + '施工题回答、技术选型回答、沉默、默认值超时都不能代替这项批准。',
      );
    }
  }
  if (gameLike && (stage === 'ACCEPTANCE' || stage === 'COMPLETE')) {
    const gameplayMissing = GAMEPLAY_REVIEW_FIELDS.filter((field) => !text(state.gameplay_review?.[field]));
    if (gameplayMissing.length > 0) {
      out.push(
        `⛔ 游戏试玩证据未闭环：gameplay_review 缺少 ${gameplayMissing.join(' / ')}。`
        + '必须从真实启动入口操作玩家可用的键鼠/触控路径，记录至少三轮核心循环、选择与结果变化、失败恢复（不适用时说明原因）及具体重玩理由。'
        + '单测、代码阅读、计划中的试玩不能替代实际运行观察；补齐后再申请验收。',
      );
    }
    const visualMissing = VISUAL_REVIEW_FIELDS.filter((field) => !text(state.visual_review?.[field]));
    if (visualMissing.length > 0) {
      out.push(
        `⛔ 游戏视觉/UI 证据未闭环：visual_review 缺少 ${visualMissing.join(' / ')}。`
        + '必须检查用户真实入口的运行截图，记录首屏层级与具体 UI 缺陷，至少修复一项并从同一入口复测。'
        + '独立 mock 图或源代码描述不能充当实机视觉验收；没有视觉能力时如实标未验证并交付截图待人工判断。',
      );
    }
  }

  // ── V5 §宿主游戏 mod: the mod owes its host, version and loader. ──────────
  // A mod is not a standalone product: the carrying platform is someone else's
  // game, and the loader is bound to the version. These three facts are what
  // decide whether the artifact can start at all, so leaving them blank is not a
  // missing note — it is an unloadable deliverable. The version is a *spec*
  // question (§提问纪律): asked of the user, never assumed on their behalf.
  //
  // The kind is a *selection*, so it can simply be missed: a model building a mod
  // may write "游戏引擎" and move on, which would route the whole thing around
  // every rule below. So the choice text is checked too — saying "Minecraft mod"
  // while claiming to be a game engine is the same deliverable under a label that
  // skips the checks.
  const platformText = [platform.choice, platform.note, platform.host_game]
    .filter((value) => typeof value === 'string').join(' ');
  const looksLikeMod = /\bmod\b|模组|模组包|forge|neoforge|fabric|quilt|bukkit|spigot|paper|tmodloader|smapi|数据包|datapack/i
    .test(platformText);
  if (looksLikeMod && platform.kind !== PLATFORM_HOST_MOD
    && PLATFORM_REQUIRED_STAGES.includes(stage)) {
    out.push(
      '⛔ 这看起来是做 mod，但 platform.kind 写的是「'
      + `${platform.kind ?? '(空)'}」。mod 的承载平台是**别人的游戏**，不是引擎——`
      + 'kind 请写「宿主游戏 mod」，然后补上 host_game / host_version / host_loader。'
      + '这不是文字游戏：写成引擎会绕过全部 mod 检查（版本锁定、加载器绑定、验收要带宿主），'
      + '最后交付一个不知道装在哪个版本上的 jar。',
    );
  }
  if (platform.kind === PLATFORM_HOST_MOD && PLATFORM_REQUIRED_STAGES.includes(stage)) {
    const missing = HOST_MOD_FIELDS.filter(
      (field) => typeof platform[field] !== 'string' || platform[field].trim() === '',
    );
    if (missing.length > 0) {
      out.push(
        `⛔ 宿主游戏 mod 没写清载体：platform 少了 ${missing.join(' / ')}。`
        + 'mod 的"承载平台"是别人的游戏，所以有三件事必须写在案：'
        + 'host_game（宿主游戏）、host_version（**锁定的那一个**游戏版本）、host_loader（加载器）。'
        + '这三样决定它能不能被加载：MC 1.20.1 与 1.21 不共用 API，Forge / NeoForge / Fabric 也是各自独立的生态，'
        + '为其中一套编译的 jar 装到另一套上根本不会载入。'
        + '**版本与加载器是规格题，必须问用户，不许替他默认**——他朋友装的是哪个版本，只有他知道。',
      );
    }
    // "Multi-version support" is not a property you assert; it is a second build.
    const multi = /多版本|全版本|跨版本|多个版本|multiple versions|several versions/i;
    const versionish = String(platform.host_version ?? '');
    // Two MC version numbers in one field is a range, not a version.
    const numbered = versionish.match(/\b1\.\d+(?:\.\d+)?\b/g) ?? [];
    // A version field must name *one concrete version*. Anything that is vague,
    // open-ended or a wildcard reads like a version but pins nothing — and a mod
    // built against an unpinned target is exactly the jar that will not load.
    // These are the evasions that survive a plain "did you write something" check.
    //
    // Careful with the operators: a bare `+` or `~` is a wildcard ("1.20+",
    // "~1.20.1"), but `1.20.1+Forge` is just a version joined to a loader name, so
    // require those symbols to sit next to a version digit and not be followed by
    // a word. False positives here would block a correct answer.
    const notPinned = /最新版|最新|latest|newest|稳定版|推荐版|随便|任意|以上|以下|\bor\b|或\b|\bx\b|\d\.x|\bx\.x/i;
    // ">=1.20" / "1.20+" / "~1.20" / "*" — an operator bound to a version, or a
    // bare wildcard. `+`/`~` count only when they touch a version on the left and
    // are NOT merely joining a loader name on the right: "1.20+" is a wildcard,
    // while "1.20.1+Forge 47.2.0" is a correctly pinned version plus its loader.
    const ranged = /(?:>=|<=|>|<|=)\s*\d|(?:\d|\.)\s*(?:\+|~)(?!\s*[A-Za-z])|(?:^|[^\d.])\s*(?:\+|~)\s*\d|^\s*\*+\s*$/;
    if (typeof platform.host_version === 'string'
      && (multi.test(versionish) || numbered.length > 1
        || notPinned.test(versionish) || ranged.test(versionish))) {
      const vague = multi.test(versionish) || numbered.length > 1
        ? '"支持多版本"不是写上去就有的一项属性，它是**分别编译的多份产物**——'
          + 'MC 每个大版本的 API 都改过，跨版本意味着多套源码或一套多目标构建（如 Architectury），'
          + '以及逐版本的真机验证。**首版必须锁定唯一一个版本**，'
          + '把其余版本写进 note 作为后续计划（并说清代价），而不是填进 host_version。'
        : '这写的是"哪个版本都行"，但 mod 恰恰是**版本绑死**的东西：'
          + 'jar 里的资源与类名都对着某一个 MC 版本的 API 编译，'
          + '"最新版 / 1.20.x / 1.20 以上"这种写法没有锁定任何东西，装到具体某一版上照样可能载入失败。'
          + '**必须写成一个具体的版本号**（如 "1.20.1"）。';
      out.push(
        '⛔ platform.host_version 不是一个具体版本：'
        + `"${platform.host_version}"。${vague}`,
      );
    }
  }

  // §美术达标 (V4). The end-to-end product that prompted this rule was complete,
  // playable, verified — and the user still said 美术粗糙. The host's review found the
  // same root cause in all three rules below: the art was aimed at adjectives, so
  // nothing was ever measured against anything.
  const artHeavy = (state.surfaces ?? []).filter(
    (row) => typeof row?.art_weight === 'string' && ART_HEAVY_WEIGHTS.includes(row.art_weight),
  );
  if (artHeavy.length > 0 && ART_REQUIRED_STAGES.includes(stage)) {
    const areas = artHeavy.map((row) => row.area ?? '(未命名板块)');
    const art = state.art ?? {};
    const refs = Array.isArray(art.references) ? art.references : [];
    const withSteal = refs.filter(
      (row) => typeof row?.name === 'string' && row.name.trim() !== ''
        && typeof row?.what_to_steal === 'string' && row.what_to_steal.trim() !== '',
    );
    if (refs.length < ART_MIN_REFERENCES) {
      out.push(
        `⛔ 美术没有参考图：${areas.join(' / ')} 的 art_weight 是 ${artHeavy.map((row) => row.art_weight).join('/')}，`
        + `但 d_state.art.references 只有 ${refs.length} 条（至少 ${ART_MIN_REFERENCES} 条）。`
        + '美术要对着**参考**做，不是对着形容词做：「要好看」「剪影渐层」这种描述无法验证，也做不出好东西。'
        + '找 2-3 张真实参考（商业作品截图、用户给的图、真实照片），每张写清 name + source + what_to_steal'
        + '（要从它身上抄的具体做法：分层方式、明暗对比、色相偏移、材质做法、UI 排版）。',
      );
    } else if (withSteal.length < refs.length) {
      out.push(
        `⛔ 有参考图但没从中提取做法：${refs.length} 条 references 里只有 ${withSteal.length} 条写了 what_to_steal。`
        + '只贴一张图不算参考——必须写清"我要从它身上抄什么"，否则它只是装饰。',
      );
    }
    const palette = Array.isArray(art.palette) ? art.palette : [];
    const distinctHex = new Set(
      palette
        .filter((row) => typeof row?.hex === 'string' && row.hex.trim() !== '')
        .map((row) => row.hex.trim().toLowerCase()),
    );
    if (distinctHex.size < ART_MIN_PALETTE) {
      out.push(
        `⛔ 色板不够分层：d_state.art.palette 只有 ${distinctHex.size} 个不同色值（至少 ${ART_MIN_PALETTE} 个）。`
        + '只用同一个色相的明度差做远近，画面会**一片脏灰**——这正是实测里被用户判为"粗糙"的头号原因。'
        + '深度必须靠 hue/saturation 推移：远景偏冷偏灰（提高明度、降低饱和、向蓝紫偏），'
        + '近景偏暖偏实（提高对比、向橙红偏）。palette 每条写 hex + role（如 "#2B3A55 远景山体"）。',
      );
    }
    const rounds = Array.isArray(art.view_rounds) ? art.view_rounds : [];
    if (rounds.length < ART_MIN_VIEW_ROUNDS) {
      out.push(
        `⛔ 美术没有真的迭代：d_state.art.view_rounds 只有 ${rounds.length} 轮（至少 ${ART_MIN_VIEW_ROUNDS} 轮）。`
        + '一轮 = 渲染 → **真的看** → 与参考并排比 → 列出具体差距 → 改一处 → 再渲染。'
        + '实测里那次美术粗糙的根本原因就是只渲染了一次就收工。'
        + '每轮写 round（如 "1"）+ looked_at（看了哪个文件/哪张图）+ gaps（与参考差在哪，要具体到元素）+ changed（这一轮改了什么）。',
      );
    } else {
      const empty = rounds.filter(
        (row) => typeof row?.changed !== 'string' || row.changed.trim() === '',
      );
      if (empty.length > 0) {
        out.push(
          `⛔ 有的迭代轮次只看了没改（第 ${empty.map((row) => row.round).join(' / ')} 轮 changed 为空）。`
          + '看出差距却不改，等于没迭代。',
        );
      }
    }
  }

  // ── V5 §宿主游戏 mod: "it runs" must name the host it runs on. ────────────
  // The product gate is "别人照你的自述能跑起来". For a mod that sentence has a
  // missing subject: run *where*? A jar is only loadable inside one specific game
  // version plus one specific loader, so an acceptance path that omits them is not
  // a weaker criterion — it is an untestable one. Reaching ACCEPTANCE / COMPLETE
  // without that combination written down is how "我做完了" gets sent to a friend
  // whose game then refuses to start.
  if (platform.kind === PLATFORM_HOST_MOD
    && (stage === 'ACCEPTANCE' || stage === 'COMPLETE')) {
    const host = [platform.host_game, platform.host_version, platform.host_loader]
      .filter((value) => typeof value === 'string' && value.trim() !== '');
    const path = typeof state.final_acceptance?.user_path === 'string'
      ? state.final_acceptance.user_path.trim() : '';
    if (host.length < HOST_MOD_FIELDS.length || path === '') {
      out.push(
        '⛔ mod 的验收路径没写清环境：'
        + (host.length < HOST_MOD_FIELDS.length ? 'platform 里的宿主游戏/版本/加载器不全' : '')
        + (path === '' ? `${host.length < HOST_MOD_FIELDS.length ? '，且' : ''}final_acceptance.user_path 为空` : '')
        + '。mod 的"能跑起来"必须带上主体：**装了哪个游戏版本、哪个加载器（哪个版本）的玩家，'
        + '把这个 jar 放到哪里，启动后看到什么**。'
        + '少了这组信息，验收根本无法执行——版本不对，jar 连载入都不会载入，'
        + '而"我这边是好的"证明不了任何事。',
      );
    }
  }

  const risky = (state.surfaces ?? [])
    .filter((row) => typeof row?.licence === 'string' && LICENCE_STOP_PATTERN.test(row.licence));
  if (risky.length > 0) {
    out.push(
      `⛔ 许可红线：${risky.map((row) => `${row.area}（${row.licence}）`).join(' / ')} 命中 SA/GPL/NC/ND/需核实。`
      + '这些一律不得自行使用，必须停下问用户，或换成 CC0 / MIT / ISC / OFL 来源。',
    );
  }

  const ownedArt = (state.surfaces ?? [])
    .filter((row) => row?.art_weight === 'S' && row?.source !== '用户提供');
  if (ownedArt.length > 0) {
    out.push(
      `⛔ 美术权重 S：${ownedArt.map((row) => row.area).join(' / ')} 的画面本身就是卖点，`
      + '但 source 不是「用户提供」。S 级必须等用户给出参考/素材或明确授权才能开工，不得自行决定。',
    );
  }

  // ── V5 hole 2 + hole 5: the style answer must land, and land in time. ──────
  // The kickoff dossier is required to ask art weight S/A/B, and `surfaces` is
  // required to carry an `art_weight` per area — but nothing tied the answer to
  // the field, so a run could ask the question, note the answer in prose, and
  // then build with `surfaces` carrying no art weight at all. The whole art gate
  // keys off that field, so losing it silently switches the gate off.
  //
  // Timing is the other half (hole 5): style direction is settled *during*
  // DISCOVERY — it is the question the dossier is asking — so the check has to be
  // live by then, not from DESIGN onward.
  const kickoffSent = KICKOFF_ASKED_STATUSES.includes(String(state.kickoff?.status ?? '').trim());
  const surfaces = Array.isArray(state.surfaces) ? state.surfaces : [];
  const weighted = surfaces.filter(
    (row) => typeof row?.art_weight === 'string' && row.art_weight.trim() !== '',
  );
  if (kickoffSent && surfaces.length > 0 && weighted.length === 0 && ART_STYLE_REQUIRED_STAGES.includes(stage)) {
    out.push(
      '⛔ 美术权重问了没落地：开工文档已经发出，surfaces 里也有板块，但**没有任何一块写了 art_weight**。'
      + '美术权重（S/A/B）是必问题，它的答案必须写回 surfaces 的对应板块——'
      + '整个美术门的开关就看这个字段：丢了它，参考图 / 色板 / 迭代轮次那三条检查会**整体静默失效**，'
      + '谁都不会发现。把答案写进对应板块的 art_weight，S/A 还要写 material 与 source。',
    );
  }
  // §美术达标 timing: a heavy-art area owes its style direction from DISCOVERY on.
  // Asking "which of these three looks?" and then not recording the answer is the
  // same defect as never having asked.
  const heavy = weighted.filter((row) => ART_HEAVY_WEIGHTS.includes(row.art_weight));
  if (heavy.length > 0 && kickoffSent && ART_STYLE_REQUIRED_STAGES.includes(stage)) {
    const feeling = typeof state.design_basis?.feeling === 'string' ? state.design_basis.feeling.trim() : '';
    const refs = Array.isArray(state.art?.references) ? state.art.references : [];
    if (feeling === '' && refs.length === 0) {
      out.push(
        `⛔ 画风方向没定就发问了：${heavy.map((row) => row.area).join(' / ')} 的 art_weight 是 `
        + `${heavy.map((row) => row.art_weight).join('/')}，但 design_basis.feeling 为空、art.references 也没有一条。`
        + '画风是**提问阶段**就要定下来的东西（先渲 3 张同场景样图让用户挑），不是等 DESIGN 再补。'
        + '用户对着"极简线框 / 剪影渐层"这类词只能脑补，脑补出来的和你做出来的几乎一定不是一回事——返工从这里开始。'
        + '把渲出来的样图与用户的选择写进 design_basis.feeling 与 art.references。',
      );
    }
  }

  return out;
}


/**
 * V6 §硬门: the defects that must not be survivable by prose alone.
 *
 * Until now every rule in `defectReport` came back as a sentence riding along
 * with the tool result — a suggestion. A run could read "美术没有参考图", shrug,
 * and then record COMPLETE in the next call; the host had said its piece and the
 * state still said done. That is exactly how "170 断言全绿 + 用户说粗糙" gets
 * shipped, so these five are promoted from advice to a gate: `mergeState` will
 * not let the run enter ACCEPTANCE / COMPLETE while one of them is open.
 *
 * Matching is by the sentence `defectReport` already produces, so the wording
 * lives in one place. `tests/host.test.mjs` fires every signature on a crafted
 * state, which is what stops a reworded message from silently switching a gate
 * off — the failure mode this whole layer exists to prevent.
 */
const HARD_GATES = [
  { code: 'ART_NO_REFERENCE', test: (line) => line.includes('美术没有参考图') },
  { code: 'SELF_BUILT_NO_ALTERNATIVES', test: (line) => line.includes('选择「无框架自研」但没有列出') },
  { code: 'RUBBER_STAMP', test: (line) => line.includes('审阅不可信') },
  { code: 'LICENCE_REDLINE', test: (line) => line.includes('许可红线') },
  { code: 'HOST_VERSION_UNPINNED', test: (line) => line.includes('host_version 不是一个具体版本') },
  { code: 'GAMEPLAY_REVIEW_MISSING', test: (line) => line.includes('游戏试玩证据未闭环') },
  { code: 'GAME_VISUAL_REVIEW_MISSING', test: (line) => line.includes('游戏视觉/UI 证据未闭环') },
  { code: 'GAME_PLAN_UNAPPROVED', test: (line) => line.includes('游戏方案尚未得到用户明确认可') },
];

/**
 * The subset of `defectReport` that blocks completion (not construction).
 * @param state - the merged construction state.
 * @returns defect sentences whose gate is hard.
 */
export function hardDefects(state) {
  return defectReport(state).filter((line) => HARD_GATES.some((gate) => gate.test(line)));
}

/** Stages a hard gate keeps the run out of. */
const COMPLETION_STAGES = ['ACCEPTANCE', 'COMPLETE'];

/**
 * Whether a final_acceptance status is claiming the thing is done.
 * Kept narrow on purpose: "待验收" / "待用户确认" must stay writable, or the run
 * cannot even record that it is waiting for the user.
 */
const COMPLETION_CLAIM = /^(完成|已通过|通过|已验收|已交付|done|complete)$/i;

export function toView(state) {
  if (state === null || state === undefined) return null;
  return {
    goal: state.project_goal ?? null,
    stage: state.current_stage ?? null,
    // V6: how many hard gates are standing between the run and "完成". A refused
    // attempt is counted too, so the panel keeps saying why instead of quietly
    // showing the stage the run fell back to.
    hardGates: Array.isArray(state.completion_refused?.items)
      ? state.completion_refused.items.length
      : hardDefects(state).length,
    stageState: stageState(state.current_stage),
    stageNote: state.stage_note ?? null,
    progress: state.progress_signal ?? null,
    pipeline: pipelineRows(state),
    modules: (state.modules ?? []).map((row) => ({
      name: row.name, status: row.status ?? null, note: row.note ?? null,
    })),
    currentModule: state.current_module ?? null,
    plan: tail(state.plan, 6).map((row) => ({
      step_id: row.step_id, title: row.title ?? null, status: row.status ?? null,
    })),
    currentStep: state.current_step ?? null,
    changes: tail(state.change_items, 8).map((row) => ({
      id: row.id, kind: row.kind ?? null, title: row.title ?? null,
      status: row.status ?? null, classification: row.classification ?? null,
    })),
    design: { status: state.design?.status ?? null, notes: state.design?.notes ?? null },
    experience: {
      first_10s: state.experience_contract?.first_10s ?? null,
      first_60s: state.experience_contract?.first_60s ?? null,
      first_5min: state.experience_contract?.first_5min ?? null,
      screen: state.experience_contract?.screen ?? null,
      feedback: state.experience_contract?.feedback ?? null,
    },
    gameApproval: { ...(state.game_approval ?? {}) },
    gameplayReview: { ...(state.gameplay_review ?? {}) },
    visualReview: { ...(state.visual_review ?? {}) },
    benchmarks: tail(state.benchmarks, 5).map((row) => ({
      work: row.work, what: row.what ?? null, source: row.source ?? null,
    })),
    surfaces: (state.surfaces ?? []).map((row) => ({
      area: row.area, level: row.level ?? null, form: row.form ?? null, source: row.source ?? null,
      material: row.material ?? null, origin: row.origin ?? null,
      licence: row.licence ?? null, artWeight: row.art_weight ?? null,
    })),
    basis: {
      definition: state.design_basis?.definition ?? null,
      motivation: state.design_basis?.motivation ?? null,
      meaning: state.design_basis?.meaning ?? null,
      structure: state.design_basis?.structure ?? null,
      time_logic: state.design_basis?.time_logic ?? null,
      feeling: state.design_basis?.feeling ?? null,
      pitches: (state.design_basis?.pitches ?? []).map((row) => ({
        name: row.name ?? null, pitch: row.pitch ?? null,
      })),
    },
    kickoff: {
      status: state.kickoff?.status ?? null,
      path: state.kickoff?.path ?? null,
      questionCount: state.kickoff?.question_count ?? null,
      blockingCount: state.kickoff?.blocking_count ?? null,
    },
    reviewers: (state.reviewers ?? []).map((row) => ({
      officer: row.officer, status: row.status ?? null, isolation: row.isolation ?? null,
      verdict: row.verdict ?? null, evidence: row.evidence ?? null, overturned: row.overturned ?? null,
    })),
    assets: {
      imageApi: state.asset_policy?.image_api ?? null,
      budgetNote: state.asset_policy?.budget_note ?? null,
      licenceNote: state.asset_policy?.licence_note ?? null,
    },
    platform: {
      choice: state.platform?.choice ?? null,
      kind: state.platform?.kind ?? null,
      licence: state.platform?.licence ?? null,
      cost: state.platform?.cost ?? null,
      exportTargets: state.platform?.export_targets ?? null,
      note: state.platform?.note ?? null,
      // V5 §宿主游戏 mod: the three facts a mod's loadability rests on.
      hostGame: state.platform?.host_game ?? null,
      hostVersion: state.platform?.host_version ?? null,
      hostLoader: state.platform?.host_loader ?? null,
      alternatives: (state.platform?.alternatives ?? []).map((row) => ({
        name: row.name, whyNot: row.why_not ?? null,
      })),
    },
    art: {
      layers: state.art?.layers ?? null,
      light: state.art?.light ?? null,
      texture: state.art?.texture ?? null,
      ui: state.art?.ui ?? null,
      note: state.art?.note ?? null,
      references: (state.art?.references ?? []).map((row) => ({
        name: row.name, source: row.source ?? null, whatToSteal: row.what_to_steal ?? null,
      })),
      palette: (state.art?.palette ?? []).map((row) => ({
        hex: row.hex, role: row.role ?? null,
      })),
      viewRounds: (state.art?.view_rounds ?? []).map((row) => ({
        round: row.round, lookedAt: row.looked_at ?? null,
        gaps: row.gaps ?? null, changed: row.changed ?? null,
      })),
    },
    autoAdvanced: (state.auto_advance_log ?? []).map((row) => ({
      item: row.item, defaultUsed: row.default_used ?? null,
      reason: row.reason ?? null, at: row.at ?? null,
    })),
    capabilities: state.capabilities_note ?? null,
    capabilityDetail: state.capabilities ?? null,
    decisions: tail(state.decisions, 5).map((row) => ({
      decision_id: row.decision_id, choice: row.choice ?? null, reason: row.reason ?? null,
      date: row.date ?? null,
    })),
    verification: tail(state.verification, 4).map((row) => ({
      what: row.what, result: row.result ?? null,
    })),
    repair: tail(state.repair_history, 5).map((row) => ({
      id: row.id, what: row.what ?? null, tests: row.tests ?? null, progress: row.progress ?? null,
    })),
    technicalFailures: tail(state.technical_failures, 3).map((row) => ({
      what: row.what, kind: row.kind ?? null, recovered: row.recovered ?? null,
    })),
    resources: {
      time: state.resource_budget?.time ?? null,
      cost: state.resource_budget?.cost ?? null,
      taskLimit: state.resource_budget?.task_limit ?? null,
    },
    requirements: {
      unknown: tail(state.unknown, 3),
      assumptions: tail(state.assumptions, 3),
      intake: {
        status: state.intake?.status ?? null,
        autonomy: state.intake?.autonomy ?? null,
      },
      consent: {
        status: state.consent?.status ?? '未确认',
        basis: state.consent?.basis ?? null,
      },
      counts: {
        unknown: (state.unknown ?? []).length,
        assumptions: (state.assumptions ?? []).length,
        delegated: (state.delegated ?? []).length,
        deferred: (state.deferred ?? []).length,
      },
    },
    artifacts: tail(state.artifacts, 5).map((row) => ({ path: row.path, note: row.note ?? null })),
    acceptance: {
      status: state.final_acceptance?.status ?? null,
      userPath: state.final_acceptance?.user_path ?? null,
      evidence: tail(state.final_acceptance?.evidence, 3),
      userOnly: tail(state.final_acceptance?.user_only, 5),
    },
    blockers: (state.blockers ?? []).map((row) => ({ what: row.what, need: row.need ?? null })),
    pending: (state.pending_user_decisions ?? [])
      .filter((row) => row.status !== '已确认')
      .map((row) => ({
        question: row.question, status: row.status ?? null, level: row.level ?? null,
        fallback: row.fallback ?? null, autoAdvanced: row.auto_advanced ?? null,
        advancedValue: row.advanced_value ?? null,
      })),
    checkpoints: tail(state.checkpoints, 3).map((row) => ({ id: row.id, note: row.note ?? null })),
  };
}

/** Whether one pipeline row is the stage the session is working in right now. */
function rowIsActive(stage, current) {
  if (typeof stage !== 'string' || current === null || current === undefined) return false;
  const name = stage.trim();
  if (name === current) return true;
  const aliases = STAGE_ALIASES.get(name);
  return aliases !== undefined && aliases.includes(current);
}

/**
 * §55: the first-level pipeline view. The model's own rows win; when it has not
 * listed the chain yet, the twelve canonical stages are shown so the view always
 * covers the whole pipeline, with the Active Stage marked either way.
 */
function pipelineRows(state) {
  const current = state.current_stage ?? null;
  const rows = (state.pipeline ?? []).map((row) => ({
    stage: row.stage,
    status: row.status ?? null,
    summary: row.summary ?? null,
    active: rowIsActive(row.stage, current),
  }));
  if (rows.length > 0) return rows;
  return CANONICAL_STAGES.map((stage) => ({
    stage, status: '未开始', summary: null, active: rowIsActive(stage, current),
  }));
}

/** Projection schema placeholder: the registry only calls `.parse` at the boundary. */
const identitySchema = { parse: (value) => value };

/** The D-mode charter, read from this package, with an inline fallback. */
function loadPrompt() {
  const fallback = [
    '# D｜深度施工模式',
    '',
    '你是 D，一个独立承担端到端施工责任的 Agent：需求整体确定、施工内部拆解、成熟底座优先复用、',
    '原创集中在产品核心、唯一主干连续施工、真实证据验证、基于进展返修、审计有界、产品级验收、全链状态可视化。',
    '普通技术决策由你自己完成，只向用户回执「用了什么、为什么」。',
    '每次阶段切换、模块完成、验证或 Repair 后，用 `d_state` 更新结构化施工状态。',
  ].join('\n');
  try {
    const file = join(dirname(fileURLToPath(import.meta.url)), 'prompt', 'd-mode.md');
    const content = readFileSync(file, 'utf8').trim();
    return content.length > 0 ? content : fallback;
  } catch {
    return fallback;
  }
}

/** Mirrors the state into `<cwd>/.d-construction/state.json`; never throws. */
async function mirrorState(cwd, state) {
  if (typeof cwd !== 'string' || cwd.length === 0) return '';
  try {
    const dir = join(cwd, MIRROR_DIR);
    await mkdir(dir, { recursive: true });
    const file = join(dir, MIRROR_FILE);
    await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    return file;
  } catch {
    return '';
  }
}

/** The `d_state` tool definition (raw registry form: `parameters` is JSON Schema). */
function stateTool(ctx) {
  const stringArray = { type: 'array', items: { type: 'string' } };
  const objectArray = (properties) => ({
    type: 'array',
    items: { type: 'object', additionalProperties: false, properties },
  });
  const spec = (properties) => ({ type: 'object', additionalProperties: false, properties });
  const optional = (schema, description, extra = {}) => ({
    ...schema, description, ...extra,
  });

  return {
    name: TOOL_NAME,
    description: [
      '记录或更新本会话的结构化深度施工状态（阶段、模块、计划、变更项、验证、Repair、阻塞、技术决策、ConstructionBrief 等）。',
      '技术失败（超时/网络/工具崩溃/临时环境）与业务失败分开登记在 technical_failures；资源边界记在 resource_budget，触发时报告"资源边界已到"而不是谎称业务失败。',
      '用户中途改要求时，把既有结果在 change_items.classification 里分类为 沿用 / 复查 / 重做 / 作废。',
      '提问采用「一次问全」：把属于用户的问题一次问完，用户答完后把 intake 记为 { status: 已回答, autonomy: 已授权 }，此后按自主契约推进，不得为同类问题再开一轮。',
      'V2 开工文档（kickoff）：开工前必须先把一份结构化文档（Kickoff Dossier）写到项目里并给出路径，把「属于用户的未知项」一次列全——每题写清 为什么问 / 推荐默认 / 是否阻塞。用户最讨厌的是中途反复改，最不怕的是前期多问；问几个问题无可厚非，做这个模式就是为了让不懂行的人也能被问到点上。',
      'V2 不该有红色项：任何问题都只能是黄色（可超时推进）。如果你发现某件事必须阻塞才能问清，那说明开工文档没问全——把它记为模式缺陷、回头补问，而不是把运行停在那里。kickoff.blocking_count 必须恒为 0。',
      'V2 超时推进：黄色项问出去后等 40 分钟（timeout_min，缺省 40）。超时无回应就按 fallback 推进，并把这件事写进 auto_advance_log（含用了什么默认值、通过什么渠道通知过用户）。每条黄色项都必须带 fallback，且 fallback 必须是你真敢交付的值。用户回来后要能一眼看到「它替我决定了什么」。',
      'V2 素材策略（asset_policy + surfaces.origin/licence/material）：每个交付板块都要有真实物料，不能只写"纯几何"就算交代。取材顺序：用户已提供 → 不靠素材能解决（图标/排版/色板、GLSL 程序化、ZzFX 合成音效）→ 成套 CC0 开源包（Kenney / Quaternius / Poly Haven / game-icons）→ 图像生成 API（须先问预算，超 ¥20 单次或 ¥100 累计必须停下问）→ 自制。纯程序化/几何只能是被明确选定的风格（要给出色板、描边、动效、音色），不能是省钱的兜底。许可只取 CC0/MIT/ISC/OFL；CC-BY-SA、GPL、NC、ND 一律停下问用户。',
      'V2.1 承载平台（platform）：不要一个人单打独斗。每一件作品都有承载平台，游戏/交互类必须先查现成的引擎与制作平台（Godot / Unity / Unreal / GameMaker / Construct / RPG Maker / Phaser / Cocos / LÖVE / Bevy），应用类查框架（Electron / Tauri / Qt / WinUI），交互网页查浏览器原生能力。**先扫本机已装了什么**（Godot 4.7 就在本机 `Y:\\codex\\墨劫行\\tools\\godot\\`），不要以"要下载"为由否决一个其实已经装好的引擎。进入 DESIGN 之后 platform.choice 不得为空；选择「无框架自研」时必须列出至少 2 个考虑过并否掉的成熟平台及 why_not（交付形态约束、许可与费用、导出目标、包体性能、维护状态）。**手写引擎的物理/渲染/动画/粒子/UI/输入/存档/本地化/寻路是最后手段，不是默认选项。**',
      'V4 美术达标（art）：**美术要对着参考做，不是对着形容词做。** 当某个交付板块的 art_weight 是 S 或 A 时，宿主要求：① `art.references` 至少 2 条，每条写清 name + source + **what_to_steal**（要从它身上抄的具体做法；只贴图不写这条不算参考）；② `art.palette` 至少 4 个不同色值，且**必须有 hue/饱和度推移**——只用明度差做远近会得到"一片脏灰"，这是实测里被用户判为粗糙的头号原因（远景偏冷偏灰、近景偏暖偏实）；③ `art.view_rounds` 至少 3 轮，每轮 = 渲染 → **真的看** → 与参考并排比 → 列出具体差距 → 改一处，每轮必须写 looked_at + gaps + changed（只看了没改不算迭代）。**证据帧必须等于实机**：自己另写脚本渲染出的"漂亮帧"不是证据，必须是用户会打开的同一条路径。另外还有两件常被忽略的：一是**纯平涂不算完成**——要有噪点/笔触/渐变/材质（`art.texture`），否则像未完成的矢量草稿；二是**没有任何光影交互的画面是死的**——日月/光源必须影响场景，角色需要边缘光才从背景里"跳"出来（`art.light`），UI 单独过一遍（`art.ui`：字体不要系统默认、对比度要够、层级要清）。',
      'V2 美术权重（surfaces.art_weight）：S = 画面本身就是卖点（如唯美风景、角色立绘）→ 必须等用户答复才开工；A = 重要但可超时推进 → 标黄；B = 画面不重要（如数值战斗爽）→ 不阻塞。这个判定要在开工文档里直接问用户"画面好不好看对这个产品有多重要"，不要替他默认。',
      'V2 体验官（reviewers）：交付给用户之前，先由体验官从人的视角审阅成品——初见官（0–5 分钟冷启动）、核心循环官（乐趣与动机）、留存官（第 2、3 次会话）、学习官（仅学习类）、可用性官（Nielsen 10 条 + SUS）、对抗官（专职找反例，必须至少推翻或降级 1 条他人结论）。硬规则：必须以「独立子代理」运行（全新上下文，只看成品与用户原始意图，不读 README/设计文档/施工日志/他人报告）；必须先真跑真看再下结论，证据是截图/坐标/时间戳/命令原始输出；不得修改任何代码。全部通过后用户才是终审——用户是最终验收者，不是第一个体验者。',
      'V2 能力自检（capabilities）：状态里有一份由宿主探测、不是你写的能力清单。若 capabilities.vision 为 false，你就没有眼睛：不得声称看过任何画面，也不得把美术/界面类板块标记为已验证，必须先向用户报告这个限制。',
      '施工锁：consent 默认「未确认」，此时引擎会拒绝 write/edit/pwsh/run_code/subagent/workflow。回答需求问题只代表补充条件，不代表喜欢方案或同意开工。游戏必须先记录 game_approval.status=用户已选方案，再由用户明确说按该方案开工，记录 status=用户明确同意施工、proposal_id、proposal_name、user_evidence；否则即使 intake=已回答/已授权，游戏施工仍会被拒绝。沉默、技术题回答、你推测用户不耐烦、自主续跑轮次、提问通道不可用，都不构成游戏方案授权。',
      '面向人的交付还要写 experience_contract、benchmarks、surfaces、design_basis 与 final_acceptance.user_only。游戏还必须写 gameplay_review 与 visual_review 的真实运行证据；current_stage=COMPLETE 时宿主会硬性检查，缺项会阻止完成。',
      '部分更新：标量字段传了就覆盖；对象字段按键合并；数组字段整表替换，因此传入数组时必须给出该字段的完整当前列表。',
      '它驱动全链 Pipeline View，也是长任务中不依赖聊天记录的真实状态。',
      '调用时点：开局判定后、需求收敛后、技术决策后、计划确定后、每个模块开始/完成/阻塞时、每轮验证后、每轮 Repair 后、用户中途修改要求后、阶段切换时、最终验收时。',
    ].join(''),
    parameters: spec({
      project_goal: optional({ type: 'string' }, '一句话最终目标。'),
      current_stage: optional({
        type: 'string', enum: STAGES,
      }, '当前状态机阶段。'),
      stage_note: optional({ type: 'string' }, '当前阶段的一句话说明。'),
      pipeline: optional(objectArray({
        stage: { type: 'string', description: '阶段名，例如 需求发现 / 外部现实侦察 / ConstructionBrief / 模块施工 / 验证 / Repair / 验收。' },
        status: { type: 'string', enum: STATUSES, description: '未开始 / 进行中 / 等待用户 / 通过 / 需修复 / 阻塞 / 作废。' },
        summary: { type: 'string', description: '该阶段简短摘要。' },
      }), '全链阶段列表（整表替换）。'),
      known: optional(stringArray, '已明确的信息（整表替换）。'),
      unknown: optional(stringArray, '尚未明确且可能影响结果的信息（整表替换）。'),
      assumptions: optional(stringArray, '当前推断，必须可识别（整表替换）。'),
      delegated: optional(stringArray, '用户明确委托 D 自行决定的事项（整表替换）。'),
      deferred: optional(stringArray, '明确延期、不阻塞当前阶段的事项（整表替换）。'),
      pending_user_decisions: optional(objectArray({
        question: { type: 'string', description: '等待用户决定的问题。' },
        status: { type: 'string', enum: PENDING_STATUSES, description: '待回答 / 已回答 / 已确认。' },
        level: { type: 'string', enum: DECISION_LEVELS, description: 'V2 只允许"黄"。不该有红色项：需要阻塞才能问清，说明开工文档没问全，是模式缺陷——把它记进 blockers 并回头补问，而不是停在这里。' },
        fallback: { type: 'string', description: 'V2 必填：你推荐的默认值。超时（40 分钟无回应）后按它推进，所以它必须是你真敢交付的那个值，不是占位。' },
        asked_at: { type: 'string', description: '问出去的时刻（ISO 时间）。超时判定以此为准。**必须取自上一次 d_state 返回里的「服务器时间」**——施工锁生效时你调不到 shell，自己编的时间戳会让 40 分钟超时判定失准。' },
        timeout_min: { type: 'string', description: '等待时长（分钟），缺省 40。' },
        auto_advanced: { type: 'string', description: '是 / 否——是否已被超时自动推进。' },
        advanced_value: { type: 'string', description: '实际推进时采用的值。' },
      }), '等待用户决定的事项（整表替换）。每条都要带 fallback；没有 fallback 的黄色项等于把用户绑在电脑前。'),
      intake: optional(spec({
        status: { type: 'string', enum: INTAKE_STATUSES, description: '未开始 / 已发出 / 已回答 ——「一次问全」的进度。' },
        autonomy: { type: 'string', enum: AUTONOMY, description: '未授权 / 已授权 ——用户答完一次问全后记为「已授权」，此后不得为同类问题再开一轮。' },
        note: { type: 'string', description: '一次问全覆盖了什么、还有什么留给后续。' },
      }), '一次问全与自主授权（按键合并）。'),
      game_approval: optional(spec({
        status: { type: 'string', enum: GAME_APPROVAL_STATUSES, description: '游戏专用批准门：未展示 / 待用户选择 / 用户已选方案 / 用户明确同意施工。回答技术或需求问题不改变该状态。' },
        proposal_id: { type: 'string', description: '用户明确选中的具体游戏方案 ID。' },
        proposal_name: { type: 'string', description: '用户明确选中的具体游戏方案名。' },
        user_evidence: { type: 'string', description: '用户原话或明确同意证据，例如“选方案 A，按这个做”。不能写模型推断。' },
      }), '游戏方案批准门：必须先被用户明确选中，再被用户明确授权开工；沉默和技术题回答不算。'),
      consent: optional(spec({
        status: { type: 'string', enum: CONSENT_STATUSES, description: '未确认 / 已确认 ——施工锁开关。默认未确认：未确认时引擎会拒绝 write/edit/pwsh/run_code/subagent/workflow。' },
        basis: { type: 'string', enum: CONSENT_BASES, description: '授权依据：用户回答（非游戏通用需求确认；游戏仍必须有 game_approval）/ 用户授权默认值（用户明确说"按你的默认做"）/ 用户原始需求已完整（最初的请求已含完整设计与验收标准、并明确要求直接实施）/ 超时推进默认值（开工文档已发出 + 等满 40 分钟无回应 + 已按 fallback 推进并写入 auto_advance_log；最后这条宿主会核对留痕，凭推测写会被引擎拒绝）。' },
        note: { type: 'string', description: '一句话留痕：用户具体说了什么。' },
      }), '施工授权（按键合并）。这是"用户沉默 ≠ 授权"的工程化落点。'),
      research: optional(spec({
        status: { type: 'string', description: '研究状态，例如 未开始 / 进行中 / 已完成。' },
        sources_used: { ...stringArray, description: '已核对并实际使用的来源。' },
        conclusion: { type: 'string', description: '研究结论：采用什么、不采用什么、为什么。' },
      }), '外部现实侦察结果（按键合并）。'),
      decisions: optional(objectArray({
        decision_id: { type: 'string', description: '如 D-001。' },
        choice: { type: 'string', description: '采用了什么。' },
        purpose: { type: 'string', description: '承担什么职责。' },
        reason: { type: 'string', description: '选择原因。' },
        alternatives: { type: 'string', description: '主要替代方案。' },
        rejected_reason: { type: 'string', description: '未采用原因。' },
        evidence: { type: 'string', description: '外部依据（官方文档 / 标准 / 仓库与版本）。' },
        impact: { type: 'string', description: '对产品的影响。' },
        status: { type: 'string', enum: DECISION_STATUSES, description: 'ACTIVE / SUPERSEDED / EXPERIMENTAL。' },
        date: { type: 'string', description: '决策日期，YYYY-MM-DD。' },
      }), '技术决策记录（整表替换）。'),
      construction_brief: optional(spec({
        final_goal: { type: 'string' }, users: { type: 'string' }, scenarios: { type: 'string' },
        product_form: { type: 'string' }, core_experience: { type: 'string' }, platform: { type: 'string' },
        preferences: { type: 'string' }, references: { type: 'string' }, constraints: { type: 'string' },
        risks: { type: 'string' }, acceptance: { type: 'string' }, inputs: { type: 'string' },
        must_have: stringArray, not_doing: stringArray, delegated: stringArray, deferred: stringArray,
      }), 'ConstructionBrief（按键合并）。'),
      gameplay_review: optional(spec({
        playtest_path: { type: 'string', description: '真实游戏启动入口与玩家输入路径，不能只写测试函数调用。' },
        loop_observation: { type: 'string', description: '至少三次核心循环的实际观察：动作、决策、反馈、奖励与循环节奏。' },
        branch_evidence: { type: 'string', description: '两种不同选择导致不同结果的实测对照；无分支游戏须说明设计理由与替代变化。' },
        retry_observation: { type: 'string', description: '失败到重开的实际路径；没有失败机制时写不适用及设计依据。' },
        replay_hook: { type: 'string', description: '具体且有证据的再次游玩动机；未找到时写未成立，返设计。' },
      }), '游戏核心循环试玩证据；不能以代码阅读或自动化单测代替真实玩家路径。'),
      visual_review: optional(spec({
        runtime_screenshot: { type: 'string', description: '从用户实际运行入口截取的画面证据，独立 mock 渲染图不算。' },
        hierarchy_review: { type: 'string', description: '首屏目标、主操作、重要状态的信息层级与遮挡检查。' },
        visual_rounds: { type: 'string', description: '真实渲染、看图、指出差距、实施改动的迭代记录。' },
        ui_findings: { type: 'string', description: '主界面/HUD/菜单/暂停/结果界面的具体问题与处理。' },
        retest_result: { type: 'string', description: '同一真实入口、同类画面状态下的改后复测结果；看不到时标未验证。' },
      }), '游戏视觉与 UI 实机审查证据；不得用代码描述冒充看过画面。'),
      experience_contract: optional(spec({
        first_10s: { type: 'string', description: '前 10 秒：用户/玩家做什么动作，看到什么变化（动作级，不是氛围级）。' },
        first_60s: { type: 'string', description: '前 60 秒：会得到几次"变强了 / 爽了"，分别由什么触发。' },
        first_5min: { type: 'string', description: '前 5 分钟：目标链（现在做什么 → 为了什么 → 解锁什么）。' },
        screen: { type: 'string', description: '常驻画面：屏幕上一直有什么，什么数字/形状/状态在变。' },
        feedback: { type: 'string', description: '每次操作的声画反馈：按下去发生什么（视觉 + 声音 + 数字）。' },
      }), '体验契约（动作级剧本，按键合并）。写不出具体动作 = 设计没做完，不得进入 DESIGN/BUILD。'),
      benchmarks: optional(objectArray({
        work: { type: 'string', description: '对标的产品/作品或领域权威来源名。' },
        what: { type: 'string', description: '从它身上学到什么（核心循环 / 动机 / 差评 / 视听惯例 / 领域方法）。' },
        source: { type: 'string', description: '实际读过的来源（链接或出处）。' },
      }), '品类与领域对标（整表替换）。技术层研究不能替代这一层。'),
      surfaces: optional(objectArray({
        area: { type: 'string', description: '交付板块：玩法与操作 / 数值与曲线 / 美术与视觉 / 音频 / 内容与文案 / 领域专业性 / 平台与性能 等。每个板块都必须有一行。' },
        level: { type: 'string', enum: SURFACE_LEVELS, description: '你在这个板块的能力：强 / 一般 / 弱 / 无。' },
        form: { type: 'string', description: '本次采用的具体形式（例：成套 CC0 像素包 + 统一色相偏移 / WebAudio 合成音效 / 自研曲线并附来源）。' },
        source: { type: 'string', enum: SURFACE_SOURCES, description: '这个板块的参考或素材从哪来：对标（外部作品/权威做法）/ 自产 / 用户提供 / 已授权自主。level 为 弱 或 无 时，source 必须是 用户提供 或 已授权自主，否则禁止进入 BUILD。' },
        material: { type: 'string', description: 'V2 素材策略：这块具体用什么料（例：Kenney 的 1-Bit Pack / Lucide 图标 + 固定色板 / GLSL 渐变背景 / ZzFX 合成音效）。只写"程序化"不算，要写到能直接取用。' },
        origin: { type: 'string', enum: ASSET_ORIGINS, description: 'V2 素材来源：用户提供 / 开源素材 / 图像API / 程序化 / 自制 / 对标复刻 / 待定。按决策树顺序先试零成本项，只有素材库覆盖不了才走图像API，且必须先问用户预算。' },
        licence: { type: 'string', enum: ASSET_LICENCES, description: 'V2 许可：可放心用的是 CC0 / MIT / ISC / OFL / 自有 / 已购买。CC-BY 需署名（产品要有署名位）。CC-BY-SA / GPL / NC / ND / 需核实 / 未核实 是红线：写进来宿主的自查会直接报错要求你停下问用户——不要以为记下来就没事了。' },
        art_weight: { type: 'string', enum: ART_WEIGHTS, description: 'V2 美术权重：S=画面本身就是卖点（必须等用户答复才能开工）/ A=重要但可超时推进（标黄）/ B=画面不重要（不阻塞）。' },
      }), '交付面清单（整表替换）。板块不得静默留空：弱项要么拿到用户提供的参考/素材，要么拿到"随便你"的明确授权；且每块都要有可执行的 material + origin + licence。'),
      kickoff: optional(spec({
        status: { type: 'string', enum: KICKOFF_STATUSES, description: '未开始 / 已发出 / 已回答 / 已超时推进。' },
        path: { type: 'string', description: '开工文档（Kickoff Dossier）的落盘路径，用户可直接打开填写。' },
        question_count: { type: 'string', description: '一共问了多少个问题（这一轮所有属于用户的未知项都应在此，不要留到中途再问）。' },
        blocking_count: { type: 'string', description: '其中被标为阻塞（红色）的数量。V2 要求它恒为 0——大于 0 说明当初没问全，是模式缺陷，必须回头补问。' },
        note: { type: 'string', description: '补充说明：覆盖了哪些板块、还有什么留给后续。' },
      }), 'V2 开工文档（按键合并）。开工前一次性问全的落地形态：一份结构化文档，每题带「为什么问 / 推荐默认 / 是否阻塞」。'),
      reviewers: optional(objectArray({
        officer: { type: 'string', enum: REVIEW_OFFICERS, description: '体验官：初见官（0–5 分钟冷启动）/ 核心循环官（乐趣与动机）/ 留存官（第 2、3 次会话）/ 学习官（仅学习类）/ 可用性官（Nielsen+SUS）/ 对抗官（专职找反例）。' },
        status: { type: 'string', enum: REVIEW_STATUSES, description: '未开始 / 进行中 / 通过 / 不通过 / 退回 / 不适用。' },
        isolation: { type: 'string', enum: REVIEW_ISOLATION, description: '独立子代理（唯一有效形态：全新上下文、只看成品与用户原始意图）/ 同会话 / 未隔离。非独立子代理的结论不得计入验收证据。' },
        report: { type: 'string', description: '报告落盘路径。' },
        evidence: { type: 'string', description: '它实际跑/看了什么：截图路径、坐标、时间戳、命令与原始输出。无证据的结论一律记为未验证。' },
        verdict: { type: 'string', description: '它给出的结论与一句话理由，含「第一次想放弃的时刻」和「想再用的具体理由」。' },
        overturned: { type: 'string', description: '对抗官专用：它推翻或降级了哪条他人结论。一条都推翻不了，视为审阅流程失败。' },
        agent_id: { type: 'string', description: '独立子代理的 id，便于追溯。' },
        date: { type: 'string', description: 'YYYY-MM-DD。' },
      }), 'V2 体验官审阅（整表替换）。全部通过（或退回后重修再通过）之后，才允许交给用户做最终验收；用户是终审，不是第一个体验者。'),
      asset_policy: optional(spec({
        image_api: { type: 'string', description: '是否已接图像生成 API、接的哪家、谁提供的 key。未接就写"未接"，并说明降级到哪条零成本路线。' },
        budget_note: { type: 'string', description: '预算：单次与累计上限。超过上限必须停下问用户。' },
        licence_note: { type: 'string', description: '许可纪律：实际使用的素材库与许可类型；是否含需署名项及署名位置。' },
      }), 'V2 素材策略（按键合并）。纯程序化/几何只能是被明确选定的风格，不能是省钱的兜底。'),
      platform: optional(spec({
        choice: { type: 'string', description: '承载这件作品的平台/引擎/框架，写具体名字与版本，例如「Godot 4.4」「浏览器原生 Canvas 2D + Web Audio」「Electron 44」。**每一件作品都有承载平台，自研也算**——但必须先问过再选。' },
        kind: { type: 'string', enum: PLATFORM_KINDS, description: '游戏引擎 / 应用框架 / 浏览器原生 / 原生平台 / 宿主游戏 mod / 无框架自研 / 其它。选「无框架自研」时必须给出至少 2 个考虑过的成熟平台；选「宿主游戏 mod」时必须填 host_game / host_version / host_loader。' },
        host_game: { type: 'string', description: '**仅宿主游戏 mod**：宿主游戏名（例：「Minecraft Java 版」）。mod 不是独立产品，它的承载平台是别人的游戏。' },
        host_version: { type: 'string', description: '**仅宿主游戏 mod**：**锁定的那一个**宿主版本，必须是一个具体的版本号（例：「1.20.1」）。必须问用户，不许替他默认——他朋友装的是哪个版本只有他知道。**不要写"多版本"**（跨版本是分别编译的多份产物，不是可以声称的属性），**也不要写模糊版本**（「最新版」「1.20.x」「1.20 以上」「任意版本」）——那等于什么都没锁定。首版锁一个版本，其余写进 note 作为后续计划。' },
        host_loader: { type: 'string', description: '**仅宿主游戏 mod**：加载器及其版本（例：「Forge 47.2.0」/「NeoForge 21.1」/「Fabric 0.15」）。加载器与游戏版本是绑死的，两者必须同时写清——为其中一套编译的 jar 装到另一套上根本不会被载入。' },
        alternatives: objectArray({
          name: { type: 'string', description: '考虑过但没选的平台/引擎名字。' },
          why_not: { type: 'string', description: '为什么不用它：单文件/离线交付约束、许可与费用、目标平台导出、包体与性能、维护状态、学习成本……要具体，不许写"太复杂"。' },
        }, '考虑过并否掉的候选平台。选「无框架自研」时至少 2 个，且每个都要有 why_not。'),
        licence: { type: 'string', description: '该平台的许可与商用条件（如 MIT / Apache-2.0 / 免费商用含收入门槛 / 按席订阅）。' },
        cost: { type: 'string', description: '费用：一次性或订阅、是否有收入门槛或分成、导出目标是否额外收费。' },
        export_targets: { type: 'string', description: '能导出/发布到哪里，是否满足用户要的交付形态（单文件、离线、双击即玩、安装包、Web、移动）。' },
        note: { type: 'string', description: '补充：这个平台提供了哪些原本要手写的东西（物理/渲染/动画/粒子/UI/输入/存档/本地化/寻路/音频）。' },
      }), 'V2.1 承载平台（按键合并）。防止一个人单打独斗：不许不做比较就默认从零手写引擎、物理、渲染、音频、输入与存档。'),
      art: optional(spec({
        references: objectArray({
          name: { type: 'string', description: '参考作品/图片的名字（例：「Inside 第 3 章」/「用户给的这张照片」/「Kenney 1-Bit 示例图」）。' },
          source: { type: 'string', description: '从哪找到的：链接、文件路径或"用户提供"。' },
          what_to_steal: { type: 'string', description: '要从它身上抄什么：分层数量与间距、明暗对比关系、色相/饱和度推移方向、材质做法（噪点/笔触/渐变）、角色剪影形状语言、UI 排版。**只贴图不写这条不算参考。**' },
        }, '美术参考（整表替换）。art_weight 为 S/A 的板块至少 2 条。美术要对着参考做，不是对着形容词做。'),
        palette: objectArray({
          hex: { type: 'string', description: '具体色值，如 "#2B3A55"。必须是十六进制，不要写"深蓝"。' },
          role: { type: 'string', description: '这个色用在哪一层/哪个元素，如 "远景山体" "受光面" "角色高光" "UI 底板"。' },
        }, '色板（整表替换）。至少 4 个不同色值，且**必须包含 hue/饱和度推移**（远景偏冷偏灰、近景偏暖偏实）——只用明度差会得到"一片脏灰"。'),
        layers: { type: 'number', description: '背景纵深分几层（视差层数）。' },
        light: { type: 'string', description: '光源与光照交互：光源在哪、受光面/背光面怎么处理、有没有边缘光把角色从背景里拉出来。只贴一个发光圆而场景不受影响 = 不算。' },
        texture: { type: 'string', description: '怎么避免纯平涂：噪点/笔触/渐变/颗粒/材质叠加的具体做法。全是纯色填充 = 看起来像未完成的矢量草稿。' },
        ui: { type: 'string', description: 'UI 排版：字体（不要系统默认衬线/宋体）、字号层级、字间距、与背景的对比度、对齐与留白。文字压在同色背景上读不清要在这里说明怎么解决。' },
        view_rounds: objectArray({
          round: { type: 'string', description: '第几轮，如 "1"（写成字符串）。' },
          looked_at: { type: 'string', description: '这一轮实际看了什么：截图路径/命令。**必须是用户会看到的同一路径**——自己另写脚本渲染出的"漂亮帧"不算证据。' },
          gaps: { type: 'string', description: '与参考并排比出来的具体差距（要指到元素：第 2 层山与第 3 层色相太近 / 角色在夜里读不出轮廓 / 草的线段太随机）。' },
          changed: { type: 'string', description: '这一轮改了什么（具体到代码或参数）。只看了没改，等于没迭代。' },
        }, '渲染→看→与参考比→改 的迭代轮次（整表替换）。art_weight 为 S/A 时至少 3 轮。'),
        note: { type: 'string', description: '补充：还有哪些已知的美术短板、留给后续做什么。' },
      }), 'V4 美术达标（按键合并）。美术粗糙的头号原因是"没有参考、没有并排对比、只渲染一次就收工"。'),
      auto_advance_log: optional(objectArray({
        item: { type: 'string', description: '被自动推进的事项。' },
        default_used: { type: 'string', description: '用了哪个默认值。' },
        reason: { type: 'string', description: '为什么推进（例如：标黄项等待超 40 分钟无回应）。' },
        at: { type: 'string', description: '推进时间。' },
        notified_via: { type: 'string', description: '通过什么渠道通知过用户（例如 IM 推送 / 会话内）。' },
      }), 'V2 超时推进留痕（整表替换）。用户回来后一眼能看到"它替我决定了什么"。'),
      design_basis: optional(spec({
        definition: { type: 'string', description: '这个品类/产品是什么：定义与边界（例：什么算肉鸽、什么算增量；什么算学习产品）。先定义再设计。' },
        motivation: { type: 'string', description: '人为什么玩/用：乐趣或价值来源，以及取向光谱与本次选择（例：硬核↔纯爽、应试↔沉浸↔打卡）。' },
        meaning: { type: 'string', description: '它对用户意味着什么：第一次使用结束时处在什么状态、为什么会回来、可玩/可用时长目标。' },
        structure: { type: 'string', description: '产品结构分解：内容侧 / 交互与 UI 侧 / 数据与存储侧 / 前后端与工程侧 / 平台与分发侧，各自包含什么、哪些做、哪些不做。' },
        time_logic: { type: 'string', description: '时间与状态逻辑：是否依赖系统时间/日期、跨天与连续性、时区、离线结算、复习/刷新节奏等。' },
        feeling: { type: 'string', description: '「讲感觉」流派：用户只描述得出感觉（"我想要那种孤零零的、风很大的感觉"，也包括夹在需求里的形容词——"唯美""治愈""宏大""压抑"）时，把感觉原文 + 你的翻译路径写在这里——感觉是检索线索，不是设计交付：① 什么时候有这种感觉 ② 在哪见过 ③ 只能用一个画面/一个动作表达它是什么 ④ 据此找到的对标作品，以及从对标里抽出的可执行设计元素（色板 / 构图 / 动效 / 音色）。**把形容词原样还回去（"好的，我会做得唯美一点"）等于没做设计。**' },
        pitches: optional(objectArray({
          name: { type: 'string', description: '方案名，能读出"这是哪款游戏"而不是"这是什么品类"（例："退潮后的滩涂拾荒者"，不是"一个模拟器"）。' },
          pitch: { type: 'string', description: '一句话说清这款游戏：玩家反复做的那一个动作 → 画面里常驻什么 → 三十秒内发生什么。' },
        }), '≥2 个可命名的具体方案（整表替换）。用户说"你多想几个"时要的就是这个：**几个具体的游戏**，不是一份问卷。判据是命名粒度，不是方案数量——三条都叫"模拟器"等于零条。宿主会在 kickoff.status 变成「已发出」后硬查这一项。'),
      }), '零到一前置设计包（按键合并）。Brief 确认前必须写出；缺项说明设计思考没做完。**清单第 0 条：先有这份草案，再据此提问**——问题从"这是哪款游戏"里长出来，而不是从领域固定问卷里抄。'),
      modules: optional(objectArray({
        name: { type: 'string', description: '模块名。' },
        status: { type: 'string', enum: MODULE_STATUSES, description: '未开始 / 进行中 / 已完成 / 阻塞 / 等待用户。' },
        note: { type: 'string', description: '一句话说明。' },
      }), '模块列表（整表替换）。'),
      current_module: optional({ type: 'string' }, '当前模块名。'),
      plan: optional(objectArray({
        step_id: { type: 'string', description: 'Y1 / Y2-X1 等编号。' },
        title: { type: 'string', description: '步骤标题。' },
        status: { type: 'string', enum: PLAN_STATUSES, description: '未开始 / 进行中 / 已完成 / 阻塞 / 作废 / 延期。' },
      }), '施工计划（整表替换）。'),
      current_step: optional({ type: 'string' }, '当前步骤编号。'),
      change_items: optional(objectArray({
        id: { type: 'string', description: '编号，如 Y8-X1。' },
        kind: { type: 'string', enum: CHANGE_KINDS, description: 'Y 原计划 / X 修复 / Z 新增 / B 补漏 / G 调整 / S 删除。' },
        title: { type: 'string', description: '变更标题。' },
        status: { type: 'string', description: '状态说明。' },
        classification: { type: 'string', enum: CHANGE_CLASSES, description: '用户改了要求之后，这条既有结果的处置：沿用 / 复查 / 重做 / 作废。' },
        note: { type: 'string', description: '补充说明。' },
      }), '变更项（整表替换）。'),
      verification: optional(objectArray({
        what: { type: 'string', description: '验证了什么。' },
        command: { type: 'string', description: '真实执行的命令或入口。' },
        result: { type: 'string', description: '真实结果，例如 96/96 pass。' },
        evidence: { type: 'string', description: '证据位置（日志、报告、文件）。' },
      }), '验证记录（整表替换）。'),
      repair_history: optional(objectArray({
        id: { type: 'string', description: '如 Y8-X1。' },
        what: { type: 'string', description: '这一轮解决了什么。' },
        tests: { type: 'string', description: '测试变化，例如 96 tests → 89 pass。' },
        progress: { type: 'string', enum: PROGRESS_SIGNALS, description: 'PROGRESS / INFO_GAIN / STALLED / REGRESSION / PASS。' },
        next: { type: 'string', description: '下一步：继续 / Replan / Rollback。' },
      }), 'Repair 历史（整表替换）。'),
      technical_failures: optional(objectArray({
        what: { type: 'string', description: '发生了什么，例如 API 超时 / 网络波动 / 工具崩溃 / 临时环境错误。' },
        kind: { type: 'string', enum: FAILURE_KINDS, description: '技术失败 或 业务失败；技术失败单独记录，避免误判产品方向。' },
        impact: { type: 'string', description: '对本次施工的影响。' },
        recovered: { type: 'string', description: '如何恢复 / 是否已恢复。' },
        evidence: { type: 'string', description: '证据位置。' },
      }), '技术失败与业务失败的分开记录（整表替换）。'),
      resource_budget: optional(spec({
        time: { type: 'string', description: '时间预算或已用时间。' },
        cost: { type: 'string', description: 'API / 资源成本预算或已用量。' },
        task_limit: { type: 'string', description: '单任务资源上限。' },
        note: { type: 'string', description: '触发资源边界时的说明（报告"资源边界已到"，而不是谎称业务失败）。' },
      }), '资源停损（按键合并）。'),
      design: optional(spec({
        status: { type: 'string', enum: DESIGN_STATUSES, description: '未开始 / 进行中 / 已完成 / 需返工。' },
        notes: { type: 'string', description: '总体架构与设计的一句话状态。' },
      }), '设计阶段状态（按键合并）。'),
      progress_signal: optional({ type: 'string' }, '当前进展判定的一句话。'),
      checkpoints: optional(objectArray({
        id: { type: 'string', description: 'checkpoint 编号。' },
        note: { type: 'string', description: '说明。' },
        path: { type: 'string', description: '位置。' },
      }), 'checkpoint 列表（整表替换）。'),
      blockers: optional(objectArray({
        what: { type: 'string', description: '卡在哪里。' },
        why: { type: 'string', description: '已知原因。' },
        need: { type: 'string', description: '需要用户或环境提供什么。' },
      }), '阻塞项（整表替换）。'),
      artifacts: optional(objectArray({
        path: { type: 'string', description: '产物路径。' },
        note: { type: 'string', description: '说明。' },
      }), '产物清单（整表替换）。'),
      final_acceptance: optional(spec({
        status: { type: 'string', description: '验收状态。' },
        user_path: { type: 'string', description: '用户可走的完整真实路径。' },
        evidence: { ...stringArray, description: '验收证据。' },
        user_only: { ...stringArray, description: '只有用户说"是"才算过的验收项（爽不爽 / 有没有感觉 / 愿不愿意继续用）；你不能替它打勾，未确认前不得写 COMPLETE。' },
      }), '产品级验收（按键合并）。'),
      note: optional({ type: 'string' }, '其它需要留痕的一句话。'),
      capabilities_note: optional({ type: 'string' }, 'V2 能力自检：把本次工具返回的「能力自检」那一行原样写回（视觉有没有 / 图像生成有没有 / IM 推送有没有），面板会显示它。宿主每次调用都会重新探测并返回真实值，所以照抄即可，不要自己编。'),
    }),
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string' },
          state_path: { type: 'string' },
          capability: { type: 'string' },
          warning: { type: 'string' },
          now: { type: 'string', description: '宿主提供的本地时间戳（带时区偏移），用于填写 asked_at 与计算 40 分钟超时。施工锁生效时你拿不到 shell，所以时间只能从这里取。' },
        },
        required: ['summary', 'state_path', 'capability', 'warning', 'now'],
      },
      render: (_args, value) => [{ type: 'text', text: value.warning === '' ? value.summary : `${value.summary}\n\n${value.warning}` }],
    },
    presentCall: (args) => ({
      card: 'generic',
      title: '更新深度施工状态',
      kind: 'other',
      rawInput: args,
    }),
    async execute(args, exec) {
      const agent = exec?.agent;
      const session = agent?.session;
      if (session === undefined) throw new Error('d_state requires an owning agent session');
      const merged = mergeState(
        ctx.sessionProjections.stateOf(session, PROJECTION_KEY) ?? null,
        args,
      );

      // V2 §能力自检: probe what this agent can really call, then let the truth
      // overwrite whatever the model wrote. The base model is text-only, so the
      // difference between "I looked at it" and "I imagined it" is exactly this.
      let capabilities = null;
      try {
        const schemas = typeof ctx.tools?.schemas === 'function' ? ctx.tools.schemas(agent) : undefined;
        capabilities = probeCapabilities(schemas);
      } catch {
        capabilities = null;
      }
      const report = capabilityReport(capabilities, merged);
      if (capabilities !== null) merged.capabilities = capabilities;

      // V2 §自我纠错: the host, not the model, decides whether this write broke a
      // rule of the mode. Violations ride back with the result.
      // V6: hard gates first — they are the five that a later call cannot paper
      // over, so they must be the first thing read, not the last line of a wall.
      const defects = defectReport(merged);
      const hardNow = hardDefects(merged);
      const ordered = [...hardNow, ...defects.filter((line) => !hardNow.includes(line))];
      const warning = [report.warning, ...ordered]
        .filter((entry) => entry !== '')
        .join('\n');

      const statePath = await mirrorState(session.header?.cwd, merged);
      const modules = merged.modules ?? [];
      const done = modules.filter((row) => row.status === '已完成').length;
      const openBlockers = (merged.blockers ?? []).length;
      const pending = (merged.pending_user_decisions ?? [])
        .filter((row) => row.status !== '已确认').length;
      const openRepairs = (merged.repair_history ?? [])
        .filter((row) => row.progress !== 'PASS').length;
      const now = localStamp();
      const summary = [
        `深度施工状态已更新：阶段 ${merged.current_stage ?? '未设置'}`,
        `模块 ${done}/${modules.length}`,
        `计划 ${(merged.plan ?? []).length} 项`,
        `变更项 ${(merged.change_items ?? []).length} 项`,
        `未闭环 Repair ${openRepairs} 轮`,
        `阻塞 ${openBlockers} 项`,
        `待你决定 ${pending} 项`,
        `硬门 ${hardNow.length} 项未清`,
        `能力自检：${report.line}`,
        `体验官 ${(merged.reviewers ?? []).filter((row) => row.status === '通过').length}/${(merged.reviewers ?? []).length} 通过`,
        `承载平台：${typeof merged.platform?.choice === 'string' && merged.platform.choice.trim() !== ''
          ? `${merged.platform.choice}${typeof merged.platform.kind === 'string' && merged.platform.kind !== '' ? `（${merged.platform.kind}）` : ''}`
          : '未写'}`,
        `美术：参考 ${(merged.art?.references ?? []).length} 张 / 色板 ${(merged.art?.palette ?? []).length} 色 / 迭代 ${(merged.art?.view_rounds ?? []).length} 轮`,
        `自动推进留痕 ${(merged.auto_advance_log ?? []).length} 条`,
        `服务器时间 ${now}`,
        statePath === '' ? '（项目镜像未写入）' : `（项目镜像 ${statePath}）`,
      ].join('；');
      return {
        summary,
        state_path: statePath,
        capability: report.line,
        warning,
        now,
      };
    },
  };
}

/**
 * Build the construction guard: a synchronous `ToolGuard` that denies
 * construction tools while the session's recorded consent is still open.
 *
 * Registered on the preset scope, so it covers every agent joined under this
 * preset — including autonomous goal rounds, which is the point: a continuation
 * round is not a user approval. Sessions this plugin cannot attribute to the D
 * mode are left alone, so the guard never leaks into other presets.
 *
 * @param ctx - registrant context carrying `sessionProjections` (and optionally `agentPresets`).
 * @returns a guard returning a denial reason, or `undefined` to allow the call.
 */
export function consentGuard(ctx) {
  return (exec) => {
    try {
      const tool = exec?.name;
      if (typeof tool !== 'string' || !CONSTRUCTION_TOOLS.has(tool)) return undefined;

      const agent = exec?.agent;
      const session = agent?.session;
      // No session to attribute the call to → this is not a D-mode build, leave it alone.
      if (session === undefined) return undefined;
      const state = ctx.sessionProjections.stateOf(session, PROJECTION_KEY);
      // V6: a D session with no state has no recorded consent either. Deny with
      // the bootstrap recipe instead of waving the first write through.
      if (state === null || state === undefined) return CONSENT_DENIED_BOOTSTRAP;
      if (state.consent?.status === '已确认') {
        if (isGameProject(state)) {
          const approval = state.game_approval ?? {};
          const approved = approval.status === '用户明确同意施工'
            && typeof approval.proposal_id === 'string' && approval.proposal_id.trim() !== ''
            && typeof approval.user_evidence === 'string' && approval.user_evidence.trim() !== '';
          if (!approved) return CONSENT_DENIED;
        }
        // V2: advance-on-timeout is a legitimate basis, but only with evidence on
        // record. The mode may build on defaults the clock chose; it may not
        // invent the clock. Everything else unlocks exactly as before.
        if (state.consent.basis !== '超时推进默认值') return undefined;
        const log = Array.isArray(state.auto_advance_log) ? state.auto_advance_log : [];
        if (log.length > 0) return undefined;
        return CONSENT_DENIED_TIMEOUT;
      }
      return CONSENT_DENIED;
    } catch {
      // A guard must never throw: an unreadable state allows the call.
      return undefined;
    }
  };
}

/** First-phase controlled delegation: read-only tasks only, no GPT-6 routes. */
const DELEGATE_KINDS = ['research', 'analysis', 'review'];
const DELEGATE_PRESETS = {
  research: 'd-construction-research',
  analysis: 'd-construction-analysis',
  review: 'd-construction-review',
};
const DELEGATE_DEFAULTS = {
  research: { provider: '', model: '', maxTokens: 32768 },
  analysis: { provider: '', model: '', maxTokens: 32768 },
  review: { provider: '', model: '', maxTokens: 32768 },
};
function delegateRoutes(config) {
  const rawRoutes = config?.delegateRoutes;
  const out = {};
  for (const kind of DELEGATE_KINDS) {
    const raw = rawRoutes?.[kind];
    const base = DELEGATE_DEFAULTS[kind];
    out[kind] = {
      provider: text(raw?.provider) ?? base.provider,
      model: text(raw?.model) ?? base.model,
      maxTokens: Number.isSafeInteger(raw?.maxTokens) && raw.maxTokens > 0 ? raw.maxTokens : base.maxTokens,
    };
  }
  return out;
}
function delegateText(blocks) {
  return Array.isArray(blocks) ? blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\\n').trim() : '';
}
async function writeDelegateRun(cwd, record) {
  if (!cwd) return '';
  try {
    const dir = join(cwd, '.d-construction');
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'runs.jsonl');
    await appendFile(path, `${JSON.stringify(record)}\\n`, 'utf8');
    return path;
  } catch {
    return '';
  }
}
function delegateTool(ctx, config) {
  const routes = delegateRoutes(config);
  const budget = {
    maxTasks: Number.isSafeInteger(config?.delegateBudget?.maxTasks) && config.delegateBudget.maxTasks > 0 ? config.delegateBudget.maxTasks : 6,
    maxTokens: Number.isSafeInteger(config?.delegateBudget?.maxTokens) && config.delegateBudget.maxTokens > 0 ? config.delegateBudget.maxTokens : 131072,
  };
  let startedTasks = 0;
  let reservedTokens = 0;
  return {
    name: 'd_delegate',
    description: '落地流受控只读委派：research、analysis、review。按配置选择低成本 Provider/Model，禁止写正式项目、递归委派和 GPT-6A。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: DELEGATE_KINDS },
        task: { type: 'string', description: '独立完整的任务说明，不依赖主会话历史。' },
        cwd: { type: 'string', description: '可选的只读任务目录。' },
        max_tokens: { type: 'integer', minimum: 256, maximum: 131072 },
      },
      required: ['kind', 'task'],
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        task_id: { type: 'string' }, kind: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' },
        result: { type: 'string' }, stop_reason: { type: 'string' }, ledger_path: { type: 'string' },
      }, required: ['task_id', 'kind', 'provider', 'model', 'result', 'stop_reason', 'ledger_path'] },
      render: (_args, value) => [{ type: 'text', text: `受控委派 ${value.task_id}：${value.kind} → ${value.provider}/${value.model}\\n${value.result}` }],
    },
    presentCall: (args) => ({ card: 'generic', title: '落地流受控委派', kind: 'other', rawInput: args }),
    async execute(args, exec) {
      const kind = text(args?.kind);
      const task = text(args?.task);
      if (!DELEGATE_KINDS.includes(kind) || !task) throw new Error('d_delegate 只接受 research、analysis、review 三类非空只读任务');
      const route = routes[kind];
      if (!route.provider || !route.model) throw new Error(`没有登记 ${kind} 的真实 Provider/Model，先在配置中填入低成本中转`);
      const parent = exec?.agent;
      if (!parent) throw new Error('d_delegate requires an owning agent');
      const cwd = text(args.cwd) ?? parent.session?.header?.cwd ?? '';
      const requested = Number(args.max_tokens);
      const maxTokens = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, route.maxTokens) : route.maxTokens;
      if (startedTasks >= budget.maxTasks) throw new Error(`d_delegate 已达到本轮任务上限 ${budget.maxTasks}`);
      if (reservedTokens + maxTokens > budget.maxTokens) throw new Error(`d_delegate 预留输出上限会超过本轮额度 ${budget.maxTokens} tokens`);
      startedTasks += 1;
      reservedTokens += maxTokens;
      const taskId = `delegate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const activation = await ctx.subagents.startActivation({
        provider: 'spawn', label: `落地流 ${kind} ${taskId}`, delivery: 'caller', signal: exec.signal,
        request: {
          parent, cwd, agentPreset: DELEGATE_PRESETS[kind], maxDepth: 0,
          prompt: [{ type: 'text', text: `你是落地流的只读子任务代理。只完成当前任务，不修改正式项目，不调用其他子代理，不填主会话 d_state。\\n任务类型：${kind}\\n任务编号：${taskId}\\n任务：${task}\\n回传：结论、证据路径、核验结果、剩余问题。` }],
          agentOptions: { provider: route.provider, model: route.model, maxTokens },
        },
      });
      let result;
      try { result = await activation.result; } finally { await activation.dispose().catch(() => {}); }
      const record = {
        run_id: taskId, task_kind: kind, parent_session_id: parent.id ?? null, child_session_id: activation.childId ?? null,
        provider: route.provider, requested_model: route.model, max_tokens: maxTokens,
        started_at: new Date().toISOString(), stop_reason: result?.stopReason ?? 'error',
        input_tokens: null, output_tokens: null, usage_source: 'not-exposed-by-activation-result', verified: false,
      };
      const ledgerPath = await writeDelegateRun(cwd, record);
      return { task_id: taskId, kind, provider: route.provider, model: route.model, result: delegateText(result?.output) || result?.diagnostic || '', stop_reason: record.stop_reason, ledger_path: ledgerPath };
    },
  };
}

/**
 * Mount the prompt section, the state projection and the `d_state` tool on the
 * calling (preset) scope. All three registrations are effects of that scope, so
 * they disappear with the preset's generation.
 *
 * The bundle also carries a top-level profile row for this package so the
 * browser half is discovered; that row passes `config.inert` and stays a no-op,
 * because a host-scope registration would leak the D mode into every preset.
 *
 * @param ctx - registrant context carrying systemPrompt, tools and sessionProjections.
 * @param config - the loader row's config; `{ inert: true }` disables the host half.
 */
export function apply(ctx, config) {
  if (config?.inert === true) return;

  ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: loadPrompt(),
  });

  ctx.sessionProjections.register({
    key: PROJECTION_KEY,
    stateSchema: identitySchema,
    stateVersion: 1,
    init: () => null,
    apply: (state, event) => {
      try {
        if (event?.type !== 'tool/call') return state;
        const data = event.data;
        if (data === null || typeof data !== 'object') return state;
        if (data.name !== TOOL_NAME) return state;
        return mergeState(state, data.arguments);
      } catch {
        // `apply` runs inside the append publication path and must never throw.
        return state;
      }
    },
    wire: {
      viewSchema: identitySchema,
      view: (state) => toView(state),
    },
  });

  ctx.tools.register(delegateTool(ctx, config));
  ctx.tools.register(stateTool(ctx));
  if (typeof ctx.tools.restrict === 'function') {
    ctx.tools.restrict({ deny: ['subagent', 'subagent_fork', 'workflow', 'send_message', 'interrupt_agent', 'list_agents'] });
  }

  // The construction lock: no consent, no build — enforced by the engine, not by
  // the model's goodwill. `guard` returns a disposer bound to this preset scope.
  ctx.tools.guard(consentGuard(ctx));
}
