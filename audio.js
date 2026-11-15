// Cube Pop sounds: all synthesized with WebAudio (no sound files).
(function () {
  var ctx = null, master = null, muted = false, noiseBuf = null;
  function unlock() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* no audio */ }
  }
  function ok() { return ctx && !muted && ctx.state === 'running'; }
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function tone(type, f0, f1, dur, peak, delay) {
    var t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.006, peak, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(f0, f1, q, dur, peak, delay) {
    var t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; b.type = 'bandpass'; b.Q.value = q; b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(b); b.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  var A = {
    unlock: unlock,
    setMuted: function (m) { muted = !!m; if (master) master.gain.value = muted ? 0 : 0.8; },
    pop: function (combo) { if (!ok()) return; var k = 1 + Math.min(combo || 0, 12) * 0.045; tone('sine', 720 * k, 300 * k, 0.11, 0.38); noise(2500, 1800, 2, 0.05, 0.12); },
    whoosh: function () { if (!ok()) return; noise(500, 2600, 0.9, 0.32, 0.16, 0.02); },
    bonk: function () { if (!ok()) return; tone('triangle', 210, 140, 0.13, 0.32); tone('sine', 105, 90, 0.1, 0.2); },
    click: function () { if (!ok()) return; tone('sine', 900, 700, 0.05, 0.15); },
    sparkle: function () { if (!ok()) return; [1320, 1760, 2093].forEach(function (f, i) { tone('sine', f, 0, 0.18, 0.12, i * 0.06); }); },
    chime: function () { if (!ok()) return; [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { tone('sine', f, 0, 0.7, 0.2, i * 0.09); tone('triangle', f * 2, 0, 0.25, 0.04, i * 0.09); }); },
    star: function (i) { if (!ok()) return; tone('sine', 880 * Math.pow(1.26, i), 0, 0.35, 0.22); }
  };
  window.CubeAudio = A;
})();
