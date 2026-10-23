---
name: deep-construction-gameplay
description: Use for every game or interactive playable project from discovery through acceptance — to design a concrete repeatable core loop, build a playable vertical slice, and review real play evidence rather than infer fun from source code or passing tests.
---

# Game Design and Playtest

## Start with the player's repeated action

Before implementation, state in plain language:

- The action the player repeats.
- The decision that makes repetitions meaningfully different.
- The immediate feedback and reward after each action.
- The short-term goal and what changes after reaching it.
- Why a player would choose to play again.

Turn this into a loop: `decision -> action -> readable feedback -> consequence/reward -> next decision`. A theme, setting, or feature list is not a loop. If the loop contains no meaningful decision, say so and redesign it before building content around it. Give concrete examples of at least two player choices and their consequences. A nominal choice that changes only text or color is not a meaningful branch unless that change is itself the intended experience.

## Design for a real session

Describe what a first-time player does in the first ten seconds, what feedback or reward arrives during the first minute, and what goal carries the player through the first few minutes. Use values, timings, and unlock conditions only when they help test the design; do not invent precision that has no basis. Identify the state the player needs at all times and keep the next useful action legible.

Separate challenge from friction. Challenge asks the player to learn, decide, or improve; friction hides controls, delays feedback, blocks a reasonable action, or makes failure opaque. For each failure condition, name the information the player learns and the fastest route back into play. If the design is intentionally relaxing or has no failure state, say so and test the corresponding idle/exit/re-entry path instead.

## Build order

1. Define a compact playable slice that exposes the real loop, not just movement, a title screen, or a feature showcase.
2. Implement input, game state, feedback, consequence/reward, failure/recovery, and one meaningful variation together.
3. Run the actual player entry point and operate it through the same input path a player uses.
4. Observe at least three consecutive loop repetitions. Record duration, player action, decision, feedback, and outcome; point out repetition, dead time, and any point where the player does not know what happened.
5. Compare two different player choices and their outcomes. If the design intentionally has no branching, identify the changing variable that creates mastery, escalation, or a different challenge.
6. Test failure and restart where applicable. Record whether the failure teaches anything and how quickly play resumes.
7. Identify one evidence-backed reason to play again. If none exists, the loop is not ready for product acceptance.

The first playable build is a learning instrument, not automatically a deliverable. After the first real session, compare observations against the intended loop. Fix the largest loop defect before adding content. Do not add levels, upgrades, particles, or feature lists as camouflage for a weak central action.

## Evidence format

Record the launch command or exact entry path, controls used, a short operation trace, observed outcomes, screenshots or video frames, and timing estimates with their measurement method. Separate measured facts from judgment. A reviewer who cannot actually run or see the game must mark that part unverified. Save evidence under the project, use stable relative paths, and mention the paths in `d_state.gameplay_review`.

For a keyboard game, exercise the real keyboard handler. For pointer/touch play, click or tap the visible target as a player would, not a hidden coordinate or internal function. If automation is used, record what it controls and add at least one observation through the actual user-facing path. Do not infer responsiveness from source code or unit tests.

## Acceptance questions

- Can a first-time player identify the immediate goal and primary action without explanation?
- Does each important action produce prompt, legible feedback?
- Does the player's choice affect the next state or outcome?
- Does the loop change or deepen before it becomes repetitive?
- Can the player understand failure and resume quickly?
- Can the reviewer give a concrete reason to play again?

A "no" on the core action, choice, feedback, or replay reason returns the task to DESIGN. A true observation of no reason to replay is a finding, not something to soften into "more content would help". Record the defect, return to the design decision that caused it, update the experience contract, and test the revised loop.

## State and handoff

Write concise evidence into `d_state.gameplay_review`:

- `playtest_path`: exact entry point and actual player input path.
- `loop_observation`: at least three repetitions, with action/decision/feedback/outcome and relevant timing.
- `branch_evidence`: two choices and distinct outcomes, or the tested alternative variation for a deliberately linear design.
- `retry_observation`: failure/restart path and observed recovery time, or why failure is not part of this game's design.
- `replay_hook`: a specific observed reason to play again, or explicitly "未成立".

Do not mark a field complete with planned tests, generated descriptions, or evidence that does not exist. If the evidence is missing, say what has not yet been observed. A good handoff lets another person reproduce the observation without trusting the implementer's summary.
