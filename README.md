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

The **MS Trollfjord ship tracker** lives at `/trollfjord/`. It uses plain HTML,
CSS, and JavaScript to draw a single vessel on a monochrome Leaflet map. No
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

The page shows position, speed, course, transmitted destination, navigational
status, and the original report time in UTC. It checks every 60 seconds while
visible and online. Updates preserve the map view; **Locate ship** recentres it.
The last successful ship report is saved locally and kept visible during
outages, with its original age. A successful refresh never changes an AIS
timestamp, and older server reports never replace a newer saved report.

Map tiles are OpenStreetMap's standard tiles rendered in grayscale. Attribution
stays visible and normal browser tile caching is preserved. Leaflet 1.9.4 is
vendored in `trollfjord/vendor/` with its BSD licence. The AIS data is published
by Kystverket under [NLOD](https://www.kystverket.no/en/navigation-and-monitoring/ais/access-to-ais-data/).
Run the tracker checks with `node --test trollfjord/tests/*.test.cjs`.
Publish these static files with the rest of the GitHub Pages site to make it
available at https://tayre.github.io/trollfjord/.
