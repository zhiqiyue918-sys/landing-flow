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
      // V2: a row the host flagged as breaking one of the mode's own rules
      // (a red decision item, a rubber-stamp review, a licence red line, an
      // S-weight art surface with no user-provided source) has to be loud.
      '.dcText[data-unsourced="true"],.dcText[data-unsourced="true"] .dcMono{color:var(--dsw-alias-state-error-primary)}',
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
        case '退回':
          return 'repair';
        case '阻塞':
        case '不通过':
          return 'blocked';
        case '作废':
        case '不适用':
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
      const gameplayReview = view.gameplayReview || {};
      const visualReview = view.visualReview || {};
      const benchmarks = Array.isArray(view.benchmarks) ? view.benchmarks : [];
      const gaps = Array.isArray(view.surfaces) ? view.surfaces : [];
      const basis = view.basis || {};
      const gameApproval = view.gameApproval || {};
      const pitches = Array.isArray(basis.pitches) ? basis.pitches : [];
      const kickoff = view.kickoff || {};
      const reviewers = Array.isArray(view.reviewers) ? view.reviewers : [];
      const assets = view.assets || {};
      const platform = view.platform || {};
      const platformAlternatives = Array.isArray(platform.alternatives) ? platform.alternatives : [];
      const art = view.art || {};
      const artReferences = Array.isArray(art.references) ? art.references : [];
      const artPalette = Array.isArray(art.palette) ? art.palette : [];
      const artRounds = Array.isArray(art.viewRounds) ? art.viewRounds : [];
      const autoAdvanced = Array.isArray(view.autoAdvanced) ? view.autoAdvanced : [];
      const capabilitiesLine = typeof view.capabilities === 'string' ? view.capabilities : '';
      const capabilityDetail = view.capabilityDetail || null;
      const doneModules = modules.filter((m) => m.status === '已完成').length;

      const stageChip = view.stage
        ? h(Chip, { state: stateOf(view.stageState), title: view.stageNote || view.stage }, view.stage)
        : null;
      const moduleChip = modules.length > 0
        ? h(Chip, { state: 'idle', title: t('chip.modules') }, `${t('chip.modules')} ${doneModules}/${modules.length}`)
        : null;
      // V2: the one fact the user must never be misled about — whether D can
      // actually see what it built. Text-only models are blind by default.
      const blind = capabilityDetail?.visual?.available === false;
      const visionChip = blind ? h(Chip, { state: 'blocked', title: t('chip.blind.title') }, t('chip.blind')) : null;
      // V6: hard gates are the one thing the bar must never hide. A run that
      // "finished" with them open is the failure this product exists to stop, so
      // the count sits next to the stage instead of inside the expanded body.
      const hardGates = Number.isFinite(view.hardGates) ? view.hardGates : 0;
      const gateChip = hardGates > 0
        ? h(Chip, { state: 'blocked', title: t('chip.gates.title') }, `${t('chip.gates')} ${hardGates}`)
        : null;
      const headline = view.progress || view.stageNote || '';

      const bar = h('div', { className: 'dcBar' },
        h('span', { className: 'dcGlyph' }, h(Mark)),
        h('span', { className: 'dcTitle' }, t('bar.title')),
        stageChip,
        moduleChip,
        gateChip,
        visionChip,
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
          rows: [
            ['definition', 'basis.definition'], ['motivation', 'basis.motivation'],
            ['meaning', 'basis.meaning'], ['structure', 'basis.structure'],
            ['time_logic', 'basis.time'], ['feeling', 'basis.feeling'],
          ]
            .filter(([field]) => basis[field])
            .map(([field, key]) => h('div', { key: field, className: 'dcText' },
              h('span', { className: 'dcMono' }, t(key)), ' ',
              h('span', null, basis[field]))),
        }),
        h(Section, {
          title: t('section.pitches'),
          empty: t('empty.pitches'),
          rows: pitches.map((item, index) => h('div', {
            key: `pitch-${index}`, className: 'dcText',
            // V5: a pitch with no name is not a pitch. The judgement is
            // granularity — if it does not read as *which game*, it is not one.
            'data-unsourced': item.name && item.pitch ? 'false' : 'true',
          },
          h('span', { className: 'dcMono' }, item.name || t('pitches.unnamed')), ' ',
          h('span', null, item.pitch || ''))),
        }),
        h(Section, {
          title: '游戏方案批准状态',
          empty: '尚未展示游戏方案',
          rows: gameApproval.status || gameApproval.proposal_name
            ? [h('div', { className: 'dcText' },
              h('span', { className: 'dcMono' }, gameApproval.status || ''), ' ',
              h('span', null, gameApproval.proposal_name || '未记录具体方案'),
              gameApproval.user_evidence ? h('div', { className: 'dcMono' }, gameApproval.user_evidence) : null)]
            : [],
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
          empty: '尚无真实玩家路径试玩证据',
          rows: Object.entries(gameplayReview).filter(([, value]) => value).map(([key, value]) => h('div', { key, className: 'dcText' },
            h('span', { className: 'dcMono' }, key), ' ', h('span', null, value))),
        }),
        h(Section, {
          title: '游戏视觉与 UI 实机复测',
          empty: '尚无实机截图与改后复测证据',
          rows: Object.entries(visualReview).filter(([, value]) => value).map(([key, value]) => h('div', { key, className: 'dcText' },
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
          h('span', null, item.form || ''),
          item.origin || item.licence || item.artWeight
            ? h('span', { className: 'dcStageSummary' },
              ` — ${[item.origin, item.licence, item.artWeight ? `权重${item.artWeight}` : null].filter(Boolean).join(' / ')}`)
            : null,
          item.material ? h('div', { className: 'dcMono' }, item.material) : null)),
        }),
        h(Section, {
          title: t('section.assets'),
          empty: t('empty.assets'),
          rows: [
            ['imageApi', 'assets.imageApi', assets.imageApi],
            ['budgetNote', 'assets.budget', assets.budgetNote],
            ['licenceNote', 'assets.licence', assets.licenceNote],
          ].filter(([, , value]) => value).map(([field, key, value]) => h('div', { key: field, className: 'dcText' },
            h('span', { className: 'dcMono' }, t(key)), ' ',
            h('span', null, value))),
        }),
        h(Section, {
          title: t('section.platform'),
          empty: t('empty.platform'),
          rows: platform.choice || platform.kind || platformAlternatives.length > 0
            ? [h('div', {
              className: 'dcText',
              'data-unsourced': platform.kind === '无框架自研' && platformAlternatives.length < 2 ? 'true' : 'false',
            },
            h('span', { className: 'dcMono' }, platform.choice || ''),
            platform.kind ? h('span', { className: 'dcMono' }, ` ${platform.kind}`) : null,
            platform.licence || platform.cost
              ? h('span', { className: 'dcStageSummary' },
                ` — ${[platform.licence, platform.cost].filter(Boolean).join(' / ')}`)
              : null,
            // V5: a host-game mod's loadability rests on this triple. Missing any
            // part of it means the jar may not load anywhere, so flag it red — and
            // say which parts are actually missing, rather than only warning when
            // all three are absent.
            platform.kind === '宿主游戏 mod'
              ? (() => {
                const parts = [
                  [platform.hostGame, 'host_game'],
                  [platform.hostVersion, 'host_version'],
                  [platform.hostLoader, 'host_loader'],
                ];
                const present = parts.filter(([value]) => value).map(([value]) => value);
                const missing = parts.filter(([value]) => !value).map(([, name]) => name);
                return h('div', {
                  className: 'dcText',
                  'data-unsourced': missing.length > 0 ? 'true' : 'false',
                },
                h('span', { className: 'dcMono' }, t('platform.host')),
                present.length > 0 ? ` ${present.join(' + ')}` : '',
                missing.length > 0
                  ? h('span', { className: 'dcStageSummary' },
                    ` ${t('platform.hostMissing')}：${missing.join(' / ')}`)
                  : null);
              })()
              : null,
            platform.exportTargets ? h('div', { className: 'dcMono' }, `${t('platform.export')} ${platform.exportTargets}`) : null,
            platform.note ? h('div', { className: 'dcMono' }, platform.note) : null,
            ...platformAlternatives.map((item, index) => h('div', {
              key: `plat-alt-${index}`, className: 'dcText',
            },
            h('span', { className: 'dcMono' }, `✗ ${item.name || ''}`), ' ',
            h('span', null, item.whyNot || ''))))] : [],
        }),
        h(Section, {
          title: t('section.art'),
          empty: t('empty.art'),
          rows: artReferences.length || artPalette.length || artRounds.length || art.light || art.texture
            ? [
              // The whole point of V4: art built against references, with the loop
              // counted. When either is missing the row is flagged red.
              h('div', {
                className: 'dcText',
                'data-unsourced': artReferences.length < 2 || artRounds.length < 3 ? 'true' : 'false',
              },
              h('span', { className: 'dcMono' }, `${t('art.refs')} ${artReferences.length}`),
              h('span', { className: 'dcMono' }, ` / ${t('art.palette')} ${artPalette.length}`),
              h('span', { className: 'dcMono' }, ` / ${t('art.rounds')} ${artRounds.length}`),
              art.layers ? h('span', { className: 'dcStageSummary' }, ` — ${t('art.layers')} ${art.layers}`) : null),
              ...artReferences.map((item, index) => h('div', {
                key: `art-ref-${index}`, className: 'dcText',
                'data-unsourced': item.whatToSteal ? 'false' : 'true',
              },
              h('span', { className: 'dcMono' }, `◇ ${item.name || ''}`), ' ',
              h('span', null, item.whatToSteal || t('art.noSteal')))),
              ...artPalette.map((item, index) => h('div', {
                key: `art-pal-${index}`, className: 'dcText',
              },
              h('span', { className: 'dcMono' }, item.hex || ''), ' ',
              h('span', null, item.role || ''))),
              art.light ? h('div', { className: 'dcText' }, h('span', { className: 'dcMono' }, t('art.light')), ' ', h('span', null, art.light)) : null,
              art.texture ? h('div', { className: 'dcText' }, h('span', { className: 'dcMono' }, t('art.texture')), ' ', h('span', null, art.texture)) : null,
              art.ui ? h('div', { className: 'dcText' }, h('span', { className: 'dcMono' }, t('art.ui')), ' ', h('span', null, art.ui)) : null,
              ...artRounds.map((item, index) => h('div', {
                key: `art-round-${index}`, className: 'dcText',
                'data-unsourced': item.changed ? 'false' : 'true',
              },
              h('span', { className: 'dcMono' }, `#${item.round || ''}`), ' ',
              h('span', null, item.gaps || ''), ' ',
              h('span', { className: 'dcStageSummary' }, item.changed ? `→ ${item.changed}` : t('art.noChange')))),
            ] : [],
        }),
        h(Section, {
          title: t('section.kickoff'),
          empty: t('empty.kickoff'),
          rows: kickoff.status || kickoff.path ? [h('div', {
            className: 'dcText',
            'data-unsourced': kickoff.blockingCount && kickoff.blockingCount !== '0' ? 'true' : 'false',
          },
          h('span', { className: 'dcMono' }, kickoff.status || ''),
          kickoff.questionCount ? h('span', { className: 'dcMono' }, ` ${t('kickoff.questions')} ${kickoff.questionCount}`) : null,
          kickoff.blockingCount !== null && kickoff.blockingCount !== undefined
            ? h('span', { className: 'dcMono' }, ` ${t('kickoff.blocking')} ${kickoff.blockingCount}`) : null,
          kickoff.path ? h('div', { className: 'dcMono' }, kickoff.path) : null)] : [],
        }),
        h(Section, {
          title: t('section.reviewers'),
          empty: t('empty.reviewers'),
          rows: reviewers.map((item, index) => h('div', {
            key: `rv-${index}`, className: 'dcText',
            'data-unsourced': item.status === '通过' && item.isolation !== '独立子代理' ? 'true' : 'false',
          },
          h('span', { className: 'dcMono' }, item.officer || ''),
          h('span', { className: 'dcStageName', 'data-state': stateOf(item.status) }, item.status || ''),
          item.isolation ? h('span', { className: 'dcMono' }, ` ${item.isolation}`) : null,
          item.verdict ? h('div', null, item.verdict) : null,
          item.overturned ? h('div', { className: 'dcMono' }, item.overturned) : null)),
        }),
        h(Section, {
          title: t('section.autoAdvanced'),
          empty: t('empty.autoAdvanced'),
          rows: autoAdvanced.map((item, index) => h('div', { key: `aa-${index}`, className: 'dcText' },
            h('span', { className: 'dcMono' }, item.item || ''), ' ',
            h('span', null, item.defaultUsed || ''),
            item.reason ? h('span', { className: 'dcStageSummary' }, ` — ${item.reason}`) : null)),
        }),
        h(Section, {
          title: t('section.capabilities'),
          empty: t('empty.capabilities'),
          rows: capabilitiesLine ? [h('div', {
            className: 'dcText',
            'data-unsourced': capabilityDetail?.visual?.available === false ? 'true' : 'false',
          }, h('span', null, capabilitiesLine))] : [],
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
            h('div', {
              className: 'dcMono',
              'data-consent': requirements.consent?.status === '已确认' ? 'granted' : 'locked',
            },
            requirements.consent?.status === '已确认'
              ? `${t('consent.granted')}${requirements.consent.basis ? `（${requirements.consent.basis}）` : ''}`
              : t('consent.locked')),
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
      'section.assets': '素材策略',
      'section.kickoff': '开工文档',
      'section.reviewers': '体验官审阅',
      'section.autoAdvanced': '自动推进留痕',
      'section.capabilities': '能力自检',
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
      'assets.imageApi': '图像API',
      'assets.budget': '预算',
      'assets.licence': '许可',
      'kickoff.questions': '问题数',
      'kickoff.blocking': '阻塞项',
      'chip.blind': '无视觉能力',
      'chip.blind.title': '本会话没有挂载视觉工具（通常是输入框的「👁 识图」没开）。D 看不到自己做的画面，因此不得声称看过画面。',
      'chip.gates': '硬门',
      'chip.gates.title': '硬门未清：这些缺陷不是提示，宿主会拒绝把它记成「完成 / 验收」。先清掉它们，别急着交付。',
      'exp.first10': '前10秒',
      'exp.first60': '前60秒',
      'exp.first5': '前5分钟',
      'exp.screen': '常驻画面',
      'exp.feedback': '操作反馈',
      'acceptance.userOnly': '等你确认',
      'intake.granted': '自主推进：已授权（一次问全已回答）',
      'intake.waiting': '等你一次答全（尚未获得自主授权）',
      'intake.idle': '尚未发起一次问全',
      'consent.locked': '施工锁：未确认授权（引擎会拒绝写入与施工工具）',
      'consent.granted': '施工授权：已确认',
      'requirements.unknown': '待明确',
      'requirements.assumptions': '推断',
      'requirements.deferred': '延期',
      'empty.stages': '尚未登记阶段',
      'empty.basis': '尚未写零到一前置设计包（定义 / 动机与取向 / 用户意义 / 结构分解 / 时间逻辑 / 感觉→画面）',
      'section.pitches': '具体方案',
      'empty.pitches': '尚未给出可命名的具体方案（用户说"你多想几个"时要的就是这个，不是问卷）',
      'pitches.unnamed': '（没有可命名的方案：读不出"这是哪款游戏"）',
      'basis.feeling': '感觉→画面：',
      'empty.experience': '尚未写出体验契约（面向人的交付必须先写出动作级剧本）',
      'empty.benchmarks': '尚未做品类与领域对标（技术层研究不能替代）',
      'empty.gaps': '尚未列出交付面清单（玩法/数值/美术/音频/内容/领域每个板块都要有归属）',
      'empty.assets': '尚未定素材策略（图像API / 预算 / 许可纪律）',
      'section.platform': '承载平台',
      'section.art': '美术达标',
      'empty.art': '尚未定美术方向（参考图 / 色板 / 迭代轮次）',
      'art.refs': '参考',
      'art.palette': '色板',
      'art.rounds': '迭代',
      'art.layers': '纵深',
      'art.light': '光照：',
      'art.texture': '材质：',
      'art.ui': 'UI：',
      'art.noSteal': '（没写要从它身上抄什么）',
      'art.noChange': '（只看了没改）',
      'empty.platform': '尚未定承载平台（引擎/框架，以及否掉过哪些）',
      'platform.export': '导出：',
      'platform.host': '宿主：',
      'platform.hostMissing': '⚠ 缺（jar 可能装不上）',
      'empty.kickoff': '尚未发出开工文档（前期一次问全的落地形态）',
      'empty.reviewers': '尚未经体验官审阅（交付前必须由独立子代理跑一遍）',
      'empty.autoAdvanced': '无自动推进记录',
      'empty.capabilities': '尚未做能力自检（d_state 每次调用都会返回）',
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
      'section.assets': 'Asset strategy',
      'section.kickoff': 'Kickoff dossier',
      'section.reviewers': 'Experience review',
      'section.autoAdvanced': 'Auto-advanced on timeout',
      'section.capabilities': 'Capability self-check',
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
      'assets.imageApi': 'image API',
      'assets.budget': 'budget',
      'assets.licence': 'licence',
      'kickoff.questions': 'questions',
      'kickoff.blocking': 'blocking',
      'chip.blind': 'no vision',
      'chip.blind.title': 'No vision tools are mounted in this session (usually the composer\'s 「👁 识图」 toggle is off). D cannot see what it built, so it must not claim it looked at anything.',
      'exp.first10': 'first 10s',
      'exp.first60': 'first 60s',
      'exp.first5': 'first 5min',
      'exp.screen': 'on screen',
      'exp.feedback': 'feedback',
      'acceptance.userOnly': 'awaiting you',
      'intake.granted': 'Autonomy granted (one-shot intake answered)',
      'intake.waiting': 'Waiting for your one-shot answers (no autonomy yet)',
      'intake.idle': 'No one-shot intake yet',
      'consent.locked': 'Build lock: consent not confirmed (writes and construction tools are refused)',
      'consent.granted': 'Build consent: confirmed',
      'requirements.unknown': 'Unknown',
      'requirements.assumptions': 'Assumed',
      'requirements.deferred': 'Deferred',
      'empty.stages': 'No stage recorded yet',
      'empty.basis': 'No zero-to-one design basis yet (definition / motivation / meaning / structure / time logic / feeling→picture)',
      'section.pitches': 'Named pitches',
      'empty.pitches': 'No nameable pitches yet (this is what "give me a few ideas" asks for — not a questionnaire)',
      'pitches.unnamed': '(nothing nameable: cannot read which game this is)',
      'basis.feeling': 'Feeling → picture:',
      'empty.experience': 'No experience contract yet (human-facing delivery needs the action-level script first)',
      'empty.benchmarks': 'No category/domain benchmark yet (technical research does not replace it)',
      'empty.gaps': 'No delivery-surface list yet (gameplay, numbers, art, audio, content, domain — every board needs an owner)',
      'empty.assets': 'No asset strategy yet (image API / budget / licence discipline)',
      'section.platform': 'Carrying platform',
      'section.art': 'Art bar',
      'empty.art': 'No art direction yet (references / palette / view rounds)',
      'art.refs': 'refs',
      'art.palette': 'palette',
      'art.rounds': 'rounds',
      'art.layers': 'depth',
      'art.light': 'Light: ',
      'art.texture': 'Texture: ',
      'art.ui': 'UI: ',
      'art.noSteal': '(nothing said to steal from it)',
      'art.noChange': '(looked but changed nothing)',
      'empty.platform': 'No platform decision yet (engine/framework, and what was rejected)',
      'platform.export': 'Exports:',
      'platform.host': 'Host:',
      'platform.hostMissing': '⚠ missing (the jar may not load)',
      'empty.kickoff': 'No kickoff dossier yet (the one-shot up-front interview)',
      'empty.reviewers': 'Not reviewed yet (an isolated subagent must run it before handover)',
      'empty.autoAdvanced': 'No auto-advanced decisions',
      'empty.capabilities': 'No capability self-check yet (every d_state call returns one)',
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
