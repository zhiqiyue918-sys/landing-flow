/**
 * Prompt audit for @local/dsh-deep-construction.
 *
 * The resident prompt (`prompt/d-mode.md`) is paid for on every single turn, and
 * much of it restates what a skill already says in full. This tool measures that
 * instead of guessing, so slimming is a decision with numbers behind it:
 *
 *   node tools/prompt-audit.mjs            # summary + deletion candidates
 *   node tools/prompt-audit.mjs --json     # machine-readable
 *   node tools/prompt-audit.mjs --min 0.5  # looser candidate threshold
 *
 * Method: split d-mode.md into paragraphs (blank-line separated). For each
 * paragraph, take every 12-character shingle and ask whether *any* skill contains
 * it. A paragraph whose shingles are mostly found in the skills is already
 * covered there — deleting it from the resident prompt costs no rule, it only
 * removes a second copy that has to be kept in sync by hand.
 *
 * Nothing is edited here. It reports; a human (or a later, deliberate commit)
 * decides.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROMPT = join(ROOT, 'prompt', 'd-mode.md');
const SKILLS_DIR = join(ROOT, 'skills');
const SHINGLE = 12;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const minArg = args.indexOf('--min');
const MIN_COVERAGE = minArg >= 0 ? Number(args[minArg + 1]) : 0.6;

const normalize = (text) => text.replace(/\s+/g, '');
const shingles = (text) => {
  const flat = normalize(text);
  const out = new Set();
  for (let i = 0; i + SHINGLE <= flat.length; i += 1) out.add(flat.slice(i, i + SHINGLE));
  return out;
};

function skillFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...skillFiles(path));
    else if (basename(path) === 'SKILL.md') out.push(path);
  }
  return out;
}

const skills = skillFiles(SKILLS_DIR).map((path) => {
  const body = readFileSync(path, 'utf8');
  const name = basename(dirname(path));
  return { name, path, chars: normalize(body).length, set: shingles(body) };
});

const skillUnion = new Set();
for (const skill of skills) for (const shingle of skill.set) skillUnion.add(shingle);

const promptRaw = readFileSync(PROMPT, 'utf8');
const lines = promptRaw.split(/\r?\n/);
const promptSet = shingles(promptRaw);

// The other direction, and the one that decides *where* a rule should live:
// how much of each skill is already sitting in the resident prompt verbatim.
// High here means the skill is paying twice for the same sentence — the rule is
// read every turn AND read again on load, and any edit has to land twice.
for (const skill of skills) {
  let hit = 0;
  for (const shingle of skill.set) if (promptSet.has(shingle)) hit += 1;
  skill.inPrompt = skill.set.size === 0 ? 0 : hit / skill.set.size;
}

// Paragraphs, with the 1-based line range they occupy.
const paragraphs = [];
let buffer = [];
let start = 0;
lines.forEach((line, index) => {
  if (line.trim() === '') {
    if (buffer.length > 0) {
      paragraphs.push({ from: start, to: index, text: buffer.join('\n') });
      buffer = [];
    }
  } else {
    if (buffer.length === 0) start = index + 1;
    buffer.push(line);
  }
});
if (buffer.length > 0) paragraphs.push({ from: start, to: lines.length, text: buffer.join('\n') });

const rows = paragraphs
  .map((para) => {
    const own = shingles(para.text);
    const chars = normalize(para.text).length;
    let hit = 0;
    for (const shingle of own) if (skillUnion.has(shingle)) hit += 1;
    const coverage = own.size === 0 ? 0 : hit / own.size;
    return { ...para, chars, coverage };
  })
  .filter((row) => row.chars >= 40);

const candidates = rows
  .filter((row) => row.coverage >= MIN_COVERAGE)
  .sort((a, b) => b.chars * b.coverage - a.chars * a.coverage);

const promptChars = normalize(promptRaw).length;
// Chinese prose runs roughly 0.6 tokens per character; good enough to compare
// options, not to quote as billing.
const approxTokens = (chars) => Math.round(chars * 0.62);

const report = {
  prompt: { path: PROMPT, lines: lines.length, chars: promptChars, approxTokens: approxTokens(promptChars) },
  skills: skills
    .map(({ name, chars, inPrompt }) => ({ name, chars, approxTokens: approxTokens(chars), inPrompt: Number(inPrompt.toFixed(3)) }))
    .sort((a, b) => b.chars - a.chars),
  skillCharsTotal: skills.reduce((sum, skill) => sum + skill.chars, 0),
  candidates: candidates.map((row) => ({
    from: row.from, to: row.to, chars: row.chars, coverage: Number(row.coverage.toFixed(2)),
    head: row.text.split('\n')[0].slice(0, 60),
  })),
  reclaim: {
    chars: candidates.reduce((sum, row) => sum + row.chars, 0),
    approxTokens: approxTokens(candidates.reduce((sum, row) => sum + row.chars, 0)),
  },
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`resident prompt : ${report.prompt.lines} lines / ${promptChars} chars ≈ ${report.prompt.approxTokens} tokens (paid every turn)`);
  console.log(`skills total    : ${report.skillCharsTotal} chars across ${report.skills.length} files (loaded on demand)`);
  console.log('');
  console.log('per-skill size (largest first, "in prompt" = share of it already resident):');
  for (const skill of report.skills.slice(0, 10)) {
    console.log(`  ${skill.name.padEnd(40)} ${String(skill.chars).padStart(6)} chars ≈ ${skill.approxTokens.toString().padStart(5)} tok  ${(skill.inPrompt * 100).toFixed(0).padStart(3)}% resident`);
  }
  console.log('');
  console.log(`paragraphs already covered by a skill (≥${Math.round(MIN_COVERAGE * 100)}%): ${report.candidates.length}`);
  console.log(`reclaimable if dropped: ${report.reclaim.chars} chars ≈ ${report.reclaim.approxTokens} tokens per turn`);
  console.log('(small by design: the prompt is mostly unique prose. The duplication runs the other way —');
  console.log(' skills restate the prompt, so rules have to be edited in two places. See "in prompt" above.)');
  console.log('');
  for (const row of report.candidates.slice(0, 20)) {
    console.log(`  L${String(row.from).padStart(3)}-${String(row.to).padEnd(3)} ${String(row.chars).padStart(4)}字 ${(row.coverage * 100).toFixed(0).padStart(3)}%  ${row.head}`);
  }
  if (report.candidates.length > 20) console.log(`  … ${report.candidates.length - 20} more (use --json)`);
}
