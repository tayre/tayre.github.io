Most of the source in this repo is driving the GH pages at https://tayre.github.io

The Blue Jays Wild Card dashboard lives at `/jays/`. It uses plain HTML, CSS, and JavaScript
to fetch MLB scores and standings directly from the public Stats API every 20 seconds while the
tab is visible. No backend, API key, dependencies, or build step are required.
Dates and game times use Toronto time. MLB data can lag behind the game.
Scores include hits, errors, and team records. **Game stats** shows runs by inning
and team batting/pitching totals, always visible.
Use **Next game** to jump to the next scheduled matchup, including across off days.
Upcoming games show both probable pitchers, or TBD until MLB announces them.
The AL Wild Card table highlights Toronto, marks the third-place cutoff, and shows
selected-day scores for the teams ahead and nearby challengers. Expand **Rest of
the AL** for the remaining teams. Standings use the selected date (or today for
future games), exclude division leaders, and reflect completed games rather than
live projections. All 30 team logos are served locally from `jays/logos/`.

Preview locally with `python3 -m http.server 8000`, then open
http://localhost:8000/jays/. Deploy through the repository's existing GitHub Pages
workflow; the app will be available at https://tayre.github.io/jays/.

The **MS Trollfjord tracker** lives at `/trollfjord/`. It follows MS Trollfjord
using plain HTML, CSS, and JavaScript on a minimal WebGL vector map. No
iframe, backend, API key, package installation, or build step is required.
Open http://localhost:8000/trollfjord/ using the preview server above.

The browser reads the Norwegian Coastal Administration's public
[Kystdatahuset GeoJSON feed](https://kystdatahuset.kystverket.no/ws/swagger/index.html)
at `https://kystdatahuset.kystverket.no/ws/api/ais/realtime/geojson?aisShipType=60`.
This endpoint allows cross-origin requests without credentials. `data.js`
selects MMSI **258465000** / IMO **9233258**, validates coordinates and timestamps,
and converts AIS unavailable values to blanks. The final GeoJSON track point
is the reported position; the other points supply the available short trail.
The service retains recent positions for up to 20 minutes, so this is **not a
24-hour track**. Coverage is Norwegian waters and reception can be delayed.

The family view shows an illustrated ship, speed in km/h, and latitude.
Distances update with each AIS report using the great-circle formula and a
mean Earth radius of 6,371.0088 km, rounded to whole kilometres. They are
approximate surface distances, not driving or sailing routes. The North Pole
reference is 90° N; the Guelph reference in `explorer-data.mjs` is the supplied
address, matched by Nominatim to [OpenStreetMap building 949902627](https://www.openstreetmap.org/way/949902627).
The page displays only “Guelph, Ontario” as the reference label. Coordinates
are configured locally; opening the page does not repeat the geocoding request.
The map includes an approximate Arctic Circle line at 66.56° N.
**Find the ship** zooms in; **All of Norway** shows the wider coast.


**The captain’s numbers** always shows position, speed in knots, course,
transmitted destination, navigational status, and report time in UTC.
The page checks every 60 seconds while visible and online. Updates preserve the map view.
The last successful ship report is saved locally and kept visible during
outages, with its original age. A successful refresh never changes an AIS
timestamp, and older server reports never replace a newer saved report.

MapLibre GL JS renders OpenFreeMap's OpenStreetMap vector tiles using WebGL.
The local style in `trollfjord/map-style.mjs` uses pale blue water, warm white
land, muted green vegetation, and a teal ship and track. The view stays flat
and north-up with sparse labels. Attribution remains visible. MapLibre GL JS
6.11.2, its worker and shared module are vendored in `trollfjord/vendor/` with
the BSD licence. No bundler is needed. If WebGL is unavailable, the AIS text
readout continues updating and the page explains the map failure. The AIS data is published
by Kystverket under [NLOD](https://www.kystverket.no/en/navigation-and-monitoring/ais/access-to-ais-data/).
Run the tracker checks with `node --test trollfjord/tests/*.test.cjs`.
Publish these static files with the rest of the GitHub Pages site to make it
available at https://tayre.github.io/trollfjord/.

The **depth-three circuit lower bound paper** lives at
[`/depth-three/`](https://tayre.github.io/depth-three/). Its directory contains
the revised PDF, standalone LaTeX sources, two Python diagnostic scripts, and
[a short reproduction guide](depth-three/README.md). The static landing page
provides the abstract, citation metadata, and direct resource links. The root
robots file permits crawling the homepage and this directory, and advertises
the paper's sitemap. Google decides whether and when to index the content.
