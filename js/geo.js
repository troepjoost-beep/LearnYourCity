// Geometry helpers: distance from a clicked point to the nearest point on a street,
// plus the name matching used by the "type it" mode.
// All maths is done in local metres using an equirectangular projection centred on
// Rotterdam, which is accurate to well under 1% across the city.
(function () {
  var LAT0 = 51.92;
  var LNG0 = 4.48;
  var M_PER_DEG_LAT = 110540;
  var M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

  function toXY(latlng) {
    return {
      x: (latlng[1] - LNG0) * M_PER_DEG_LNG,
      y: (latlng[0] - LAT0) * M_PER_DEG_LAT
    };
  }

  function toLatLng(p) {
    return [p.y / M_PER_DEG_LAT + LAT0, p.x / M_PER_DEG_LNG + LNG0];
  }

  // Closest point on segment ab to point p, in XY space.
  function closestOnSegment(p, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    var t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return { x: a.x + t * dx, y: a.y + t * dy };
  }

  function dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Straight-line distance in metres between two [lat, lng] points.
  function distanceBetween(a, b) {
    return dist(toXY(a), toXY(b));
  }

  // street.lines: array of polylines, each an array of [lat, lng].
  // Returns { distance (m), nearest: [lat, lng] }.
  function distanceToStreet(clickLatLng, street) {
    var p = toXY(clickLatLng);
    var best = Infinity;
    var bestPt = null;
    street.lines.forEach(function (line) {
      for (var i = 0; i < line.length - 1; i++) {
        var q = closestOnSegment(p, toXY(line[i]), toXY(line[i + 1]));
        var d = dist(p, q);
        if (d < best) {
          best = d;
          bestPt = q;
        }
      }
    });
    return { distance: best, nearest: bestPt ? toLatLng(bestPt) : null };
  }

  function centroidOf(lines) {
    var lat = 0;
    var lng = 0;
    var n = 0;
    lines.forEach(function (line) {
      line.forEach(function (pt) {
        lat += pt[0];
        lng += pt[1];
        n++;
      });
    });
    return n ? [lat / n, lng / n] : [LAT0, LNG0];
  }

  // Group raw OSM ways by name into street objects the game understands.
  function buildStreets(streetList, ways) {
    var byName = {};
    ways.forEach(function (w) {
      if (!byName[w.name]) byName[w.name] = [];
      byName[w.name].push(w.geometry);
    });
    return streetList.map(function (s) {
      var lines = byName[s.name] || [];
      if (!lines.length) console.warn("No geometry for street: " + s.name);
      return { name: s.name, hint: s.hint, lines: lines, centroid: centroidOf(lines) };
    });
  }

  // ---- Scoring (pinpoint mode) -------------------------------------------

  var PERFECT_M = 50;
  var ZERO_M = 1550;

  function scoreForDistance(d) {
    if (d <= PERFECT_M) return 1000;
    return Math.round(1000 * Math.max(0, 1 - (d - PERFECT_M) / (ZERO_M - PERFECT_M)));
  }

  function ratingForDistance(d) {
    if (d <= PERFECT_M) return "perfect";
    if (d <= 200) return "great";
    if (d <= 500) return "close";
    return "miss";
  }

  function formatDistance(d) {
    if (d < 1000) return Math.round(d) + " M";
    return (d / 1000).toFixed(1).replace(".", ",") + " KM";
  }

  // ---- Name matching (type-it mode) --------------------------------------

  // Lower-case, strip accents, unify ordinals/abbreviations, drop everything that
  // isn't a letter or digit: "Eerste Middellandstr." -> "1emiddellandstraat".
  function normalizeName(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\beerste\b/g, "1e")
      .replace(/\btweede\b/g, "2e")
      .replace(/str\.?(?=\s|$)/g, "straat")
      .replace(/[^a-z0-9]/g, "");
  }

  function levenshtein(a, b) {
    var prev = [];
    var i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // "exact" when the names match after normalisation, "close" for a small typo, else "wrong".
  function matchName(answer, name) {
    var a = normalizeName(answer);
    var n = normalizeName(name);
    if (!a) return "wrong";
    if (a === n) return "exact";
    var tolerance = n.length >= 10 ? 2 : n.length >= 5 ? 1 : 0;
    return levenshtein(a, n) <= tolerance ? "close" : "wrong";
  }

  window.Geo = {
    distanceToStreet: distanceToStreet,
    distanceBetween: distanceBetween,
    buildStreets: buildStreets,
    scoreForDistance: scoreForDistance,
    ratingForDistance: ratingForDistance,
    formatDistance: formatDistance,
    normalizeName: normalizeName,
    matchName: matchName,
    PERFECT_M: PERFECT_M
  };
})();
