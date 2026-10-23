import assert from 'node:assert/strict';
import { mergeState, toView } from '../index.js';

const incomplete = mergeState(null, {
  project_goal: '制作一个小游戏',
  current_stage: 'COMPLETE',
});
assert.equal(incomplete.current_stage, 'ACCEPTANCE');
assert.match(incomplete.stage_note, /gameplay_review\.playtest_path/);
assert.match(incomplete.stage_note, /visual_review\.runtime_screenshot/);

const complete = mergeState(incomplete, {
  gameplay_review: {
    playtest_path: 'node game.mjs; keyboard WASD;真实操作路径记录 playtest.md',
    loop_observation: '三轮分别为 8s/9s/11s，升级后目标变化',
    branch_evidence: '选择 A 得到范围攻击，选择 B 得到位移；结果截图对照',
    retry_observation: '失败后 3 秒内按 R 重开',
    replay_hook: '解锁分支技能后想再跑一次，记录于 playtest.md',
  },
  visual_review: {
    runtime_screenshot: 'artifacts/runtime-v2.png',
    hierarchy_review: '目标与主操作首屏可见，HUD 不遮挡角色',
    visual_rounds: '2 轮：首轮发现 HUD 遮挡；调整后复拍',
    ui_findings: '移开 HUD 并提高按钮对比度，见 diff',
    retest_result: '相同入口复测，HUD 不再遮挡操作区',
  },
  current_stage: 'COMPLETE',
});
assert.equal(complete.current_stage, 'COMPLETE');
const view = toView(complete);
assert.match(view.gameplayReview.replay_hook, /想再跑一次/);
assert.match(view.visualReview.runtime_screenshot, /runtime-v2/);

const nonGame = mergeState(null, { project_goal: '本地文件整理 CLI', current_stage: 'COMPLETE' });
assert.equal(nonGame.current_stage, 'COMPLETE');
console.log('PASS game acceptance hard gate, evidence projection, and non-game compatibility');
