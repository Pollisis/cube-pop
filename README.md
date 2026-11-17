# Cube Pop

A calm 3D arrow puzzle for the browser (made for iPad). Original code, look and sounds. No ads, no timer, no lives.

Play: https://pollisis.github.io/cube-pop/

## How to play
- A frosted glass cube has a grid on every side, covered in snake-like arrows. Arrows bend and can run over the cube's edges onto the next side.
- **Tap an arrow**: it slides along its own path and zooms straight off the cube the way its head points, leaving a faint groove behind.
- It can only leave if **no other arrow is anywhere straight ahead of its head on that same side**. Arrows on the next side don't count (arrows leave flat off the face). A blocked arrow turns blue, bumps the one in its way (pink flash) and slides back. **No penalty, unlimited tries.**
- **Drag** to spin the cube; pinch (or mouse wheel) to zoom. Clear every arrow to finish the level.
- 💡 **Lightbulb** (the only helper): free and unlimited, with a 2.5 s cooldown. It lights up an arrow you can clear right now and turns the cube to show it if needed. It wiggles after 8 idle seconds.

## Levels
Endless and the same every time for a given level number. Cube size: 4x4 (levels 1-3), 5x5 (4-6), 6x6 (7-10), 7x7 (11-14), 8x8 (15-19), 9x9 (20-29), then capped at 10x10 from level 30. Past the cap, arrows get a bit longer, bendier and more interlocked for ~40 levels, then it plateaus.

**Always solvable.** Levels are built backwards: arrows are added in reverse clearing order, and a new arrow is only kept if the straight line ahead of its head is empty of every arrow already placed (and of its own body). Arrows added later may sit in front of earlier ones, which is what makes them interlock. A solver then double-checks every level (clearing an arrow never blocks another, so a greedy solver is complete).

## Files
`index.html`, `style.css`, `config.js` (name, size ramp, colors), `game.js` (cube grid, rules, generator, solver; also runs in Node), `audio.js` (WebAudio synth sounds), `main.js` (three.js rendering, input, hint, dialogs), `vendor/three.min.js` (three.js r187, MIT).

## Tests
- `node tests/unit.js 500` surface/wrapping, blocking rule, 500 generated levels + 200 hard-setting runs
- `PW_PATH=/path/to/playwright node tests/e2e.js http://127.0.0.1:8823/ screenshots` iPad portrait + landscape
