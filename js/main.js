// Bootstrap: build the Leaflet map, wire the toggles, hand off to Game.
(function () {
  var $ = UI.$;

  var map = L.map("map", {
    center: [51.917, 4.48],
    zoom: 14,
    minZoom: 12,
    maxZoom: 17,
    maxBounds: [[51.84, 4.32], [52.0, 4.64]],
    maxBoundsViscosity: 0.8,
    zoomControl: false,
    attributionControl: true,
    doubleClickZoom: false
  });

  // OpenStreetMap-based vector basemap (OpenFreeMap "positron" style, no API key).
  // Street-name and road-shield layers are removed so the map doesn't give away answers.
  var basemap = L.maplibreGL({
    style: "https://tiles.openfreemap.org/styles/positron",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &middot; <a href="https://openfreemap.org">OpenFreeMap</a>'
  }).addTo(map);

  var glMap = basemap.getMaplibreMap();
  glMap.on("style.load", function () {
    glMap.getStyle().layers.forEach(function (layer) {
      if (layer.type !== "symbol") return;
      var id = layer.id;
      if (/^highway|^road|shield|^label_other$/.test(id)) glMap.removeLayer(id);
    });
  });

  L.control.zoom({ position: "topright" }).addTo(map);

  // Sound toggle
  var soundBtn = $("btn-sound");
  function renderSound() {
    soundBtn.textContent = Sfx.isMuted() ? "SND:OFF" : "SND:ON";
    soundBtn.classList.toggle("off", Sfx.isMuted());
  }
  soundBtn.addEventListener("click", function () {
    Sfx.unlock();
    Sfx.toggleMute();
    renderSound();
  });
  renderSound();

  // CRT scanline toggle
  var crtBtn = $("btn-crt");
  var crtOn = true;
  try {
    crtOn = localStorage.getItem("lyc_crt") !== "0";
  } catch (e) {}
  function renderCrt() {
    document.body.classList.toggle("no-crt", !crtOn);
    crtBtn.textContent = crtOn ? "CRT:ON" : "CRT:OFF";
    crtBtn.classList.toggle("off", !crtOn);
  }
  crtBtn.addEventListener("click", function () {
    crtOn = !crtOn;
    try {
      localStorage.setItem("lyc_crt", crtOn ? "1" : "0");
    } catch (e) {}
    renderCrt();
  });
  renderCrt();

  Game.init(map);
  window.lycMap = map; // handy for debugging in the console

  // Leaflet needs a nudge when the container size settles after fonts load.
  window.addEventListener("load", function () {
    setTimeout(function () {
      map.invalidateSize();
    }, 100);
  });
})();
