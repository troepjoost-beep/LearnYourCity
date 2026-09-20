# Learn Your City – Rotterdam

A retro-arcade web game that teaches you the 100 most famous streets of Rotterdam,
20 per game, on a label-free OpenStreetMap basemap.

**Play it:** https://troepjoost-beep.github.io/LearnYourCity/

## How to play

Press **START** (or `Space` / `Enter`) and pick a mode:

| Mode | What happens | Scoring |
|------|--------------|---------|
| **1 · Pinpoint** | A street name appears; tap where it is on the map, then press **CONFIRM** (tap again or drag the marker to move it first). Any point along the street counts as a hit. | By distance to the nearest point of the street (table below). |
| **2 · 4 Choices** | A street lights up on the map; pick its name from four options (the wrong ones are nearby streets). Keys `1`–`4` work too. | 1000 correct, 0 wrong. |
| **3 · Type it** | A street lights up; type its name. Case, accents, spaces and hyphens are ignored; `1e`/`eerste` and `str.`/`straat` are equivalent. | 1000 exact, 800 for a small typo, 0 wrong. |

After 20 streets you get a final score, a rank and a per-street breakdown. High scores are
kept per mode in the browser. Every result also shows a short fact about the street.

**Game or Learn** (toggle on the mode screen):

- **Game** – 20 random streets, high score per mode.
- **Learn** – every enabled street, until you have mastered them all. A perfect answer removes a
  street; anything less puts it back 2–6 rounds later and it then needs one extra perfect (up to 3)
  before it counts as mastered. Progress is saved, so you can stop with **MENU** (or `Esc`) and
  continue later; **RESET** starts over. The end screen lists the streets that took the most tries.

**Settings** (⚙ button on the start and mode screens) lets you switch individual streets or
whole areas on or off, with a filter box and ALL / NONE buttons. A game then draws up to 20 of
the enabled streets (at least 5 must be enabled); ranks scale with the number of rounds. The
selection is remembered in the browser.

Pinpoint scoring per street (max 1000):

| Distance to street | Rating  | Points          |
|--------------------|---------|-----------------|
| ≤ 50 m             | PERFECT | 1000            |
| ≤ 200 m            | GREAT   | ~900            |
| ≤ 500 m            | CLOSE   | ~700            |
| > 500 m            | MISS    | down to 0 at 1.5 km |

Ranks (share of the maximum score): 90 %+ *Echte Rotterdammer* · 60 %+ *Local* · 30 %+ *Commuter* · otherwise *Tourist*.

## Running it locally

No build step, no dependencies to install. Pick one:

- **VS Code Live Server** – right-click `index.html` → *Open with Live Server*.
- **PowerShell** – `powershell -ExecutionPolicy Bypass -File tools/serve.ps1` then open <http://localhost:8765>.
- **Double-click `index.html`** – works too (everything is plain scripts, no `fetch`).

An internet connection is needed for the map tiles, Leaflet/MapLibre and the pixel font.
Every push to `main` is deployed to GitHub Pages automatically.

## Tech

- Plain HTML / CSS / JavaScript, no framework.
- [Leaflet](https://leafletjs.com) for map interaction and drawing.
- [OpenFreeMap](https://openfreemap.org) *positron* vector basemap (OpenStreetMap data, no API key)
  rendered through MapLibre GL; street-name layers are removed so the map doesn't give away answers.
- Street geometry from OpenStreetMap via the Overpass API, stored in `data/streets-raw.js`.
- Sound effects are synthesised with the Web Audio API (no audio files). Off by default.

## Project layout

```
index.html           page structure
css/style.css        arcade theme, CRT overlay, animations
js/geo.js            distance-to-street maths, scoring, typo-tolerant name matching
js/audio.js          Web Audio bleeps
js/ui.js             typewriter, score roll-up, popups, shake, confetti
js/game.js           game state machine and the three modes
js/main.js           map setup and wiring
data/streets.js      the 100 streets, their area and a hint for each
data/streets-raw.js  OSM way geometry for those streets
tools/serve.ps1      tiny static server for local development
.github/workflows    GitHub Pages deployment
```

## Changing the streets

1. Edit `data/streets.js` (names must match the OSM `name` tag exactly; `area` groups them in the settings screen).
2. Re-fetch the geometry for the whole municipality. Put the names in the regex and run:

```bash
curl -s -A "LearnYourCity/0.2" -X POST "https://overpass-api.de/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:90];area["name"="Rotterdam"]["admin_level"="8"]->.a;(way(area.a)["highway"]["name"~"^(Coolsingel|Lijnbaan|Meent)$"];);out geom;' \
  -o raw.json
```

3. Convert the response to the compact format in `data/streets-raw.js`
   (`window.STREET_WAYS = [{ geometry: [[lat, lng], ...], name: "..." }, ...];` — 5 decimals is enough).
   Check for names that occur in more than one place in the municipality (e.g. a lone way with
   the same name in Hoek van Holland) and drop the stray ones, otherwise the game treats both
   locations as correct.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Basemap tiles by [OpenFreeMap](https://openfreemap.org). Font: Press Start 2P (Google Fonts).
