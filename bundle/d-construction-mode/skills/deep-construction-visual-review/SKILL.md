---
name: deep-construction-visual-review
description: Use before and after game UI/visual implementation — define a coherent style contract, inspect the real running build, and iterate from concrete screenshot defects.
---

# Game Visual and UI Review

## Decide the visual direction first

Ground the direction in actual references or an explicit authored style. Specify palette, typography, shape language, contrast, focal hierarchy, spacing, motion, and asset source. Words such as "polished", "beautiful", "pixel art", or "clean" are not a visual specification by themselves.

Do not default to raw rectangles and circles as final art. Procedural visuals are valid when they form a deliberate consistent style; otherwise use a coherent asset set or user-provided references. Keep world, character, HUD, menus, and icons visually consistent. Ensure the character and interactive targets remain distinguishable at actual play scale.

## Check each player-facing screen

Identify the immediate goal, primary action, important current state, and secondary information. Check the main menu, in-game HUD, pause, failure, completion, and restart paths where applicable. At actual window size, inspect alignment, contrast, font legibility, safe areas, overlap, state changes, and whether the HUD hides play. Controls must look interactive and active/disabled/focus states must be legible.

## Render, inspect, fix, retest

1. Launch the same entry point the user will launch.
2. Capture the running build at its real viewport/window size.
3. Inspect that image, or hand the image to the user if visual inspection is unavailable.
4. Record specific defects by element and location.
5. Fix the highest-impact defect and capture again through the same entry path.

A mock renderer, source-code description, or separately beautified frame is not evidence of the shipped game. Keep before/after captures comparable. Without visual capability, mark the review unverified and never claim to have inspected the image.

Prioritize blocked/unreadable controls, unclear goal, HUD overlap/contrast, hierarchy inconsistency, unfinished placeholder assets, then secondary polish. Do not tune decorative effects while the core loop is weak.

## d_state fields and completion

- `runtime_screenshot`: screenshot from the user's actual launch path.
- `hierarchy_review`: first-screen goal, primary action, state readability, and overlap findings.
- `visual_rounds`: render/look/fix count and the concrete change made.
- `ui_findings`: specific issues and disposition.
- `retest_result`: same-path check after a concrete correction; state when the user still must judge taste.

Before game acceptance, at least one concrete visual/UI defect must have been fixed and verified with a follow-up capture. The user remains the judge of whether the style appeals to them; readability is not the same as taste.
