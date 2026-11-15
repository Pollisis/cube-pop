# Cube Pop

A calm 3D arrow puzzle for the browser (made for iPad). Original code, art and sounds. No ads, no timer, no lives.

Play: https://pollisis.github.io/cube-pop/

## How to play
- **Tap a block** to send it flying the way its arrow points. A dot means the arrow points straight at you.
- It only goes if **nothing is anywhere in its way** along that line. A blocked block flashes blue, bumps the block in its way (pink) and slides back. Blocked taps cost nothing.
- **Drag** anywhere to spin the shape; pinch (or mouse wheel) to zoom. The counter at the top shows how many blocks are left; pop them all to clear the level.

## Helpers (free, earned by clearing levels, banked on the device)
Each one asks before it's used. Using any helper caps that level at 2 stars (3+ uses = 1 star).
- 💡 **Hint** (from level 1, +1 per new level cleared): lights up a block you can pop now, turning the shape toward you if needed.
- 🔨 **Hammer** (unlocks at level 3, +1 every 3 levels): pop any one block, even a blocked one. Tap the button again to put it away.
- 🪄 **Wand** (unlocks at level 6, +1 every 5 levels): pops up to 5 free blocks.
After 8 idle seconds the Hint button wiggles; on levels 1-3 a free block also wiggles as a tutorial nudge (free).

## Levels
Endless, generated from the level number (same level every time). Levels 1-20 are a hand-picked ramp (3x3 cube shell, solid cube, heart, 4x4 shell, pyramid, star, flower, cottage, kitty, tree, donut, mushroom, 5x5 shell, ball...), then a 20-shape cycle whose arrows keep getting trickier.

**Always solvable.** The generator builds each level backwards: blocks are placed in reverse pop order, from the center outward, and each new block may only point along a line with no already-placed block on it. Ordering by distance from the center guarantees an outward direction is always available. A greedy solver then double-checks every level (popping a block never blocks another, so greedy is complete). Difficulty comes from how often arrows are aimed through other blocks.

## Files
`index.html`, `style.css`, `config.js` (name + tuning), `game.js` (shapes, generator, solver, rules; also runs in Node), `audio.js` (WebAudio synth sounds), `main.js` (three.js rendering, input, helpers, dialogs), `vendor/three.min.js` (three.js r187, MIT).

## Tests
- `node tests/unit.js 500` rules + generates 500 levels (each solvable, replayable, deterministic) + 2,880 extra generator runs
- `PW_PATH=/path/to/playwright node tests/e2e.js http://127.0.0.1:8823/ screenshots` iPad e2e
