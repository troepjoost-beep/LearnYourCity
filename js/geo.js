// Geometry helpers: distance from a clicked point to the nearest point on a street.
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
      return { name: s.name, hint: s.hint, lines: lines };
    });
  }

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

  window.Geo = {
    distanceToStreet: distanceToStreet,
    buildStreets: buildStreets,
    scoreForDistance: scoreForDistance,
    ratingForDistance: ratingForDistance,
    formatDistance: formatDistance,
    PERFECT_M: PERFECT_M
  };
})();
