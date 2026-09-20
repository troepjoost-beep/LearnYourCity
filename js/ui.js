// DOM / animation helpers for the arcade UI.
(function () {
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  function $(id) {
    return document.getElementById(id);
  }

  function pad(n, width) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < width) s = "0" + s;
    return s;
  }

  // Types `text` into `el` one character at a time. Returns a cancel function.
  function typewriter(el, text, opts) {
    opts = opts || {};
    var speed = reduceMotion ? 0 : opts.speed || 45;
    el.textContent = "";
    el.classList.add("typing");
    var i = 0;
    var timer = null;
    function step() {
      if (i >= text.length) {
        el.classList.remove("typing");
        if (opts.onDone) opts.onDone();
        return;
      }
      el.textContent += text.charAt(i++);
      if (text.charAt(i - 1) !== " " && opts.sound) opts.sound();
      timer = setTimeout(step, speed);
    }
    if (speed === 0) {
      el.textContent = text;
      el.classList.remove("typing");
      if (opts.onDone) opts.onDone();
    } else {
      step();
    }
    return function cancel() {
      clearTimeout(timer);
      el.textContent = text;
      el.classList.remove("typing");
    };
  }

  // Animates a number in `el` from `from` to `to` with zero padding.
  function rollNumber(el, from, to, opts) {
    opts = opts || {};
    var width = opts.width || 0;
    var duration = reduceMotion ? 0 : opts.duration || 700;
    if (duration === 0) {
      el.textContent = pad(to, width);
      if (opts.onDone) opts.onDone();
      return;
    }
    var start = null;
    var lastTick = 0;
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      var value = Math.round(from + (to - from) * eased);
      el.textContent = pad(value, width);
      if (opts.tick && ts - lastTick > 40 && t < 1) {
        opts.tick();
        lastTick = ts;
      }
      if (t < 1) requestAnimationFrame(frame);
      else if (opts.onDone) opts.onDone();
    }
    requestAnimationFrame(frame);
  }

  // Floats a short text up from a screen position and removes it.
  function floatText(text, x, y, className) {
    var el = document.createElement("div");
    el.className = "float-text " + (className || "");
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    el.addEventListener("animationend", function () {
      el.remove();
    });
    if (reduceMotion) setTimeout(function () { el.remove(); }, 1200);
  }

  function shake(el) {
    if (reduceMotion) return;
    el.classList.remove("shake");
    void el.offsetWidth; // restart animation
    el.classList.add("shake");
    el.addEventListener("animationend", function handler() {
      el.classList.remove("shake");
      el.removeEventListener("animationend", handler);
    });
  }

  function flash(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  // Pixel confetti burst around a screen position.
  function confetti(x, y, count) {
    if (reduceMotion) return;
    var colors = ["#ff2ea6", "#2ef2ff", "#ffe600", "#7dff2e", "#ff7a2e"];
    for (var i = 0; i < (count || 28); i++) {
      var p = document.createElement("div");
      p.className = "confetti";
      p.style.left = x + "px";
      p.style.top = y + "px";
      p.style.background = colors[i % colors.length];
      var angle = Math.random() * Math.PI * 2;
      var dist = 60 + Math.random() * 120;
      p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--dy", Math.sin(angle) * dist - 80 + "px");
      p.style.animationDelay = Math.random() * 80 + "ms";
      document.body.appendChild(p);
      p.addEventListener("animationend", function () {
        this.remove();
      });
    }
  }

  // Shows the "ROUND N" card. Calls onDone when it has left the screen.
  function roundCard(text, onDone) {
    var el = $("round-card");
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    var ms = reduceMotion ? 300 : 1300;
    setTimeout(function () {
      el.classList.remove("show");
      if (onDone) onDone();
    }, ms);
  }

  function show(el) {
    el.classList.remove("hidden");
  }

  function hide(el) {
    el.classList.add("hidden");
  }

  window.UI = {
    $: $,
    pad: pad,
    typewriter: typewriter,
    rollNumber: rollNumber,
    floatText: floatText,
    shake: shake,
    flash: flash,
    confetti: confetti,
    roundCard: roundCard,
    show: show,
    hide: hide,
    reduceMotion: reduceMotion
  };
})();
