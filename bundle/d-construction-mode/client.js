// @local/dsh-deep-construction — browser half.
// Registers the "D｜深度施工" Pipeline View into `conversation.input.dock`
// (list, scope:"session") and reads the host-published `deepConstruction`
// session projection through the framework-injected `useProjection` hook.
// Colors come only from --dsw-alias-* theme tokens; classes are plugin-prefixed.
window.__ModuleLoader__.load({
  id: '@local/dsh-deep-construction',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'deepConstruction';

    const CSS = [
      '.dcDock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto}',
      '.dcCard{isolation:isolate;box-sizing:border-box;position:relative;width:100%;max-width:calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));margin:0 auto;border:0;border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-elevation-panel);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
      '.dcCard:before{z-index:-1;content:"";position:absolute;inset:0;border-radius:inherit;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);pointer-events:none}',
      '.dcBar{display:flex;align-items:center;gap:8px;padding:5px 6px 5px 12px}',
      '.dcGlyph{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary)}',
      '.dcTitle{flex:none;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dcChip{flex:none;display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dcChip[data-state="running"]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}',
      '.dcChip[data-state="done"]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.dcChip[data-state="wait"]{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}',
      '.dcChip[data-state="repair"]{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}',
      '.dcChip[data-state="blocked"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.dcDot{width:6px;height:6px;border-radius:50%;background:currentColor}',
      '.dcLine{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px}',
      '.dcToggle{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--dsw-radius-xs);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}',
      '.dcToggle:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dcToggle:focus-visible{outline:none;box-shadow:0 0 0 var(--dsw-focus-ring-width) var(--dsw-focus-ring-color)}',
      '.dcBody{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;padding:2px 12px 12px;max-height:300px;overflow:auto}',
      '.dcSection{min-width:0}',
      '.dcSectionTitle{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:6px 0 4px}',
      '.dcRow{display:flex;align-items:baseline;gap:6px;min-width:0}',
      '.dcStage{display:flex;align-items:baseline;gap:6px;padding:2px 0;min-width:0}',
      '.dcStageName{flex:none;color:var(--dsw-alias-label-primary);font-size:12px}',
      '.dcStageMark{flex:none;font-size:9px;color:var(--dsw-alias-border-l3)}',
      '.dcStageMark[data-active="true"]{color:var(--dsw-alias-state-business-primary)}',
      '.dcStage[data-active="true"] .dcStageName{font-weight:600}',
      '.dcActions{grid-column:1/-1;border-bottom:.5px solid var(--dsw-alias-border-l3);padding-bottom:6px}',
      '.dcActionRow{display:flex;flex-wrap:wrap;gap:6px}',
      '.dcAction{height:24px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}',
      '.dcAction:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dcAction:focus-visible{outline:none;box-shadow:0 0 0 var(--dsw-focus-ring-width) var(--dsw-focus-ring-color)}',
      '.dcActionHint{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dcStageName[data-state="void"]{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}',
      '.dcStageSummary{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px}',
      '.dcEmpty{color:var(--dsw-alias-label-tertiary);font-size:12px}',
      '.dcMono{font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dcText{color:var(--dsw-alias-label-secondary);font-size:12px;word-break:break-word}',
      '.dcGoal{color:var(--dsw-alias-label-primary);font-size:12px;padding:0 12px 8px;word-break:break-word}',
    ].join('');

    /** Map a D-mode status word to a chip data-state. */
    function stateOf(status) {
      switch (status) {
        case '通过':
        case '已完成':
          return 'done';
        case '进行中':
          return 'running';
        case '等待用户':
          return 'wait';
        case '需修复':
          return 'repair';
        case '阻塞':
          return 'blocked';
        case '作废':
          return 'void';
        default:
          return 'idle';
      }
    }

    function Glyph({ open }) {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': true,
        style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms ease' },
      }, h('path', {
        d: 'M4 6.5 8 10.5 12 6.5', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    function Mark() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('path', {
          d: 'M2 13h3V7h3v6h3V4h3', fill: 'none', stroke: 'currentColor',
          strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
        }));
    }

    function Chip({ state, children, title }) {
      return h('span', { className: 'dcChip', 'data-state': state, title },
        h('span', { className: 'dcDot' }), children);
    }

    function Section({ title, rows, empty }) {
      return h('div', { className: 'dcSection' },
        h('div', { className: 'dcSectionTitle' }, title),
        rows.length === 0
          ? h('div', { className: 'dcEmpty' }, empty)
          : rows);
    }

    /**
     * The Pipeline View. Framework props for a `conversation.input.dock` entry:
     * sessionId, useProjection, t (locale: NS), plus this entry's own inject face.
     */
    function PipelineView({ useProjection, inputActions, t }) {
      const view = useProjection(NS);
      const [open, setOpen] = React.useState(false);
      const [hint, setHint] = React.useState('');

      if (view === undefined || view === null) return null;
      const stages = Array.isArray(view.pipeline) ? view.pipeline : [];
      const modules = Array.isArray(view.modules) ? view.modules : [];
      const plan = Array.isArray(view.plan) ? view.plan : [];
      const changes = Array.isArray(view.changes) ? view.changes : [];
      const decisions = Array.isArray(view.decisions) ? view.decisions : [];
      const verification = Array.isArray(view.verification) ? view.verification : [];
      const repair = Array.isArray(view.repair) ? view.repair : [];
      const failures = Array.isArray(view.technicalFailures) ? view.technicalFailures : [];
      const artifacts = Array.isArray(view.artifacts) ? view.artifacts : [];
      const blockers = Array.isArray(view.blockers) ? view.blockers : [];
      const pending = Array.isArray(view.pending) ? view.pending : [];
      const checkpoints = Array.isArray(view.checkpoints) ? view.checkpoints : [];
      const requirements = view.requirements || { unknown: [], assumptions: [], counts: {} };
      const acceptance = view.acceptance || {};
      const experience = view.experience || {};
      const benchmarks = Array.isArray(view.benchmarks) ? view.benchmarks : [];
      const gaps = Array.isArray(view.surfaces) ? view.surfaces : [];
      const basis = view.basis || {};
      const doneModules = modules.filter((m) => m.status === '已完成').length;

      const stageChip = view.stage
        ? h(Chip, { state: stateOf(view.stageState), title: view.stageNote || view.stage }, view.stage)
        : null;
      const moduleChip = modules.length > 0
        ? h(Chip, { state: 'idle', title: t('chip.modules') }, `${t('chip.modules')} ${doneModules}/${modules.length}`)
        : null;
      const headline = view.progress || view.stageNote || '';

      const bar = h('div', { className: 'dcBar' },
        h('span', { className: 'dcGlyph' }, h(Mark)),
        h('span', { className: 'dcTitle' }, t('bar.title')),
        stageChip,
        moduleChip,
        h('span', { className: 'dcLine', title: headline }, headline),
        h('button', {
          type: 'button', className: 'dcToggle',
          'aria-expanded': open,
          'aria-label': open ? t('bar.collapse') : t('bar.expand'),
          onClick: () => { setOpen((value) => !value); },
        }, h(Glyph, { open })));

      // §61: the minimal user-intervention entry points. Each button only
      // *prefills* the composer — the user still presses Enter, so the panel can
      // never send a message on its own.
      const canAct = typeof inputActions?.setDraft === 'function';
      const draft = (text) => () => {
        if (!canAct) return;
        try {
          inputActions.setDraft(text);
          setHint(t('action.hint'));
        } catch {
          setHint(t('action.failed'));
        }
      };
      const actions = !canAct ? null : h('div', { className: 'dcActions' },
        h('span', { className: 'dcSectionTitle' }, t('section.actions')),
        h('div', { className: 'dcActionRow' },
          h('button', { type: 'button', className: 'dcAction', onClick: draft('确认 ConstructionBrief，按它开工。做到范围上限就停下汇报。') }, t('action.confirm')),
          h('button', { type: 'button', className: 'dcAction', onClick: draft('暂停当前工作，先不要继续；把当前状态与卡点告诉我。') }, t('action.pause')),
          h('button', { type: 'button', className: 'dcAction', onClick: draft('只审计当前实现，列出问题与证据，不要修改任何文件。') }, t('action.auditOnly')),
          h('button', { type: 'button', className: 'dcAction', onClick: draft('请回滚到最近的 checkpoint，然后重新判断下一步。') }, t('action.rollback'))),
        hint === '' ? null : h('div', { className: 'dcActionHint' }, hint));

      const body = !open ? null : h('div', { className: 'dcBody' },
        actions,
        h(Section, {
          title: t('section.stages'),
          empty: t('empty.stages'),
          rows: stages.map((stage, index) => h('div', {
            className: 'dcStage', key: `${stage.stage}-${index}`, 'data-active': stage.active === true ? 'true' : 'false',
          },
          h('span', { className: 'dcStageMark', 'data-active': stage.active === true ? 'true' : 'false' }, stage.active === true ? '●' : '○'),
          h('span', { className: 'dcStageName', 'data-state': stateOf(stage.status) }, stage.stage),
          h('span', { className: 'dcStageSummary', title: stage.summary || '' }, stage.summary || stage.status || ''))),
        }),
        h(Section, {
          title: t('section.basis'),
          empty: t('empty.basis'),
          rows: [['definition', 'basis.definition'], ['motivation', 'basis.motivation'], ['meaning', 'basis.meaning'], ['structure', 'basis.structure'], ['time_logic', 'basis.time']]
            .filter(([field]) => basis[field])
            .map(([field, key]) => h('div', { key: field, className: 'dcText' },
              h('span', { className: 'dcMono' }, t(key)), ' ',
              h('span', null, basis[field]))),
        }),
        h(Section, {
          title: t('section.experience'),
          empty: t('empty.experience'),
          rows: [['first_10s', 'exp.first10'], ['first_60s', 'exp.first60'], ['first_5min', 'exp.first5'], ['screen', 'exp.screen'], ['feedback', 'exp.feedback']]
            .filter(([field]) => experience[field])
            .map(([field, key]) => h('div', { key: field, className: 'dcText' },
              h('span', { className: 'dcMono' }, t(key)), ' ',
              h('span', null, experience[field]))),
        }),
        h(Section, {
          title: '游戏核心循环试玩证据',
          empty: '尚无真实游戏试玩证据',
          rows: Object.entries(view.gameplayReview || {}).filter(([, value]) => value).map(([key, value]) => h('div', { key, className: 'dcText' },
            h('span', { className: 'dcMono' }, key), ' ', h('span', null, value))),
        }),
        h(Section, {
          title: '游戏视觉与 UI 审查',
          empty: '尚无实机截图与视觉/UI返修证据',
          rows: Object.entries(view.visualReview || {}).filter(([, value]) => value).map(([key, value]) => h('div', { key, className: 'dcText' },
            h('span', { className: 'dcMono' }, key), ' ', h('span', null, value))),
        }),
        h(Section, {
          title: t('section.benchmarks'),
          empty: t('empty.benchmarks'),
          rows: benchmarks.map((item, index) => h('div', { key: `bm-${index}`, className: 'dcText' },
            h('span', { className: 'dcMono' }, item.work || ''), ' ',
            h('span', null, item.what || ''),
            item.source ? h('span', { className: 'dcStageSummary' }, ` — ${item.source}`) : null)),
        }),
        h(Section, {
          title: t('section.gaps'),
          empty: t('empty.gaps'),
          rows: gaps.map((item, index) => h('div', {
            key: `gap-${index}`, className: 'dcText',
            'data-unsourced': (item.level === '弱' || item.level === '无') && item.source === '对标' ? 'true' : 'false',
          },
          h('span', { className: 'dcMono' }, `${item.area || ''}${item.level ? `[${item.level}]` : ''}`),
          item.source ? h('span', { className: 'dcMono' }, ` ${item.source}`) : null, ' ',
          h('span', null, item.form || ''))),
        }),
        h(Section, {
          title: t('section.modules'),
          empty: t('empty.modules'),
          rows: modules.map((module, index) => h('div', { className: 'dcStage', key: `${module.name}-${index}` },
            h('span', { className: 'dcStageName', 'data-state': stateOf(module.status) }, module.name),
            h('span', { className: 'dcStageSummary', title: module.note || '' }, module.note || module.status || ''))),
        }),
        h(Section, {
          title: t('section.plan'),
          empty: t('empty.plan'),
          rows: plan.map((step, index) => h('div', { className: 'dcStage', key: `p-${index}` },
            h('span', { className: 'dcMono' }, step.step_id || ''),
            h('span', { className: 'dcStageName', 'data-state': stateOf(step.status) }, step.title || ''),
            h('span', { className: 'dcStageSummary' }, step.status || ''),
            view.currentStep && step.step_id === view.currentStep
              ? h('span', { className: 'dcMono', 'data-active': 'true' }, ` ${t('plan.current')}`) : null)),
        }),
        h(Section, {
          title: t('section.changes'),
          empty: t('empty.changes'),
          rows: changes.map((item, index) => h('div', { key: `ch-${index}`, className: 'dcText' },
            h('span', { className: 'dcMono' }, `${item.id || ''} [${item.kind || '-'}]`), ' ',
            h('span', null, item.title || ''),
            h('span', { className: 'dcStageSummary' }, ` — ${item.classification || item.status || ''}`))),
        }),
        h(Section, {
          title: t('section.decisions'),
          empty: t('empty.decisions'),
          rows: decisions.map((decision, index) => h('div', { key: `d-${index}`, className: 'dcText' },
            h('span', { className: 'dcMono' }, decision.decision_id || ''), ' ',
            h('span', null, decision.choice || ''),
            decision.date ? h('span', { className: 'dcMono' }, ` ${decision.date}`) : null,
            decision.reason ? h('span', { className: 'dcStageSummary' }, ` — ${decision.reason}`) : null)),
        }),
        h(Section, {
          title: t('section.verification'),
          empty: t('empty.verification'),
          rows: verification.map((item, index) => h('div', { key: `v-${index}`, className: 'dcText' },
            h('span', null, item.what || ''), ' ',
            h('span', { className: 'dcMono' }, item.result || ''))),
        }),
        h(Section, {
          title: t('section.repair'),
          empty: t('empty.repair'),
          rows: repair.map((item, index) => h('div', { key: `r-${index}`, className: 'dcText' },
            h('span', { className: 'dcMono' }, item.id || ''),
            h('span', { className: 'dcMono' }, ` ${item.progress || ''}`),
            item.tests ? h('span', { className: 'dcMono' }, ` ${item.tests}`) : null,
            item.what ? h('span', { className: 'dcStageSummary' }, ` — ${item.what}`) : null)),
        }),
        h(Section, {
          title: t('section.failures'),
          empty: t('empty.failures'),
          rows: failures.map((item, index) => h('div', { key: `f-${index}`, className: 'dcText' },
            h('span', { className: 'dcMono' }, item.kind || ''),
            h('span', null, ` ${item.what || ''}`),
            item.recovered ? h('span', { className: 'dcStageSummary' }, ` — ${item.recovered}`) : null)),
        }),
        h(Section, {
          title: t('section.artifacts'),
          empty: t('empty.artifacts'),
          rows: artifacts.map((item, index) => h('div', { key: `a-${index}`, className: 'dcText' },
            h('span', { className: 'dcMono' }, item.path || ''),
            item.note ? h('span', { className: 'dcStageSummary' }, ` — ${item.note}`) : null)),
        }),
        h(Section, {
          title: t('section.blockers'),
          empty: t('empty.blockers'),
          rows: blockers.concat(pending).map((item, index) => h('div', { key: `b-${index}`, className: 'dcText' },
            h('span', null, item.what || item.question || ''),
            item.need ? h('span', { className: 'dcStageSummary' }, ` — ${item.need}`) : null)),
        }),
        h(Section, {
          title: t('section.requirements'),
          empty: t('empty.requirements'),
          rows: h('div', { className: 'dcText' },
            h('span', { className: 'dcMono' }, `${t('requirements.unknown')} ${requirements.counts?.unknown ?? 0} · ${t('requirements.assumptions')} ${requirements.counts?.assumptions ?? 0} · ${t('requirements.deferred')} ${requirements.counts?.deferred ?? 0}`),
            h('div', { className: 'dcMono' },
              requirements.intake?.autonomy === '已授权'
                ? t('intake.granted')
                : (requirements.intake?.status === '已发出' ? t('intake.waiting') : t('intake.idle'))),
            (requirements.unknown || []).map((item, index) => h('div', { key: `u-${index}`, className: 'dcStageSummary' }, `？${item}`)),
            (requirements.assumptions || []).map((item, index) => h('div', { key: `as-${index}`, className: 'dcStageSummary' }, `～${item}`))),
        }),
        h(Section, {
          title: t('section.acceptance'),
          empty: t('empty.acceptance'),
          rows: acceptance.status || acceptance.userPath
            ? [h('div', { className: 'dcText', key: 'acc' },
              h('span', { className: 'dcMono' }, acceptance.status || ''),
              acceptance.userPath ? h('span', { className: 'dcStageSummary' }, ` — ${acceptance.userPath}`) : null,
              (acceptance.evidence || []).map((item, index) => h('div', { key: `ev-${index}`, className: 'dcStageSummary' }, `· ${item}`)),
              (acceptance.userOnly || []).map((item, index) => h('div', { key: `uo-${index}`, className: 'dcStageSummary', 'data-user-only': 'true' }, `${t('acceptance.userOnly')}：${item}`)))]
            : [],
        }),
        h(Section, {
          title: t('section.checkpoints'),
          empty: t('empty.checkpoints'),
          rows: checkpoints.map((item, index) => h('div', { key: `c-${index}`, className: 'dcText' },
            h('span', { className: 'dcMono' }, item.id || ''),
            item.note ? h('span', { className: 'dcStageSummary' }, ` — ${item.note}`) : null)),
        }));

      return h('div', { className: 'dcDock', 'data-deep-construction': 'pipeline' },
        h('style', null, CSS),
        h('div', { className: 'dcCard' },
          bar,
          view.goal ? h('div', { className: 'dcGoal', title: view.goal }, `${t('bar.goal')}：${view.goal}`) : null,
          body));
    }

    const zh = {
      'bar.title': '落地流',
      'bar.goal': '目标',
      'bar.expand': '展开全链 Pipeline',
      'bar.collapse': '收起全链 Pipeline',
      'chip.modules': '模块',
      'section.actions': '我可以做什么',
      'section.stages': '全链阶段',
      'section.basis': '设计依据',
      'section.experience': '体验契约',
      'section.benchmarks': '品类与领域对标',
      'section.gaps': '交付面清单',
      'section.modules': '模块',
      'section.plan': '施工计划',
      'section.changes': '变更项',
      'section.decisions': '技术决策',
      'section.verification': '验证',
      'section.repair': 'Repair',
      'section.failures': '技术失败',
      'section.artifacts': '产物',
      'section.blockers': '阻塞 / 待你决定',
      'section.requirements': '需求缺口',
      'section.acceptance': '验收',
      'section.checkpoints': 'Checkpoint',
      'action.confirm': '确认 Brief',
      'action.pause': '暂停',
      'action.auditOnly': '只审计不修改',
      'action.rollback': '回滚到最近 checkpoint',
      'action.hint': '已填入输入框——按回车发送。',
      'action.failed': '填入失败，请直接在输入框里说。',
      'plan.current': '当前',
      'basis.definition': '定义',
      'basis.motivation': '动机取向',
      'basis.meaning': '用户意义',
      'basis.structure': '结构分解',
      'basis.time': '时间逻辑',
      'exp.first10': '前10秒',
      'exp.first60': '前60秒',
      'exp.first5': '前5分钟',
      'exp.screen': '常驻画面',
      'exp.feedback': '操作反馈',
      'acceptance.userOnly': '等你确认',
      'intake.granted': '自主推进：已授权（一次问全已回答）',
      'intake.waiting': '等你一次答全（尚未获得自主授权）',
      'intake.idle': '尚未发起一次问全',
      'requirements.unknown': '待明确',
      'requirements.assumptions': '推断',
      'requirements.deferred': '延期',
      'empty.stages': '尚未登记阶段',
      'empty.basis': '尚未写零到一前置设计包（定义 / 动机与取向 / 用户意义 / 结构分解 / 时间逻辑）',
      'empty.experience': '尚未写出体验契约（面向人的交付必须先写出动作级剧本）',
      'empty.benchmarks': '尚未做品类与领域对标（技术层研究不能替代）',
      'empty.gaps': '尚未列出交付面清单（玩法/数值/美术/音频/内容/领域每个板块都要有归属）',
      'empty.modules': '尚未登记模块',
      'empty.plan': '尚未登记计划',
      'empty.changes': '尚无变更项',
      'empty.decisions': '尚无技术决策',
      'empty.verification': '尚无验证记录',
      'empty.repair': '尚无 Repair 记录',
      'empty.failures': '无技术失败记录',
      'empty.artifacts': '尚无产物',
      'empty.blockers': '无阻塞',
      'empty.requirements': '尚无需求缺口记录',
      'empty.acceptance': '尚未验收',
      'empty.checkpoints': '尚无 checkpoint',
    };
    const en = {
      'bar.title': 'Landing Flow',
      'bar.goal': 'Goal',
      'bar.expand': 'Expand the pipeline view',
      'bar.collapse': 'Collapse the pipeline view',
      'chip.modules': 'Modules',
      'section.actions': 'What I can do',
      'section.stages': 'Pipeline stages',
      'section.basis': 'Design basis',
      'section.experience': 'Experience contract',
      'section.benchmarks': 'Category & domain benchmarks',
      'section.gaps': 'Delivery surfaces',
      'section.modules': 'Modules',
      'section.plan': 'Plan',
      'section.changes': 'Change items',
      'section.decisions': 'Technical decisions',
      'section.verification': 'Verification',
      'section.repair': 'Repair',
      'section.failures': 'Technical failures',
      'section.artifacts': 'Artifacts',
      'section.blockers': 'Blockers / awaiting you',
      'section.requirements': 'Requirement gaps',
      'section.acceptance': 'Acceptance',
      'section.checkpoints': 'Checkpoints',
      'action.confirm': 'Confirm the brief',
      'action.pause': 'Pause',
      'action.auditOnly': 'Audit only, no edits',
      'action.rollback': 'Roll back to the latest checkpoint',
      'action.hint': 'Filled into the composer — press Enter to send.',
      'action.failed': 'Could not fill the composer; please type it instead.',
      'plan.current': 'current',
      'basis.definition': 'definition',
      'basis.motivation': 'motivation',
      'basis.meaning': 'meaning',
      'basis.structure': 'structure',
      'basis.time': 'time logic',
      'exp.first10': 'first 10s',
      'exp.first60': 'first 60s',
      'exp.first5': 'first 5min',
      'exp.screen': 'on screen',
      'exp.feedback': 'feedback',
      'acceptance.userOnly': 'awaiting you',
      'intake.granted': 'Autonomy granted (one-shot intake answered)',
      'intake.waiting': 'Waiting for your one-shot answers (no autonomy yet)',
      'intake.idle': 'No one-shot intake yet',
      'requirements.unknown': 'Unknown',
      'requirements.assumptions': 'Assumed',
      'requirements.deferred': 'Deferred',
      'empty.stages': 'No stage recorded yet',
      'empty.basis': 'No zero-to-one design basis yet (definition / motivation / meaning / structure / time logic)',
      'empty.experience': 'No experience contract yet (human-facing delivery needs the action-level script first)',
      'empty.benchmarks': 'No category/domain benchmark yet (technical research does not replace it)',
      'empty.gaps': 'No delivery-surface list yet (gameplay, numbers, art, audio, content, domain — every board needs an owner)',
      'empty.modules': 'No module recorded yet',
      'empty.plan': 'No plan recorded yet',
      'empty.changes': 'No change item yet',
      'empty.decisions': 'No technical decision yet',
      'empty.verification': 'No verification recorded yet',
      'empty.repair': 'No repair round yet',
      'empty.failures': 'No technical failure recorded',
      'empty.artifacts': 'No artifact yet',
      'empty.blockers': 'Nothing blocked',
      'empty.requirements': 'No requirement gap recorded',
      'empty.acceptance': 'Not accepted yet',
      'empty.checkpoints': 'No checkpoint yet',
    };

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'deep-construction: dictionaries');
        // Register only while the declaring entry (ui-conversation) is live.
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'deep-construction',
          order: 20,
          locale: NS,
        }, PipelineView));
      },
    };
  },
});
