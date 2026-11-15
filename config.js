// Cube Pop settings. Change NAME here to rename the game everywhere.
(function (root) {
  var CONFIG = {
    NAME: 'Cube Pop',
    TAGLINE: 'Tap the arrows, pop the cube!',
    VERSION: 1,
    SAVE_KEY: 'cubepop.save.v1',
    // power-ups: starting bank, unlock level, and how many you earn
    POWERUPS: {
      hint:   { start: 3, unlock: 1, every: 1, label: 'Hint',   icon: '💡', desc: 'Lights up a block you can pop right now.' },
      hammer: { start: 2, unlock: 3, every: 3, label: 'Hammer', icon: '🔨', desc: 'Tap any block to pop it, even if it is blocked.' },
      wand:   { start: 1, unlock: 6, every: 5, label: 'Wand',   icon: '🪄', desc: 'Pops up to 5 free blocks for you.' }
    },
    WAND_POPS: 5,
    IDLE_NUDGE_SECONDS: 8,
    MAX_BLOCKS: 140,
    // soft pastel accents (background tint + pop flashes + confetti)
    PASTELS: ['#ffb3c7', '#ffd59e', '#fff0a0', '#b8f0c8', '#a8dcff', '#c9b8ff', '#ffc4f0'],
    ARROW_COLOR: '#1d1f3a'
  };
  if (typeof module === 'object' && module.exports) module.exports = CONFIG; else root.CUBE_CONFIG = CONFIG;
})(this);
