/**
 * Packaging tests for the @local/dsh-deep-construction bundle.
 *
 * Runs with the bundled Node.js, no dependencies:
 *   node tests/package.test.mjs
 *
 * These check the artifact as shipped — manifest, patch declaration, skill
 * front matter, locale dictionaries, prompt charter and icon limits — without
 * mounting it into a profile (the Loader's own parse is proven by the active
 * `preset-d-construction` row reported by `plugin_manager`).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

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

// ------------------------------------------------------------------- manifest
const manifest = JSON.parse(read('package.json'));

check('manifest: bundle patch, web client half and resolvable exports', () => {
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.equal(manifest.dsh.client.immediately, true);
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'),
    'the dock declarer must load before this plugin activates');
  for (const entry of ['.', './client', './package.json', './cordis.patch.yml', './locale/*.json']) {
    assert.ok(manifest.exports[entry], `exports must expose ${entry}`);
  }
  assert.ok(manifest.icon, 'display metadata needs a top-level icon');
  assert.ok(!manifest.dependencies, 'shipped packages resolve from the dsh installation — no dependencies');
});

check('manifest: the icon exists, stays inside the package and under 256 KiB', () => {
  const icon = statSync(join(root, manifest.icon));
  assert.ok(icon.isFile());
  assert.ok(icon.size <= 262144, `icon is ${icon.size} bytes`);
  assert.match(read(manifest.icon), /^<svg/);
});

check('manifest: files list ships the runtime assets', () => {
  for (const entry of ['index.js', 'client.js', 'cordis.patch.yml', 'prompt', 'skills', 'locale']) {
    assert.ok(manifest.files.includes(entry), `files must include ${entry}`);
  }
});

// ---------------------------------------------------------------------- patch
const patch = read('cordis.patch.yml');

check('patch: declares the preset row with the roster identity the Client shows', () => {
  assert.match(patch, /id: preset-d-construction/);
  assert.match(patch, /name: '@deepseek-ai\/dsh-agent-preset'/);
  assert.match(patch, /id: d-construction/);
  assert.match(patch, /name: 落地流/);
  assert.match(patch, /order: 10/);
  assert.match(patch, /description: /);
});

check('patch: mounts the D host half inside the preset, never at host scope', () => {
  const inertIndex = patch.indexOf('config:\n        inert: true');
  const presetIndex = patch.indexOf('id: preset-d-construction');
  assert.ok(inertIndex !== -1, 'the top-level row must be inert');
  assert.ok(inertIndex < presetIndex, 'the client-only row comes first');
  const hostRows = patch.match(/name: '@local\/dsh-deep-construction'$/gm) ?? [];
  assert.equal(hostRows.length, 2, 'one client-only host row plus one preset-scoped row');
  assert.match(patch, /- id: deep-construction\n            name: '@local\/dsh-deep-construction'/);
});

check('patch: resolves this package\'s own skills directory through the loader expression', () => {
  assert.match(patch, /customSkillDirs:/);
  const expression = /createRequire\(baseUrl\)\.resolve\('@local\/dsh-deep-construction\/package\.json'\)/.exec(patch);
  assert.ok(expression, 'the skills directory must resolve from the installed package, not from a preset path');
  assert.ok(patch.includes("'skills'"), 'the resolved directory is joined with skills/');
});

check('patch: the loaded package resolves its own name (what customSkillDirs depends on)', () => {
  const resolved = createRequire(import.meta.url).resolve('@local/dsh-deep-construction/package.json');
  assert.equal(resolved, join(root, 'package.json'), 'a package can self-reference only with name + exports');
  assert.ok(statSync(join(dirname(resolved), 'skills')).isDirectory());
});

check('patch: every required capability is mounted exactly once', () => {
  const required = [
    'tool-pwsh', 'tool-bash', 'tool-fs', 'tool-fs-search', 'tool-jobs', 'tool-workspace-dependencies',
    'persona', 'agent-instructions', 'command-goal', 'tool-goal', 'tool-ask-user', 'tool-todo',
    'tool-web', 'present', 'compaction-basic', 'command-compact', 'tool-result-pruner',
    'tool-subagent', 'tool-subagent-fork', 'workflow-ptc', 'tool-workflow',
    'skill-filesystem', 'tool-skill', 'deep-construction',
  ];
  for (const id of required) {
    const matches = patch.match(new RegExp(`^\\s+- id: ${id}$`, 'gm')) ?? [];
    assert.equal(matches.length, 1, `row ${id} must appear exactly once (found ${matches.length})`);
  }
  const disabled = patch.match(/disabled: !!js/g) ?? [];
  assert.equal(disabled.length, 3, 'two platform-conditional shell rows plus the payload-gated dependencies row');
  // A row whose plugin declares a required Config must carry it: a missing one
  // fails that row's activation and takes the whole preset declaration down —
  // observed live as "加载失败 / invalid config: $.source missing required value".
  assert.match(
    patch,
    /id: tool-workspace-dependencies[\s\S]{0,1500}?config:\n\s+source: !!js/,
    'tool-workspace-dependencies must be given its required source config',
  );
});

// --------------------------------------------------------------------- skills
const skillDirs = readdirSync(join(root, 'skills'));

check('skills: eight skills, each with valid front matter and a matching directory name', () => {
  assert.equal(skillDirs.length, 8, `expected 8 skills, found ${skillDirs.join(', ')}`);
  for (const dir of skillDirs) {
    const text = read(join('skills', dir, 'SKILL.md'));
    const lines = text.split('\n');
    assert.equal(lines[0], '---', `${dir}: front matter must open on line 1`);
    const end = lines.indexOf('---', 1);
    assert.ok(end > 1, `${dir}: front matter must close`);
    const front = lines.slice(1, end).join('\n');
    const name = /^name: (.+)$/m.exec(front)?.[1]?.trim();
    const description = /^description: (.+)$/m.exec(front)?.[1]?.trim();
    assert.equal(name, dir, `${dir}: front-matter name must equal the directory name`);
    assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${dir}: name grammar`);
    assert.ok(description && description.length > 40, `${dir}: description carries the routing copy`);
    assert.ok(Buffer.byteLength(text, 'utf8') > 2500, `${dir}: the skill body must be substantive`);
  }
});

check('skills: the index in the charter lists exactly the shipped skills', () => {
  const charter = read('prompt/d-mode.md');
  for (const dir of skillDirs) {
    assert.ok(charter.includes(dir), `the charter must route to ${dir}`);
    assert.ok(read(join('skills', dir, 'SKILL.md')).includes('d_state'), `${dir}: body must reference the state tool`);
  }
});

// -------------------------------------------------------------- locale + prompt
check('locale: en is the anchor and both dictionaries carry non-empty meta text', () => {
  const en = JSON.parse(read('locale/en.json'));
  const zh = JSON.parse(read('locale/zh.json'));
  for (const [tag, dict] of Object.entries({ en, zh })) {
    assert.ok(dict.meta.title.trim().length > 0, `${tag}: meta.title`);
    assert.ok(dict.meta.description.trim().length > 0, `${tag}: meta.description`);
  }
  assert.match(zh.meta.title, /落地流/);
});

check('charter: carries the twelve principles, the state machine and the receipt format', () => {
  const charter = read('prompt/d-mode.md');
  for (const marker of [
    '十二条核心原则', 'INTENT TRUTH', 'IMPLEMENTATION TRUTH', 'EXTERNAL TRUTH', 'ASSUMPTION',
    'RECEIVE', 'WAITING_USER_DECISION', 'ROOT_CAUSE_REPLAN', 'BLOCKED', 'ACCEPTANCE', 'COMPLETE',
    'd_state', '【落地流】', '不接入任何外部 Agent',
  ]) {
    assert.ok(charter.includes(marker), `charter must contain ${marker}`);
  }
  assert.ok(Buffer.byteLength(charter, 'utf8') > 12000, `charter bytes ${Buffer.byteLength(charter, 'utf8')}`);
  assert.ok(!/Chain-of-Thought|思维链/.test(charter.replace(/不展示模型隐藏推理过程|不得展示内部 Chain-of-Thought/g, '')),
    'the charter may only mention hidden reasoning to forbid showing it');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exitCode = 1;
