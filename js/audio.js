// Tiny Web Audio synth for arcade bleeps. No audio files needed.
// The AudioContext is created lazily on the first user gesture (browser policy).
(function () {
  var ctx = null;
  // Sound is off by default; the player's choice is remembered once they toggle it.
  var muted = true;
  try {
    muted = localStorage.getItem("lyc_muted") !== "0";
  } catch (e) {}

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Play a single tone. type: oscillator type; freq: Hz (or [start, end] for a slide).
  function tone(freq, duration, type, volume, when) {
    if (muted) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (when || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || "square";
    if (Array.isArray(freq)) {
      osc.frequency.setValueAtTime(freq[0], t0);
      osc.frequency.exponentialRampToValueAtTime(freq[1], t0 + duration);
    } else {
      osc.frequency.setValueAtTime(freq, t0);
    }
    var v = volume == null ? 0.08 : volume;
    gain.gain.setValueAtTime(v, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  var Sfx = {
    unlock: function () {
      ensure();
    },
    isMuted: function () {
      return muted;
    },
    toggleMute: function () {
      muted = !muted;
      try {
        localStorage.setItem("lyc_muted", muted ? "1" : "0");
      } catch (e) {}
      if (!muted) Sfx.blip();
      return muted;
    },
    // Typewriter tick.
    blip: function () {
      tone(1200, 0.03, "square", 0.03);
    },
    // Coin insert / start.
    coin: function () {
      tone(988, 0.08, "square", 0.08);
      tone(1319, 0.3, "square", 0.08, 0.08);
    },
    // Marker drop.
    drop: function () {
      tone([600, 150], 0.18, "triangle", 0.1);
    },
    // Score counter tick.
    tick: function () {
      tone(1800, 0.02, "square", 0.02);
    },
    // Ratings.
    perfect: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(f, 0.12, "square", 0.08, i * 0.07);
      });
      tone(1319, 0.4, "square", 0.08, 0.3);
    },
    great: function () {
      tone(659, 0.1, "square", 0.08);
      tone(988, 0.25, "square", 0.08, 0.1);
    },
    close: function () {
      tone(440, 0.15, "square", 0.08);
      tone(554, 0.2, "square", 0.08, 0.12);
    },
    miss: function () {
      tone([220, 80], 0.45, "sawtooth", 0.12);
    },
    // Round card whoosh.
    round: function () {
      tone([300, 900], 0.2, "square", 0.05);
    },
    // Game over fanfare.
    fanfare: function () {
      var seq = [523, 523, 523, 659, 784, 659, 784, 1047];
      seq.forEach(function (f, i) {
        tone(f, i === seq.length - 1 ? 0.6 : 0.14, "square", 0.08, i * 0.13);
      });
    }
  };

  window.Sfx = Sfx;
})();
