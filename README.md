# Learn Your City – Rotterdam

A retro-arcade web game that teaches you the 20 most famous streets of Rotterdam.
A street name appears, you click where you think it is on a label-free map, and you
score points based on how close you were. Any point along the street counts as a hit,
so clicking the start, middle or end of a long or curved street is equally correct.

## How to play

1. Press **START** (or `Space` / `Enter`).
2. Read the street name, click its location on the map.
3. The real street lights up and your distance + points are shown. Press **NEXT**.
4. After 20 streets you get a final score, a rank and a per-street breakdown.

Scoring per street (max 1000):

| Distance to street | Rating  | Points          |
|--------------------|---------|-----------------|
| ≤ 50 m             | PERFECT | 1000            |
| ≤ 200 m            | GREAT   | ~900            |
| ≤ 500 m            | CLOSE   | ~700            |
| > 500 m            | MISS    | down to 0 at 1.5 km |

Ranks: 18 000+ *Echte Rotterdammer* · 12 000+ *Local* · 6 000+ *Commuter* · otherwise *Tourist*.
Your high score is saved in the browser.

## Running it

No build step, no dependencies to install. Pick one:

- **VS Code Live Server** – right-click `index.html` → *Open with Live Server*.
- **PowerShell** – `powershell -ExecutionPolicy Bypass -File tools/serve.ps1` then open <http://localhost:8765>.
- **Double-click `index.html`** – works too (everything is plain scripts, no `fetch`).

An internet connection is needed for the map tiles, Leaflet/MapLibre and the pixel font.

## Tech

- Plain HTML / CSS / JavaScript, no framework.
- [Leaflet](https://leafletjs.com) for map interaction and drawing.
- [OpenFreeMap](https://openfreemap.org) *positron* vector basemap (OpenStreetMap data, no API key)
  rendered through MapLibre GL; street-name layers are removed so the map doesn't give away answers.
- Street geometry from OpenStreetMap via the Overpass API, stored in `data/streets-raw.js`.
- Sound effects are synthesised with the Web Audio API (no audio files).

## Project layout

```
index.html           page structure
css/style.css        arcade theme, CRT overlay, animations
js/geo.js            distance-to-street maths and scoring
js/audio.js          Web Audio bleeps
js/ui.js             typewriter, score roll-up, popups, shake, confetti
js/game.js           game state machine
js/main.js           map setup and wiring
data/streets.js      the 20 streets + a hint for each
data/streets-raw.js  OSM way geometry for those streets
tools/serve.ps1      tiny static server for local development
```

## Changing the streets

1. Edit `data/streets.js` (names must match the OSM `name` tag exactly).
2. Re-fetch the geometry. Put the names in the regex below and run:

```bash
curl -s -A "LearnYourCity/0.1" -X POST "https://overpass-api.de/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:60];(way["highway"]["name"~"^(Coolsingel|Witte de Withstraat|Lijnbaan)$"](51.895,4.43,51.945,4.52););out geom;' \
  -o raw.json
```

3. Convert the response to the compact format in `data/streets-raw.js`
   (`window.STREET_WAYS = [{ geometry: [[lat, lng], ...], name: "..." }, ...];`).
   The bounding box keeps the query to central Rotterdam so duplicate street names in outlying
   districts aren't picked up.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Basemap tiles by [OpenFreeMap](https://openfreemap.org). Font: Press Start 2P (Google Fonts).
