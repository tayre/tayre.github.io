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
