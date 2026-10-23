---
name: deep-construction-gameplay
description: Use for every game or playable interactive project from discovery through acceptance — design a concrete repeatable loop and review actual player-path evidence rather than infer fun from source code or passing tests.
---

# Game Design and Playtest

## Define the loop before building

Write the player's repeated loop as `decision -> action -> readable feedback -> consequence/reward -> next decision`. Name the repeating action, the decision that changes what happens, the immediate feedback, the short-term goal, and a concrete reason to play again. A theme, feature list, or movement demo is not a core loop.

If the loop has no meaningful choice, redesign it before building content around it. A nominal choice that changes only a label or color is not meaningful unless that change is the intended experience. State two player choices and their expected consequences.

## Design for an actual session

Specify what a first-time player does in the first ten seconds, what meaningful feedback/reward arrives in the first minute, and what goal carries play through the first few minutes. Identify the state that must remain visible. Separate challenge, which asks the player to learn or decide, from friction, which hides controls, delays feedback, blocks a reasonable action, or makes failure opaque.

For failure, name what the player learns and how play resumes. If the game intentionally has no failure, test exit/re-entry or another relevant recovery path instead. Use timings and numeric targets only when they can be observed; do not invent precision to make a design look rigorous.

## Build and play

1. Build a small playable slice that exposes the real loop, not just a title screen or movement test.
2. Include input, state changes, feedback, consequence/reward, and at least one meaningful variation in the same slice.
3. Launch the actual user-facing entry point.
4. Operate the game through the same keyboard, mouse, or touch path that players use.
5. Observe at least three consecutive loops. Record action, decision, feedback, outcome, and where repetition or dead time appears.
6. Compare two different choices and their outcomes. For intentionally linear play, document the tested change that creates mastery, escalation, or a different challenge.
7. Exercise failure and restart where applicable; record the path and observed recovery.
8. State one evidence-based reason to play again. If none exists, the loop is not ready for acceptance.

Automated tests prove logic properties; they do not prove responsiveness, readability, fun, or replay value. Directly invoking internal functions is not a player-path test. The first playable build is a learning instrument, not automatically a deliverable.

## Required review evidence

Record the exact launch command or entry path, controls used, a reproducible operation trace, observed outcomes, and screenshot/video evidence. Distinguish measurements from judgment. Save project-relative evidence paths and reference them in `d_state.gameplay_review`. If a reviewer cannot run or see the build, mark that part unverified.

A "no" on the core action, meaningful choice, readable feedback, loop development, or replay reason returns to DESIGN. Do not camouflage a weak loop by adding levels, particles, upgrades, or more text.

## d_state fields

- `playtest_path`: actual user-facing launch path and player input method.
- `loop_observation`: at least three real loop repetitions with action/decision/feedback/outcome.
- `branch_evidence`: two choices and distinct outcomes, or observed alternative variation for a deliberately linear game.
- `retry_observation`: real failure/restart path, or a reasoned statement that failure is not part of the design.
- `replay_hook`: concrete observed reason to play again, or `未成立`.

Planned tests, generated descriptions, and source inspection are not observed evidence.
