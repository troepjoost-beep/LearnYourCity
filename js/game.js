// Game state machine.
//   TITLE -> MODES -> [round: ROUNDCARD -> PLAYING | ANSWERING -> REVEALING -> RESULT] x20 -> END
//
// Modes:
//   pin  - the street name is shown, the player clicks its location on the map
//   mc   - the street is lit up on the map, the player picks its name from 4 options
//   type - the street is lit up on the map, the player types its name
(function () {
  var $ = UI.$;
  var MAX_ROUNDS = 20;
  var MIN_STREETS = 5;
  var HOME_VIEW = { center: [51.912, 4.47], zoom: 13 };

  var MODE_INFO = {
    pin: { label: "PINPOINT", stamps: { perfect: "PERFECT!", great: "GREAT!", close: "CLOSE", miss: "MISS" } },
    mc: { label: "4 CHOICES", stamps: { perfect: "CORRECT!", miss: "WRONG" } },
    type: { label: "TYPE IT", stamps: { perfect: "CORRECT!", great: "ALMOST!", miss: "WRONG" } }
  };

  // Learning mode: how many perfects a street still needs before it is mastered. Every miss
  // adds one (up to LEARN_MAX_NEEDED) and puts the street back a few rounds down the queue.
  var LEARN_MAX_NEEDED = 3;

  var state = "TITLE";
  var mode = "pin";
  var play = "game"; // "game" = 20 random streets for a high score, "learn" = master every street
  var map = null;
  var streets = [];
  var order = []; // game mode: the street objects for this game, in play order
  var current = null; // the street being asked about
  var totalRounds = MAX_ROUNDS;
  var disabled = {}; // street name -> true when switched off in settings
  var learn = null; // learning-mode progress: { queue, needed, mastered, stats, score, attempts }
  var round = 0;
  var score = 0;
  var results = [];
  var hiScores = { pin: 0, mc: 0, type: 0 };
  var layers = null; // Leaflet layer group for the current round's drawings
  var cancelTyping = null;
  var session = 0; // bumped whenever a game starts or is quit, so stale timeouts do nothing

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
      var off = JSON.parse(localStorage.getItem("lyc_disabled") || "[]");
      disabled = {};
      off.forEach(function (name) {
        disabled[name] = true;
      });
      var p = localStorage.getItem("lyc_play");
      if (p === "learn" || p === "game") play = p;
      var saved = JSON.parse(localStorage.getItem("lyc_learn") || "null");
      if (saved && saved.needed && saved.mastered) learn = saved;
    } catch (e) {}
  }

  function savePlay() {
    try {
      localStorage.setItem("lyc_play", play);
    } catch (e) {}
  }

  function saveLearn() {
    try {
      if (learn) localStorage.setItem("lyc_learn", JSON.stringify(learn));
      else localStorage.removeItem("lyc_learn");
    } catch (e) {}
  }

  function saveDisabled() {
    try {
      localStorage.setItem("lyc_disabled", JSON.stringify(Object.keys(disabled)));
    } catch (e) {}
  }

  function enabledStreets() {
    return streets.filter(function (s) {
      return !disabled[s.name];
    });
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
    return current;
  }

  function streetByName(name) {
    for (var i = 0; i < streets.length; i++) if (streets[i].name === name) return streets[i];
    return null;
  }

  function updateHud() {
    if (play === "learn") {
      $("hud-label").textContent = "DONE";
      $("hud-round").textContent = UI.pad(learnMasteredCount(), 2);
      $("hud-total").textContent = UI.pad(learnTotal(), 2);
      $("hud-hi").textContent = UI.pad(learn ? learn.queue.length : 0, 2);
      $("hud-hi-label").textContent = "LEFT";
    } else {
      $("hud-label").textContent = "ROUND";
      $("hud-round").textContent = UI.pad(round, 2);
      $("hud-total").textContent = UI.pad(totalRounds, 2);
      $("hud-hi").textContent = UI.pad(hiScores[mode], 6);
      $("hud-hi-label").textContent = "HI";
    }
    $("hud-mode").textContent = (play === "learn" ? "LEARN · " : "") + MODE_INFO[mode].label;
  }

  function renderModeButtons() {
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      var m = btn.getAttribute("data-mode");
      btn.querySelector(".mode-hi").textContent = "HI " + UI.pad(hiScores[m], 6);
      btn.classList.toggle("last", m === mode);
    });
    var best = Math.max(hiScores.pin, hiScores.mc, hiScores.type);
    $("title-hi").textContent = UI.pad(best, 6);

    var enabled = enabledStreets().length;
    var playable = enabled >= MIN_STREETS;
    $("title-enabled").textContent = enabled;
    $("modes-enabled").textContent = enabled;
    $("modes-warning").classList.toggle("hidden", playable);
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.disabled = !playable;
      // Per-mode high scores only mean something in game mode.
      btn.querySelector(".mode-hi").classList.toggle("hidden", play === "learn");
    });

    // Game / learn toggle and learning progress.
    document.querySelectorAll(".play-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-play") === play);
    });
    $("play-desc-game").classList.toggle("hidden", play !== "game");
    $("play-desc-learn").classList.toggle("hidden", play !== "learn");
    var inProgress = play === "learn" && learn && learn.attempts > 0;
    $("learn-progress").classList.toggle("hidden", !inProgress);
    if (inProgress) {
      $("learn-progress-text").textContent =
        "IN PROGRESS: " + learnMasteredCount() + "/" + learnTotal() + " MASTERED · " + learn.attempts + " TRIES";
    }
  }

  // ---- Learning mode -----------------------------------------------------

  function learnTotal() {
    return enabledStreets().length;
  }

  function learnMasteredCount() {
    if (!learn) return 0;
    return enabledStreets().filter(function (s) {
      return learn.mastered[s.name];
    }).length;
  }

  // Starts a fresh learning session, or resumes the saved one against the current street settings
  // (streets switched off in settings are skipped; newly enabled ones are added to the queue).
  function prepareLearn() {
    if (!learn) learn = { queue: [], needed: {}, mastered: {}, stats: {}, score: 0, attempts: 0 };
    var pool = enabledStreets();
    var inQueue = {};
    learn.queue = learn.queue.filter(function (name) {
      var s = streetByName(name);
      var keep = s && !disabled[name] && !learn.mastered[name] && !inQueue[name];
      if (keep) inQueue[name] = true;
      return keep;
    });
    var extra = pool.filter(function (s) {
      return !learn.mastered[s.name] && !inQueue[s.name];
    });
    learn.queue = learn.queue.concat(shuffle(extra).map(function (s) { return s.name; }));
    saveLearn();
  }

  function resetLearn() {
    learn = null;
    saveLearn();
    renderModeButtons();
    Sfx.miss();
  }

  // Called after every learning-mode answer. Returns a short status line for the result panel.
  function learnRecord(street, rating, pts) {
    var name = street.name;
    var stat = learn.stats[name] || { tries: 0, points: 0 };
    stat.tries++;
    stat.points += pts;
    learn.stats[name] = stat;
    learn.attempts++;
    learn.score += pts;
    var needed = learn.needed[name] || 1;
    var status;
    if (rating === "perfect") {
      needed--;
      if (needed <= 0) {
        learn.mastered[name] = true;
        delete learn.needed[name];
        status = "MASTERED! " + learn.queue.length + " TO GO";
      } else {
        learn.needed[name] = needed;
        requeue(name);
        status = "GOOD. " + needed + " MORE PERFECT" + (needed > 1 ? "S" : "") + " TO MASTER IT";
      }
    } else {
      needed = Math.min(LEARN_MAX_NEEDED, needed + 1);
      learn.needed[name] = needed;
      requeue(name);
      status = "COMES BACK SOON. NEEDS " + needed + " PERFECT" + (needed > 1 ? "S" : "");
    }
    saveLearn();
    return status;
  }

  // Puts a street back into the queue 2-6 rounds ahead (or at the end if the queue is shorter).
  function requeue(name) {
    var pos = Math.min(learn.queue.length, 2 + Math.floor(Math.random() * 5));
    learn.queue.splice(pos, 0, name);
  }

  function quitToMenu() {
    // Leaving mid-question: the current street hasn't been recorded yet, so ask it first next time.
    if (play === "learn" && learn && current && state !== "RESULT" && state !== "END") {
      learn.queue.unshift(current.name);
      saveLearn();
    }
    session++;
    if (cancelTyping) cancelTyping();
    layers.clearLayers();
    UI.hide($("result"));
    UI.hide($("answer"));
    UI.hide($("prompt"));
    UI.hide($("hud"));
    UI.hide($("end"));
    $("screen").classList.remove("playing");
    $("round-card").classList.remove("show");
    showModes();
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
    if (enabledStreets().length < MIN_STREETS) return;
    mode = selectedMode;
    saveMode();
    Sfx.round();
    session++;
    state = "STARTING";
    round = 0;
    results = [];
    if (play === "learn") {
      prepareLearn();
      score = learn.score;
    } else {
      var pool = enabledStreets();
      totalRounds = Math.min(MAX_ROUNDS, pool.length);
      order = shuffle(pool).slice(0, totalRounds);
      score = 0;
    }
    $("hud-score").textContent = UI.pad(score, 6);
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
    var card;
    if (play === "learn") {
      if (!learn.queue.length) return endGame();
      current = streetByName(learn.queue.shift());
      card = learn.queue.length + " LEFT";
    } else {
      if (round > totalRounds) return endGame();
      current = order[round - 1];
      card = "ROUND " + round;
    }
    updateHud();
    state = "ROUNDCARD";
    Sfx.round();
    var s = session;
    if (mode === "pin") {
      map.flyTo(HOME_VIEW.center, HOME_VIEW.zoom, { duration: UI.reduceMotion ? 0 : 0.8 });
      $("prompt-name").textContent = "";
      UI.show($("prompt"));
      UI.roundCard(card, function () {
        if (s === session) startPinRound();
      });
    } else {
      UI.roundCard(card, function () {
        if (s === session) startNameRound();
      });
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
    var s = session;
    var fly = UI.reduceMotion ? 0 : 700;
    setTimeout(function () {
      if (s !== session) return;
      var bounds = streetBounds(street).extend(click);
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 16, duration: fly / 1000 });
    }, 300);

    setTimeout(function () {
      if (s !== session) return;
      revealStreet(street);
      if (rating !== "perfect" && hit.nearest) drawMissLine(click, hit.nearest, hit.distance);
    }, 300 + fly + 100);

    setTimeout(function () {
      if (s !== session) return;
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
    var s = session;
    var fly = UI.reduceMotion ? 0 : 800;
    flyToStreet(street, panel, fly);
    setTimeout(function () {
      if (s === session) revealStreet(street);
    }, fly + 100);
    setTimeout(function () {
      if (s !== session) return;
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
    var s = session;
    setTimeout(function () {
      if (s !== session) return;
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
    var learnLine = $("result-learn");
    if (play === "learn") {
      learnLine.textContent = learnRecord(street, rating, pts);
      learnLine.className = "result-learn " + (rating === "perfect" ? "good" : "again");
      UI.show(learnLine);
      updateHud();
    } else {
      UI.hide(learnLine);
    }
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

  // Rank by share of the maximum possible score, so shorter games (fewer enabled streets) rank fairly.
  // In learning mode every attempt counts, so repeated misses cost rank.
  function rankFor(total) {
    var rounds = play === "learn" ? Math.max(1, learn.attempts) : totalRounds;
    var share = total / (rounds * 1000);
    if (share >= 0.9) return "ECHTE ROTTERDAMMER";
    if (share >= 0.6) return "LOCAL";
    if (share >= 0.3) return "COMMUTER";
    return "TOURIST";
  }

  function addBreakdownRow(list, cls, name, detail, points) {
    var li = document.createElement("li");
    li.className = cls;
    li.innerHTML =
      "<span class=\"bd-name\"></span>" +
      "<span class=\"bd-dist\"></span>" +
      "<span class=\"bd-pts\">" + points + "</span>";
    li.querySelector(".bd-name").textContent = name;
    li.querySelector(".bd-dist").textContent = detail;
    list.appendChild(li);
  }

  function endGame() {
    state = "END";
    UI.hide($("prompt"));
    var list = $("end-breakdown");
    list.innerHTML = "";
    var isNewHi = false;
    var rank = null;

    if (play === "learn") {
      // Every street mastered: list the ones that took the most tries first.
      var names = Object.keys(learn.stats).sort(function (a, b) {
        return learn.stats[b].tries - learn.stats[a].tries;
      });
      names.forEach(function (name) {
        var st = learn.stats[name];
        var cls = st.tries === 1 ? "perfect" : st.tries === 2 ? "great" : st.tries === 3 ? "close" : "miss";
        addBreakdownRow(list, cls, name, st.tries + (st.tries === 1 ? " TRY" : " TRIES"), st.points);
      });
      $("end-title").textContent = "ALL MASTERED!";
      $("end-mode").textContent = "LEARN · " + MODE_INFO[mode].label + " · " + learn.attempts + " TRIES";
      rank = rankFor(score);
      learn = null; // the course is complete; the next learning session starts fresh
      saveLearn();
    } else {
      isNewHi = score > hiScores[mode];
      if (isNewHi) {
        hiScores[mode] = score;
        saveHiScore();
        updateHud();
      }
      results.forEach(function (r) {
        var detail;
        if (r.mode === "pin") detail = r.rating === "perfect" ? "HIT" : Geo.formatDistance(r.distance);
        else detail = r.rating === "perfect" ? "✓" : r.answer;
        addBreakdownRow(list, r.rating, r.name, detail, r.points);
      });
      $("end-title").textContent = "GAME OVER";
      $("end-mode").textContent = MODE_INFO[mode].label;
    }

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
        $("end-rank").textContent = rank || rankFor(score);
        UI.flash($("end-rank"), "slam");
      }
    });
  }

  // ---- Street settings ---------------------------------------------------

  var settingsReturnTo = "TITLE";

  // Builds the grouped checkbox list once; later changes only toggle classes and counts.
  function buildSettings() {
    var list = $("settings-list");
    list.innerHTML = "";
    var groups = {};
    var groupOrder = [];
    streets.forEach(function (s) {
      var area = s.area || "Other";
      if (!groups[area]) {
        groups[area] = [];
        groupOrder.push(area);
      }
      groups[area].push(s);
    });
    groupOrder.forEach(function (area) {
      var section = document.createElement("div");
      section.className = "settings-group";
      var head = document.createElement("div");
      head.className = "settings-group-head";
      var title = document.createElement("span");
      title.className = "settings-group-title";
      title.textContent = area.toUpperCase();
      var count = document.createElement("span");
      count.className = "settings-group-count";
      var toggle = document.createElement("button");
      toggle.className = "toggle-btn";
      toggle.type = "button";
      toggle.textContent = "TOGGLE";
      toggle.addEventListener("click", function () {
        // Enable the whole area unless every street in it is already on, then disable it.
        var allOn = groups[area].every(function (s) { return !disabled[s.name]; });
        groups[area].forEach(function (s) {
          if (allOn) disabled[s.name] = true;
          else delete disabled[s.name];
        });
        settingsChanged();
      });
      head.appendChild(title);
      head.appendChild(count);
      head.appendChild(toggle);
      section.appendChild(head);

      var grid = document.createElement("div");
      grid.className = "settings-grid";
      groups[area].forEach(function (s) {
        var label = document.createElement("label");
        label.className = "street-toggle";
        label.setAttribute("data-name", s.name);
        label.setAttribute("data-area", area);
        var box = document.createElement("input");
        box.type = "checkbox";
        box.addEventListener("change", function () {
          if (box.checked) delete disabled[s.name];
          else disabled[s.name] = true;
          Sfx.blip();
          settingsChanged();
        });
        label.appendChild(box);
        label.appendChild(document.createTextNode(s.name));
        grid.appendChild(label);
      });
      section.appendChild(grid);
      list.appendChild(section);
    });
    settingsChanged();
  }

  // Syncs checkboxes, counts and the filter with the `disabled` map, then persists it.
  function settingsChanged() {
    var filter = Geo.normalizeName($("settings-filter").value);
    var perArea = {};
    document.querySelectorAll(".street-toggle").forEach(function (label) {
      var name = label.getAttribute("data-name");
      var area = label.getAttribute("data-area");
      var on = !disabled[name];
      label.querySelector("input").checked = on;
      label.classList.toggle("off", !on);
      label.classList.toggle("hidden", !!filter && Geo.normalizeName(name).indexOf(filter) < 0);
      perArea[area] = perArea[area] || { on: 0, total: 0 };
      perArea[area].total++;
      if (on) perArea[area].on++;
    });
    document.querySelectorAll(".settings-group").forEach(function (section) {
      var area = section.querySelector(".settings-group-title").textContent;
      var key = Object.keys(perArea).filter(function (k) { return k.toUpperCase() === area; })[0];
      var c = perArea[key] || { on: 0, total: 0 };
      section.querySelector(".settings-group-count").textContent = c.on + "/" + c.total;
      var anyVisible = section.querySelectorAll(".street-toggle:not(.hidden)").length > 0;
      section.classList.toggle("hidden", !anyVisible);
    });
    var enabled = enabledStreets().length;
    $("settings-count").textContent = enabled + "/" + streets.length;
    $("settings-count").classList.toggle("low", enabled < MIN_STREETS);
    saveDisabled();
    renderModeButtons();
  }

  function showSettings() {
    Sfx.unlock();
    Sfx.blip();
    settingsReturnTo = state === "MODES" ? "MODES" : "TITLE";
    state = "SETTINGS";
    UI.hide($("title"));
    UI.hide($("modes"));
    $("settings-filter").value = "";
    settingsChanged();
    UI.show($("settings"));
  }

  function closeSettings() {
    if (state !== "SETTINGS") return;
    UI.hide($("settings"));
    if (settingsReturnTo === "MODES") {
      state = "MODES";
      renderModeButtons();
      UI.show($("modes"));
    } else {
      state = "TITLE";
      UI.show($("title"));
    }
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

    document.querySelectorAll(".play-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        play = btn.getAttribute("data-play");
        savePlay();
        Sfx.blip();
        renderModeButtons();
      });
    });
    $("btn-learn-reset").addEventListener("click", resetLearn);
    $("btn-menu").addEventListener("click", quitToMenu);

    buildSettings();
    $("btn-settings").addEventListener("click", showSettings);
    $("btn-settings-2").addEventListener("click", showSettings);
    $("btn-settings-done").addEventListener("click", closeSettings);
    $("btn-all").addEventListener("click", function () {
      disabled = {};
      settingsChanged();
    });
    $("btn-none").addEventListener("click", function () {
      streets.forEach(function (s) {
        disabled[s.name] = true;
      });
      settingsChanged();
    });
    $("settings-filter").addEventListener("input", settingsChanged);

    // Buttons drop focus after a click so Space/Enter always go to the game, not the last button.
    document.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.blur();
      });
    });
    document.addEventListener("keydown", function (e) {
      var tag = e.target && e.target.tagName;
      if (e.code === "Escape" && state === "SETTINGS") return closeSettings();
      if (e.code === "Escape" && !$("hud").classList.contains("hidden") && state !== "END") return quitToMenu();
      if (tag === "BUTTON" || tag === "INPUT") return; // let a focused control handle its own keys
      if (state === "SETTINGS") return;
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
