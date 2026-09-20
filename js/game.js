// Game state machine: TITLE -> PLAYING (round n) -> RESULT -> ... -> END
(function () {
  var $ = UI.$;
  var TOTAL_ROUNDS = 20;
  var HOME_VIEW = { center: [51.917, 4.48], zoom: 14 };

  var RATING_LABEL = {
    perfect: "PERFECT!",
    great: "GREAT!",
    close: "CLOSE",
    miss: "MISS"
  };

  var state = "TITLE";
  var map = null;
  var streets = [];
  var order = [];
  var round = 0;
  var score = 0;
  var results = [];
  var hiScore = 0;
  var layers = null; // Leaflet layer group for the current round's drawings
  var cancelTyping = null;

  function loadHiScore() {
    try {
      hiScore = parseInt(localStorage.getItem("lyc_hiscore") || "0", 10) || 0;
    } catch (e) {
      hiScore = 0;
    }
  }

  function saveHiScore() {
    try {
      localStorage.setItem("lyc_hiscore", String(hiScore));
    } catch (e) {}
  }

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
    $("hud-hi").textContent = UI.pad(hiScore, 6);
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

  function startGame() {
    Sfx.unlock();
    Sfx.coin();
    state = "STARTING";
    order = shuffle(streets.map(function (_, i) { return i; }));
    round = 0;
    score = 0;
    results = [];
    $("hud-score").textContent = UI.pad(0, 6);
    UI.hide($("title"));
    UI.hide($("end"));
    UI.show($("hud"));
    setTimeout(nextRound, 300);
  }

  function nextRound() {
    if (state !== "RESULT" && state !== "STARTING") return; // ignore double presses mid-animation
    if (cancelTyping) cancelTyping();
    UI.hide($("result"));
    layers.clearLayers();
    round++;
    if (round > TOTAL_ROUNDS) return endGame();
    updateHud();
    map.flyTo(HOME_VIEW.center, HOME_VIEW.zoom, { duration: UI.reduceMotion ? 0 : 0.8 });
    state = "ROUNDCARD";
    $("prompt-name").textContent = "";
    UI.show($("prompt"));
    Sfx.round();
    UI.roundCard("ROUND " + round, function () {
      state = "PLAYING";
      $("screen").classList.add("playing");
      cancelTyping = UI.typewriter($("prompt-name"), currentStreet().name.toUpperCase(), {
        sound: Sfx.blip
      });
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
    results.push({ name: street.name, distance: hit.distance, points: pts, rating: rating });

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
      showResult(street, hit, pts, rating, px, py);
    }, 300 + fly + 600);
  }

  function showResult(street, hit, pts, rating, px, py) {
    state = "RESULT";
    var panel = $("result");
    $("result-name").textContent = street.name.toUpperCase();
    var stamp = $("result-rating");
    stamp.textContent = RATING_LABEL[rating];
    stamp.className = "stamp " + rating;
    $("result-distance").textContent =
      rating === "perfect" ? "ON THE STREET" : Geo.formatDistance(hit.distance) + " OFF";
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
    var isNewHi = score > hiScore;
    if (isNewHi) {
      hiScore = score;
      saveHiScore();
      updateHud();
    }

    var list = $("end-breakdown");
    list.innerHTML = "";
    results.forEach(function (r) {
      var li = document.createElement("li");
      li.className = r.rating;
      li.innerHTML =
        "<span class=\"bd-name\">" + r.name + "</span>" +
        "<span class=\"bd-dist\">" + (r.rating === "perfect" ? "HIT" : Geo.formatDistance(r.distance)) + "</span>" +
        "<span class=\"bd-pts\">" + r.points + "</span>";
      list.appendChild(li);
    });

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
    if (state === "TITLE" || state === "END") startGame();
    else if (state === "RESULT") nextRound();
  }

  function init(leafletMap) {
    map = leafletMap;
    layers = L.layerGroup().addTo(map);
    streets = Geo.buildStreets(window.STREET_LIST, window.STREET_WAYS);
    loadHiScore();
    updateHud();
    $("hud-total").textContent = UI.pad(TOTAL_ROUNDS, 2);
    $("title-hi").textContent = UI.pad(hiScore, 6);

    map.on("click", onMapClick);
    $("btn-start").addEventListener("click", startGame);
    $("btn-next").addEventListener("click", nextRound);
    $("btn-again").addEventListener("click", startGame);
    // Buttons drop focus after a click so Space/Enter always go to the game, not the last button.
    document.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.blur();
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.target && e.target.tagName === "BUTTON") return; // let a focused button handle its own key
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        onAction();
      }
    });
  }

  window.Game = { init: init };
})();
