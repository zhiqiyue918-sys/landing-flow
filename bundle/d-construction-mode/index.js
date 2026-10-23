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
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'deep-construction';

/** Services this plugin consumes; it provides none, so no isolate realm is needed. */
export const inject = ['systemPrompt', 'tools', 'sessionProjections'];

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
const DESIGN_BASIS_FIELDS = ['definition', 'motivation', 'meaning', 'structure', 'time_logic'];
const GAMEPLAY_REVIEW_FIELDS = ['playtest_path', 'loop_observation', 'branch_evidence', 'retry_observation', 'replay_hook'];
const VISUAL_REVIEW_FIELDS = ['runtime_screenshot', 'hierarchy_review', 'visual_rounds', 'ui_findings', 'retest_result'];

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
    research: { status: null, sources_used: [], conclusion: null },
    decisions: [],
    construction_brief: {},
    experience_contract: { first_10s: null, first_60s: null, first_5min: null, screen: null, feedback: null },
    benchmarks: [],
    surfaces: [],
    design_basis: {
      definition: null, motivation: null, meaning: null, structure: null, time_logic: null,
    },
    gameplay_review: Object.fromEntries(GAMEPLAY_REVIEW_FIELDS.map((field) => [field, null])),
    visual_review: Object.fromEntries(VISUAL_REVIEW_FIELDS.map((field) => [field, null])),
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

  const pending = recordList(raw.pending_user_decisions, 'question', {
    question: [], status: PENDING_STATUSES,
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

  const gaps = recordList(raw.surfaces, 'area', {
    area: [], level: SURFACE_LEVELS, form: [], source: SURFACE_SOURCES,
  });
  if (gaps !== undefined) next.surfaces = gaps;

  // Zero-to-one pre-design pack: definition, motivation, meaning, structure and
  // the time/state logic that must exist before a Brief can be confirmed.
  if (raw.design_basis !== null && typeof raw.design_basis === 'object'
    && !Array.isArray(raw.design_basis)) {
    const basis = { ...(base.design_basis ?? {}) };
    for (const field of DESIGN_BASIS_FIELDS) {
      const value = text(raw.design_basis[field]);
      if (value !== undefined) basis[field] = value;
    }
    next.design_basis = basis;
  }

  for (const [field, keys] of [['gameplay_review', GAMEPLAY_REVIEW_FIELDS], ['visual_review', VISUAL_REVIEW_FIELDS]]) {
    if (raw[field] !== null && typeof raw[field] === 'object' && !Array.isArray(raw[field])) {
      const review = { ...(base[field] ?? {}) };
      for (const key of keys) {
        const value = text(raw[field][key]);
        if (value !== undefined) review[key] = value;
      }
      next[field] = review;
    }
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

  const requestedStage = text(raw.current_stage);
  const goalText = `${next.project_goal ?? ''} ${next.construction_brief?.final_goal ?? ''} ${next.construction_brief?.product_form ?? ''}`;
  const isGame = /游戏|game|mod\b|小游戏|关卡|玩家/i.test(goalText);
  if (isGame && requestedStage === 'COMPLETE') {
    const missing = [
      ...GAMEPLAY_REVIEW_FIELDS.filter((field) => !text(next.gameplay_review?.[field])).map((field) => `gameplay_review.${field}`),
      ...VISUAL_REVIEW_FIELDS.filter((field) => !text(next.visual_review?.[field])).map((field) => `visual_review.${field}`),
    ];
    if (missing.length > 0) {
      next.current_stage = 'ACCEPTANCE';
      next.stage_note = `游戏体验验收未闭环，缺少：${missing.join('、')}`;
      next.progress_signal = '体验硬门未通过：补齐真实试玩与视觉/UI证据后再申请 COMPLETE';
    }
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
export function toView(state) {
  if (state === null || state === undefined) return null;
  return {
    goal: state.project_goal ?? null,
    stage: state.current_stage ?? null,
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
    gameplayReview: { ...(state.gameplay_review ?? {}) },
    visualReview: { ...(state.visual_review ?? {}) },
    benchmarks: tail(state.benchmarks, 5).map((row) => ({
      work: row.work, what: row.what ?? null, source: row.source ?? null,
    })),
    surfaces: (state.surfaces ?? []).map((row) => ({
      area: row.area, level: row.level ?? null, form: row.form ?? null, source: row.source ?? null,
    })),
    basis: {
      definition: state.design_basis?.definition ?? null,
      motivation: state.design_basis?.motivation ?? null,
      meaning: state.design_basis?.meaning ?? null,
      structure: state.design_basis?.structure ?? null,
      time_logic: state.design_basis?.time_logic ?? null,
    },
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
      .map((row) => ({ question: row.question, status: row.status ?? null })),
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
      '面向人的交付还要写 experience_contract（前 10 秒 / 前 60 秒 / 前 5 分钟 / 常驻画面 / 每次操作的声画反馈）、benchmarks（品类与领域对标来源）、surfaces（交付面清单：玩法/数值/美术/音频/内容/领域等每个板块的能力、形式与来源）、design_basis（零到一前置设计包）、以及 final_acceptance.user_only（只有用户说"是"才算过的验收项）。游戏还必须写 gameplay_review 与 visual_review 的真实运行证据；current_stage=COMPLETE 时宿主会检查这些硬门。',
      '部分更新：标量字段传了就覆盖；对象字段按键合并；数组字段整表替换，因此传入数组时必须给出该字段的完整当前列表。',
      '它驱动全链 Pipeline View，也是长任务中不依赖聊天记录的真实状态。',
      '调用时点：开局判定后、需求收敛后、技术决策后、计划确定后、每个模块开始/完成/阻塞时、每轮验证后、每轮 Repair 后、用户中途修改要求后、阶段切换时、最终验收时。',
    ].join(''),
    parameters: spec({
      project_goal: optional({ type: 'string' }, '一句话最终目标。'),
      current_stage: optional({
        type: 'string', enum: STAGES,
      }, '当前状态机阶段。游戏类型任务进入 COMPLETE 前必须满足 gameplay_review 与 visual_review 的宿主硬门；否则阶段保持 ACCEPTANCE。'),
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
      }), '等待用户决定的事项（整表替换）。'),
      intake: optional(spec({
        status: { type: 'string', enum: INTAKE_STATUSES, description: '未开始 / 已发出 / 已回答 ——「一次问全」的进度。' },
        autonomy: { type: 'string', enum: AUTONOMY, description: '未授权 / 已授权 ——用户答完一次问全后记为「已授权」，此后不得为同类问题再开一轮。' },
        note: { type: 'string', description: '一次问全覆盖了什么、还有什么留给后续。' },
      }), '一次问全与自主授权（按键合并）。'),
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
        form: { type: 'string', description: '本次采用的具体形式（例：纯几何 + 程序化配色 / WebAudio 合成音效 / 自研曲线并附来源）。' },
        source: { type: 'string', enum: SURFACE_SOURCES, description: '这个板块的参考或素材从哪来：对标（外部作品/权威做法）/ 自产 / 用户提供 / 已授权自主。level 为 弱 或 无 时，source 必须是 用户提供 或 已授权自主，否则禁止进入 BUILD。' },
      }), '交付面清单（整表替换）。板块不得静默留空：弱项要么拿到用户提供的参考/素材，要么拿到"随便你"的明确授权。'),
      design_basis: optional(spec({
        definition: { type: 'string', description: '这个品类/产品是什么：定义与边界（例：什么算肉鸽、什么算增量；什么算学习产品）。先定义再设计。' },
        motivation: { type: 'string', description: '人为什么玩/用：乐趣或价值来源，以及取向光谱与本次选择（例：硬核↔纯爽、应试↔沉浸↔打卡）。' },
        meaning: { type: 'string', description: '它对用户意味着什么：第一次使用结束时处在什么状态、为什么会回来、可玩/可用时长目标。' },
        structure: { type: 'string', description: '产品结构分解：内容侧 / 交互与 UI 侧 / 数据与存储侧 / 前后端与工程侧 / 平台与分发侧，各自包含什么、哪些做、哪些不做。' },
        time_logic: { type: 'string', description: '时间与状态逻辑：是否依赖系统时间/日期、跨天与连续性、时区、离线结算、复习/刷新节奏等。' },
      }), '零到一前置设计包（按键合并）。Brief 确认前必须写出；缺项说明设计思考没做完。'),
      gameplay_review: optional(spec({
        playtest_path: { type: 'string', description: '游戏真实运行入口与实际操作路径，不能只写测试函数调用。' },
        loop_observation: { type: 'string', description: '至少三次核心循环的实际观察：动作、决策、反馈、奖励与循环时长。' },
        branch_evidence: { type: 'string', description: '两种不同选择导致不同结果的实测对照；无分支游戏须写明设计理由与替代变化。' },
        retry_observation: { type: 'string', description: '失败到重新开始的实测路径与耗时；没有失败机制写明不适用及依据。' },
        replay_hook: { type: 'string', description: '具体的再次游玩诱因及证据；无法指出时写未成立。' },
      }), '游戏玩法试玩证据；没有真实运行记录时不得声称产品级验收通过。'),
      visual_review: optional(spec({
        runtime_screenshot: { type: 'string', description: '用户实际运行入口截取的画面证据路径；独立渲染图不能替代。' },
        hierarchy_review: { type: 'string', description: '首屏目标、状态、主操作的信息层级与实际截图结论。' },
        visual_rounds: { type: 'string', description: '渲染→实际看图→指出差距→改动→再渲染的迭代证据，记明轮数和改动。' },
        ui_findings: { type: 'string', description: '主界面/HUD/暂停/结果等适用界面的具体缺陷与修复结果。' },
        retest_result: { type: 'string', description: '视觉或 UI 修复后的同一路径复测结果；无视觉能力时须明确待用户看图。' },
      }), '游戏视觉/UI 审查证据；以真实运行截图为准。'),
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
    }),
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string' },
          state_path: { type: 'string' },
        },
        required: ['summary', 'state_path'],
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
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
      const current = ctx.sessionProjections.stateOf(session, PROJECTION_KEY) ?? null;
      const merged = mergeState(current, args);
      const requestedStage = text(args.current_stage);
      const statePath = await mirrorState(session.header?.cwd, merged);
      const modules = merged.modules ?? [];
      const done = modules.filter((row) => row.status === '已完成').length;
      const openBlockers = (merged.blockers ?? []).length;
      const pending = (merged.pending_user_decisions ?? [])
        .filter((row) => row.status !== '已确认').length;
      const openRepairs = (merged.repair_history ?? [])
        .filter((row) => row.progress !== 'PASS').length;
      const summary = [
        `深度施工状态已更新：阶段 ${merged.current_stage ?? '未设置'}`,
        `模块 ${done}/${modules.length}`,
        `计划 ${(merged.plan ?? []).length} 项`,
        `变更项 ${(merged.change_items ?? []).length} 项`,
        `未闭环 Repair ${openRepairs} 轮`,
        `阻塞 ${openBlockers} 项`,
        `待你决定 ${pending} 项`,
        statePath === '' ? '（项目镜像未写入）' : `（项目镜像 ${statePath}）`,
      ].join('；');
      return { summary, state_path: statePath };
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

  ctx.tools.register(stateTool(ctx));
}
