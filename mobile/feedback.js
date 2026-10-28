// Sound and vibration feedback for taps and game events.
//
// Sounds are synthesised with WebAudio (no audio files to download), kept
// short and quiet. Both channels can be switched off in Settings; the choice
// is stored per device under "anra-feedback".
//
//   Feedback.play("tap" | "confirm" | "deal" | "credit" | "run" | "success"
//                 | "score" | "damage" | "win" | "lose")
(function () {
  var KEY = "anra-feedback";
  var prefs = { sound: true, haptics: true };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (e) {}

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch (e) {}
  }

  // ---- Audio ---------------------------------------------------------------

  var ctx = null;
  var master = null;
  function audio() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    return ctx;
  }
  // Browsers only allow audio after a user gesture.
  function unlock() {
    var c = audio();
    if (c && c.state === "suspended") c.resume();
  }
  document.addEventListener("pointerdown", unlock, { capture: true, passive: true });

  // One enveloped oscillator note.
  function tone(freq, start, dur, opts) {
    opts = opts || {};
    var c = ctx;
    var t = c.currentTime + start;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    var peak = opts.gain == null ? 0.5 : opts.gain;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + (opts.attack || 0.006));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var node = osc;
    if (opts.lowpass) {
      var filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = opts.lowpass;
      osc.connect(filter);
      node = filter;
    }
    node.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // A burst of filtered noise, for card swishes.
  var noiseBuffer = null;
  function noise(start, dur, freq, gainValue) {
    var c = ctx;
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    var t = c.currentTime + start;
    var src = c.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 2.2, t + dur);
    filter.Q.value = 0.8;
    var gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(gainValue, t + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  var SOUNDS = {
    tap: function () {
      tone(1850, 0, 0.035, { gain: 0.12, type: "triangle" });
    },
    confirm: function () {
      tone(660, 0, 0.09, { gain: 0.22, type: "triangle" });
      tone(990, 0.06, 0.12, { gain: 0.2, type: "triangle" });
    },
    deal: function () {
      noise(0, 0.13, 1400, 0.22);
      noise(0.07, 0.13, 1700, 0.18);
    },
    credit: function () {
      tone(1320, 0, 0.08, { gain: 0.16 });
      tone(1980, 0.045, 0.16, { gain: 0.13 });
    },
    run: function () {
      tone(110, 0, 0.45, { type: "sawtooth", to: 220, gain: 0.16, attack: 0.08, lowpass: 900 });
      tone(165, 0.05, 0.4, { type: "sawtooth", to: 330, gain: 0.08, attack: 0.08, lowpass: 900 });
    },
    success: function () {
      tone(523, 0, 0.12, { gain: 0.2, type: "triangle" });
      tone(659, 0.08, 0.12, { gain: 0.2, type: "triangle" });
      tone(784, 0.16, 0.22, { gain: 0.2, type: "triangle" });
    },
    score: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(f, i * 0.07, 0.3, { gain: 0.18, type: "triangle" });
      });
    },
    damage: function () {
      tone(160, 0, 0.28, { type: "square", to: 55, gain: 0.18, lowpass: 600 });
      noise(0, 0.12, 300, 0.25);
    },
    win: function () {
      [523, 659, 784, 1047, 1319].forEach(function (f, i) {
        tone(f, i * 0.09, 0.5, { gain: 0.16, type: "triangle" });
      });
    },
    lose: function () {
      [392, 330, 262, 196].forEach(function (f, i) {
        tone(f, i * 0.14, 0.45, { gain: 0.16, type: "triangle", lowpass: 1600 });
      });
    },
  };

  // ---- Vibration -----------------------------------------------------------

  var PATTERNS = {
    tap: 8,
    confirm: 14,
    deal: 10,
    credit: 6,
    run: [18, 40, 18],
    success: [12, 50, 24],
    score: [16, 40, 16, 40, 30],
    damage: [45, 35, 70],
    win: [25, 50, 25, 50, 60],
    lose: [90, 60, 140],
  };

  // Rapid repeats (e.g. several credits at once) shouldn't machine-gun.
  var lastPlayed = {};

  window.Feedback = {
    get sound() {
      return prefs.sound;
    },
    get haptics() {
      return prefs.haptics;
    },
    setSound: function (on) {
      prefs.sound = !!on;
      save();
      if (on) {
        unlock();
        this.play("confirm");
      }
    },
    setHaptics: function (on) {
      prefs.haptics = !!on;
      save();
      if (on) this.play("confirm");
    },
    play: function (name) {
      var now = Date.now();
      if (lastPlayed[name] && now - lastPlayed[name] < 60) return;
      lastPlayed[name] = now;
      if (prefs.haptics && navigator.vibrate && PATTERNS[name] != null) {
        try {
          navigator.vibrate(PATTERNS[name]);
        } catch (e) {}
      }
      // Nothing is audible before the first tap anyway; don't create the
      // audio context early (browsers warn about it).
      var activated = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (prefs.sound && SOUNDS[name] && activated && audio() && ctx.state === "running") {
        try {
          SOUNDS[name]();
        } catch (e) {}
      }
    },
  };

  // Every tappable control gets a tick; dialog choices and the primary
  // action get a slightly fuller "confirm".
  var TAPPABLE =
    "button, .button, .menu-item, .menu-item-sub, .tutorial-item, .icon-button, " +
    ".modal-content span, .modal-content p[onclick], .segmented label, .switch-label, " +
    ".checkbox-label, .precon-item, .anra-reader-close, label.button";
  document.addEventListener(
    "pointerdown",
    function (e) {
      var el = e.target.closest && e.target.closest(TAPPABLE);
      if (!el || el.disabled || el.classList.contains("disabled")) return;
      var primary =
        el.matches(".menu-item-primary, .button.primary, #footerbutton-n, .modal-content span, .modal-content p[onclick]");
      window.Feedback.play(primary ? "confirm" : "tap");
    },
    { capture: true, passive: true },
  );
})();
