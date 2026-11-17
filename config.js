// Cube Pop settings. Change NAME here to rename the game everywhere.
(function (root) {
  var CONFIG = {
    NAME: 'Cube Pop',
    VERSION: 2,
    SAVE_KEY: 'cubepop.save.v2',
    OLD_SAVE_KEY: 'cubepop.save.v1',
    HINT_COOLDOWN: 2.5,       // seconds between free hints
    IDLE_NUDGE_SECONDS: 8,    // the lightbulb wiggles after this long with no move
    // grid size per level: grows, then caps so it never gets impossible
    SIZE_RAMP: [[3, 4], [6, 5], [10, 6], [14, 7], [19, 8], [29, 9]], // [last level, size]
    SIZE_CAP: 10,
    ARROW_COLOR: '#23263f',
    HINT_COLOR: '#f4b62a',
    BLOCKED_COLOR: '#2f7cf6',
    BLOCKER_COLOR: '#ff8fb1',
    PASTELS: ['#ffb3c7', '#ffd59e', '#fff0a0', '#b8f0c8', '#a8dcff', '#c9b8ff', '#ffc4f0']
  };
  if (typeof module === 'object' && module.exports) module.exports = CONFIG; else root.CUBE_CONFIG = CONFIG;
})(this);
