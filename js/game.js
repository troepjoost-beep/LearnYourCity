// Game state machine.
//   TITLE -> MODES -> [round: ROUNDCARD -> PLAYING | ANSWERING -> REVEALING -> RESULT] x20 -> END
//
// Modes:
//   pin  - the street name is shown, the player clicks its location on the map
//   mc   - the street is lit up on the map, the player picks its name from 4 options
//   type - the street is lit up on the map, the player types its name
(function () {
  var $ = UI.$;
  var TOTAL_ROUNDS = 20;
  var HOME_VIEW = { center: [51.912, 4.47], zoom: 13 };

  var MODE_INFO = {
    pin: { label: "PINPOINT", stamps: { perfect: "PERFECT!", great: "GREAT!", close: "CLOSE", miss: "MISS" } },
    mc: { label: "4 CHOICES", stamps: { perfect: "CORRECT!", miss: "WRONG" } },
    type: { label: "TYPE IT", stamps: { perfect: "CORRECT!", great: "ALMOST!", miss: "WRONG" } }
  };

  var state = "TITLE";
  var mode = "pin";
  var map = null;
  var streets = [];
  var order = [];
  var round = 0;
  var score = 0;
  var results = [];
  var hiScores = { pin: 0, mc: 0, type: 0 };
  var layers = null; // Leaflet layer group for the current round's drawings
  var cancelTyping = null;

  // ---- Persistence -------------------------------------------------------

  function loadPrefs() {
    try {
      Object.keys(hiScores).forEach(function (m) {
        hiScores[m] = parseInt(localStorage.getItem("lyc_hiscore_" + m) || "0", 10) || 0;
      });
      // The original single-mode high score counts as the pinpoint score.
      var legacy = parseInt(localStorage.getItem("lyc_hiscore") || "0", 10) || 0;
      if (legacy > hiScores.pin) hiScores.pin = legacy;
      var m = localStorage.getItem("lyc_mode");
      if (MODE_INFO[m]) mode = m;
    } catch (e) {}
  }

  function saveHiScore() {
    try {
      localStorage.setItem("lyc_hiscore_" + mode, String(hiScores[mode]));
    } catch (e) {}
  }

  function saveMode() {
    try {
      localStorage.setItem("lyc_mode", mode);
    } catch (e) {}
  }

  // ---- Helpers -----------------------------------------------------------

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function currentStreet() {
    return streets[order[round - 1]];
  }

  function updateHud() {
    $("hud-round").textContent = UI.pad(round, 2);
    $("hud-total").textContent = UI.pad(TOTAL_ROUNDS, 2);
    $("hud-hi").textContent = UI.pad(hiScores[mode], 6);
    $("hud-mode").textContent = MODE_INFO[mode].label;
  }

  function renderModeButtons() {
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      var m = btn.getAttribute("data-mode");
      btn.querySelector(".mode-hi").textContent = "HI " + UI.pad(hiScores[m], 6);
      btn.classList.toggle("last", m === mode);
    });
    var best = Math.max(hiScores.pin, hiScores.mc, hiScores.type);
    $("title-hi").textContent = UI.pad(best, 6);
  }

  // Three wrong answers for multiple choice, drawn from the 8 streets nearest to the right one
  // so the options are plausible neighbours rather than random picks from across the city.
  function pickDistractors(street) {
    var others = streets
      .filter(function (s) { return s !== street; })
      .map(function (s) { return { s: s, d: Geo.distanceBetween(street.centroid, s.centroid) }; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, 8)
      .map(function (x) { return x.s; });
    return shuffle(others).slice(0, 3);
  }

  // ---- Map drawing -------------------------------------------------------

  function crosshairIcon() {
    return L.divIcon({
      className: "crosshair-marker",
      html: '<div class="crosshair"><span></span><span></span></div><div class="ripple"></div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  }

  function streetBounds(street) {
    var bounds = L.latLngBounds([]);
    street.lines.forEach(function (line) {
      line.forEach(function (pt) {
        bounds.extend(pt);
      });
    });
    return bounds;
  }

  // Draws the street with a glow layer and a "snake" draw-on animation.
  function revealStreet(street) {
    street.lines.forEach(function (line) {
      var glow = L.polyline(line, { className: "street-glow", interactive: false }).addTo(layers);
      var main = L.polyline(line, { className: "street-line", interactive: false }).addTo(layers);
      [glow, main].forEach(function (pl) {
        var path = pl.getElement && pl.getElement();
        if (!path || UI.reduceMotion || !path.getTotalLength) return;
        var len = path.getTotalLength();
        path.style.strokeDasharray = len + " " + len;
        path.style.strokeDashoffset = len;
        path.getBoundingClientRect(); // force layout so the transition runs
        path.style.transition = "stroke-dashoffset 900ms ease-out";
        path.style.strokeDashoffset = "0";
        // Once drawn, drop the dash styles so later zooms (which change the pixel length) stay solid.
        setTimeout(function () {
          path.style.transition = "";
          path.style.strokeDasharray = "";
          path.style.strokeDashoffset = "";
        }, 950);
      });
    });
  }

  function drawMissLine(from, to, distance) {
    L.polyline([from, to], { className: "miss-line", interactive: false }).addTo(layers);
    var mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    L.marker(mid, {
      icon: L.divIcon({
        className: "distance-label",
        html: "<span>" + Geo.formatDistance(distance) + "</span>",
        iconSize: [0, 0]
      }),
      interactive: false
    }).addTo(layers);
  }

  // ---- Flow --------------------------------------------------------------

  function showModes() {
    Sfx.unlock();
    Sfx.coin();
    state = "MODES";
    renderModeButtons();
    UI.hide($("title"));
    UI.hide($("end"));
    UI.show($("modes"));
  }

  function startGame(selectedMode) {
    mode = selectedMode;
    saveMode();
    Sfx.round();
    state = "STARTING";
    order = shuffle(streets.map(function (_, i) { return i; })).slice(0, TOTAL_ROUNDS);
    round = 0;
    score = 0;
    results = [];
    $("hud-score").textContent = UI.pad(0, 6);
    UI.hide($("modes"));
    UI.show($("hud"));
    setTimeout(nextRound, 300);
  }

  function nextRound() {
    if (state !== "RESULT" && state !== "STARTING") return; // ignore double presses mid-animation
    if (cancelTyping) cancelTyping();
    UI.hide($("result"));
    UI.hide($("answer"));
    UI.hide($("prompt"));
    layers.clearLayers();
    round++;
    if (round > TOTAL_ROUNDS) return endGame();
    updateHud();
    state = "ROUNDCARD";
    Sfx.round();
    if (mode === "pin") {
      map.flyTo(HOME_VIEW.center, HOME_VIEW.zoom, { duration: UI.reduceMotion ? 0 : 0.8 });
      $("prompt-name").textContent = "";
      UI.show($("prompt"));
      UI.roundCard("ROUND " + round, startPinRound);
    } else {
      UI.roundCard("ROUND " + round, startNameRound);
    }
  }

  // -- Pinpoint mode --

  function startPinRound() {
    state = "PLAYING";
    $("screen").classList.add("playing");
    cancelTyping = UI.typewriter($("prompt-name"), currentStreet().name.toUpperCase(), {
      sound: Sfx.blip
    });
  }

  function onMapClick(e) {
    if (state !== "PLAYING") return;
    state = "REVEALING"; // becomes RESULT once the panel is up, so NEXT can't skip the reveal
    $("screen").classList.remove("playing");
    if (cancelTyping) cancelTyping();
    UI.hide($("prompt"));

    var street = currentStreet();
    var click = [e.latlng.lat, e.latlng.lng];
    var hit = Geo.distanceToStreet(click, street);
    var pts = Geo.scoreForDistance(hit.distance);
    var rating = Geo.ratingForDistance(hit.distance);
    results.push({ name: street.name, mode: mode, distance: hit.distance, points: pts, rating: rating });

    Sfx.drop();
    L.marker(click, { icon: crosshairIcon(), interactive: false }).addTo(layers);

    var screenPt = map.latLngToContainerPoint(e.latlng);
    var mapRect = $("map").getBoundingClientRect();
    var px = mapRect.left + screenPt.x;
    var py = mapRect.top + screenPt.y;

    // Sequence: marker drops -> map flies to frame street + click -> street draws on -> result panel.
    var fly = UI.reduceMotion ? 0 : 700;
    setTimeout(function () {
      var bounds = streetBounds(street).extend(click);
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 16, duration: fly / 1000 });
    }, 300);

    setTimeout(function () {
      revealStreet(street);
      if (rating !== "perfect" && hit.nearest) drawMissLine(click, hit.nearest, hit.distance);
    }, 300 + fly + 100);

    setTimeout(function () {
      var detail = rating === "perfect" ? "ON THE STREET" : Geo.formatDistance(hit.distance) + " OFF";
      showResult(street, rating, pts, detail, px, py);
    }, 300 + fly + 600);
  }

  // -- Name modes (multiple choice / type) --

  // Frames the street in the part of the map not covered by the HUD or the panel.
  function flyToStreet(street, panel, duration) {
    map.flyToBounds(streetBounds(street), {
      paddingTopLeft: [30, 70],
      paddingBottomRight: [30, panel.offsetHeight + 40],
      maxZoom: 15,
      duration: duration / 1000
    });
  }

  function startNameRound() {
    var street = currentStreet();
    var panel = $("answer");
    var choices = $("answer-choices");
    var form = $("answer-form");
    choices.innerHTML = "";
    if (mode === "mc") {
      UI.show(choices);
      UI.hide(form);
      shuffle([street].concat(pickDistractors(street))).forEach(function (s, i) {
        var btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.setAttribute("data-name", s.name);
        btn.innerHTML = '<span class="choice-key">' + (i + 1) + "</span>";
        btn.appendChild(document.createTextNode(s.name.toUpperCase()));
        btn.addEventListener("click", function () {
          submitAnswer(s.name, btn);
        });
        choices.appendChild(btn);
      });
    } else {
      UI.hide(choices);
      UI.show(form);
      $("answer-input").value = "";
    }
    // Show the panel invisibly to measure it, fly the map so the street stays clear of it,
    // then draw the street and reveal the panel.
    panel.classList.add("measuring");
    UI.show(panel);
    var fly = UI.reduceMotion ? 0 : 800;
    flyToStreet(street, panel, fly);
    setTimeout(function () {
      revealStreet(street);
    }, fly + 100);
    setTimeout(function () {
      panel.classList.remove("measuring");
      state = "ANSWERING";
      if (mode === "type") $("answer-input").focus();
    }, fly + 500);
  }

  function submitAnswer(text, chosenBtn) {
    if (state !== "ANSWERING") return;
    text = (text || "").trim();
    if (!text) return;
    state = "REVEALING";

    var street = currentStreet();
    var match = Geo.matchName(text, street.name);
    var rating = match === "exact" ? "perfect" : match === "close" ? "great" : "miss";
    var pts = rating === "perfect" ? 1000 : rating === "great" ? 800 : 0;
    results.push({ name: street.name, mode: mode, answer: text, points: pts, rating: rating });

    // Colour the chosen / correct option before swapping to the result panel.
    if (mode === "mc") {
      document.querySelectorAll(".choice-btn").forEach(function (b) {
        b.disabled = true;
        if (b.getAttribute("data-name") === street.name) b.classList.add("correct");
      });
      if (rating === "miss" && chosenBtn) chosenBtn.classList.add("wrong");
    } else {
      $("answer-input").blur();
    }
    Sfx.drop();

    var rect = $("answer").getBoundingClientRect();
    var px = rect.left + rect.width / 2;
    var py = rect.top;
    setTimeout(function () {
      UI.hide($("answer"));
      var detail = rating === "perfect" ? "YOU GOT IT" : "YOU SAID: " + text.toUpperCase();
      showResult(street, rating, pts, detail, px, py);
    }, 800);
  }

  // -- Shared result handling --

  function showResult(street, rating, pts, detail, px, py) {
    state = "RESULT";
    var panel = $("result");
    $("result-name").textContent = street.name.toUpperCase();
    var stamp = $("result-rating");
    stamp.textContent = MODE_INFO[mode].stamps[rating];
    stamp.className = "stamp " + rating;
    $("result-distance").textContent = detail;
    $("result-points").textContent = "+" + pts;
    $("result-hint").textContent = street.hint || "";
    UI.show(panel);
    UI.flash(stamp, "slam");

    Sfx[rating]();
    if (rating === "miss") UI.shake($("cabinet"));
    if (rating === "perfect") UI.confetti(px, py, 36);
    UI.floatText("+" + pts, px, py - 20, rating);

    var from = score;
    score += pts;
    UI.rollNumber($("hud-score"), from, score, { width: 6, duration: 800, tick: Sfx.tick });
  }

  function rankFor(total) {
    if (total >= 18000) return "ECHTE ROTTERDAMMER";
    if (total >= 12000) return "LOCAL";
    if (total >= 6000) return "COMMUTER";
    return "TOURIST";
  }

  function endGame() {
    state = "END";
    UI.hide($("prompt"));
    var isNewHi = score > hiScores[mode];
    if (isNewHi) {
      hiScores[mode] = score;
      saveHiScore();
      updateHud();
    }

    var list = $("end-breakdown");
    list.innerHTML = "";
    results.forEach(function (r) {
      var li = document.createElement("li");
      li.className = r.rating;
      var detail;
      if (r.mode === "pin") detail = r.rating === "perfect" ? "HIT" : Geo.formatDistance(r.distance);
      else detail = r.rating === "perfect" ? "✓" : r.answer;
      li.innerHTML =
        "<span class=\"bd-name\"></span>" +
        "<span class=\"bd-dist\"></span>" +
        "<span class=\"bd-pts\">" + r.points + "</span>";
      li.querySelector(".bd-name").textContent = r.name;
      li.querySelector(".bd-dist").textContent = detail;
      list.appendChild(li);
    });

    $("end-mode").textContent = MODE_INFO[mode].label;
    $("end-rank").textContent = "";
    $("end-rank").className = "stamp";
    $("end-newhi").classList.toggle("hidden", !isNewHi);
    $("end-score").textContent = UI.pad(0, 6);
    UI.show($("end"));
    Sfx.fanfare();

    UI.rollNumber($("end-score"), 0, score, {
      width: 6,
      duration: 1600,
      tick: Sfx.tick,
      onDone: function () {
        $("end-rank").textContent = rankFor(score);
        UI.flash($("end-rank"), "slam");
      }
    });
  }

  function onAction() {
    if (state === "TITLE" || state === "END") showModes();
    else if (state === "RESULT") nextRound();
  }

  function init(leafletMap) {
    map = leafletMap;
    layers = L.layerGroup().addTo(map);
    streets = Geo.buildStreets(window.STREET_LIST, window.STREET_WAYS);
    loadPrefs();
    updateHud();
    renderModeButtons();

    map.on("click", onMapClick);
    $("btn-start").addEventListener("click", showModes);
    $("btn-next").addEventListener("click", nextRound);
    $("btn-again").addEventListener("click", showModes);
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        startGame(btn.getAttribute("data-mode"));
      });
    });
    $("answer-form").addEventListener("submit", function (e) {
      e.preventDefault();
      submitAnswer($("answer-input").value);
    });

    // Buttons drop focus after a click so Space/Enter always go to the game, not the last button.
    document.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.blur();
      });
    });
    document.addEventListener("keydown", function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === "BUTTON" || tag === "INPUT") return; // let a focused control handle its own keys
      if (state === "MODES" && /^Digit[123]$/.test(e.code)) {
        startGame(["pin", "mc", "type"][parseInt(e.code.slice(5), 10) - 1]);
      } else if (state === "ANSWERING" && mode === "mc" && /^Digit[1-4]$/.test(e.code)) {
        var btn = document.querySelectorAll(".choice-btn")[parseInt(e.code.slice(5), 10) - 1];
        if (btn) btn.click();
      } else if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        onAction();
      }
    });
  }

  window.Game = { init: init };
})();
