---
name: deep-construction-visual-review
description: Use for game UI and visual design before implementation and after each playable build — to define a coherent visual system, inspect the actual player-facing screen, and iterate from concrete screenshot findings.
---

# Game Visual and UI Review

## Design before drawing

Define the visual target using references or a deliberate authored direction. Specify the palette, typography, shape language, contrast, focal hierarchy, spacing, animation behavior, and asset source. "Polished", "beautiful", "pixel art", or "clean" alone is not an implementable style contract. When the visual style matters, compare actual alternatives in the same scene rather than asking the user to imagine abstract adjectives from text alone.

Do not default to raw rectangles and circles as final art. Procedural visuals are valid when they form a deliberate, coherent style and serve the product; otherwise source a consistent asset set or use user-provided assets. Keep the style consistent across world, character, HUD, menus, and icons. Check that characters and interactive targets remain visually distinct from the background at the actual play scale.

## UI hierarchy

For each player-facing screen, identify:

- The primary action and current objective.
- The state the player needs now (health, score, resources, timer, progress as applicable).
- Secondary information that can be reduced or hidden.
- Pause, failure, completion, and restart paths when applicable.

A new player should identify the goal, primary action, and important status at a glance. Check alignment, contrast, font legibility at actual window size, safe areas, overlap, state changes, and whether the HUD obscures play. Verify that controls look interactive, disabled/active/hover/focus states are distinguishable, and menus do not compete with the game for attention.

## Render-look-fix loop

For each playable build:

1. Launch the same entry point the user will launch.
2. Capture a screenshot from that running build, at its real viewport or window size.
3. Inspect the actual image (or explicitly hand it to the user if visual inspection is unavailable).
4. Record specific defects by element and location; avoid generic labels such as "needs polish".
5. Fix the highest-impact defect and repeat using the same entry path.

A screenshot made by a separate mock renderer is not evidence of the shipped game. A source-code description is not visual inspection. If the agent lacks visual capability, report that limitation and leave the image review unverified rather than claiming success. Keep before/after images at the same size and state where possible so the difference can be judged directly.

## Defect priority

Fix in this order: unreadable goal or blocked control; HUD overlap or low contrast; unclear hierarchy and inconsistent component styling; unfinished placeholder art or mismatched assets; secondary polish. Do not spend time tuning decorative effects while the player cannot understand the screen or the game loop is not fun.

## Stop condition

Before product acceptance, the real running build must have at least one documented visual review and one follow-up capture after a concrete UI/visual correction. Record screenshot paths, findings, changed elements, and retest result in `d_state.visual_review`. The user still decides whether the style appeals to them; technical readability does not substitute for taste.

Write concise evidence into these fields:

- `runtime_screenshot`: screenshot from the user's actual launch path.
- `hierarchy_review`: first-screen goal, primary action, status readability, and any overlap.
- `visual_rounds`: count and description of render/look/fix passes; identify what changed each time.
- `ui_findings`: specific defects and their disposition.
- `retest_result`: same-path screenshot check after the correction; state when the user still needs to judge taste.

A visual pass means a concrete issue was fixed and verified, not merely that screenshots were taken. Keep a residual list for visual issues that remain so "one fix round" cannot be mistaken for a polished result.
