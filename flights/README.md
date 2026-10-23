# Still

A quiet, phone-friendly flight companion for **GitHub Pages and Cloudflare Pages**. One-hour chapters, a gentle landscape, breathing and grounding exercises, small thoughts, and arrival weather. The offline companion needs no API keys or runtime dependencies. Optional live status uses a Cloudflare Pages Function and a flight-data API key.

## Use it on your flight

1. Open the site on your phone before boarding and wait for **Ready for offline**.
2. Select YYZ → SFO or the return journey. Your flights are prefilled: **AC 743 on October 25, 2026**, and **AC 4067, operated by United, on October 30**.
3. Tap **I’m flying now** to start your timer from that moment. If you’re partway through your flight, use **Already in the air?** to enter minutes since takeoff.
4. Follow the one-hour chapters. Your timer keeps its place through reloads, closing the tab, and phone sleep. Each direction has its own saved progress.
5. Use the mobile bottom bar for **Breathe** or **Feel grounded** at any time. The breathing guide offers a gentle 4-second inhale and 6-second exhale, with pause and reduced-motion support.
6. Tap **I’ve landed** when you arrive. Passing the planned duration never declares a landing automatically.

The outbound 5h 30m and return 4h 45m durations are starting estimates, not verified schedules. Adjust them using your crew’s announcement. The illustrated route follows elapsed time; it is not live tracking.

## GitHub Pages

Publish this folder with the existing repository’s GitHub Pages site. The entry point is `/flights/`. All paths are relative, and the checked-in `still.js` bundle is ready to serve without a build on GitHub. No worker, proxy, account, or server setup is needed for the app.

HTTPS enables offline caching. Open the page on the device you’ll use before departure and check **Ready for offline**. Browsers can clear saved data, so check again before each flight. The service worker caches only this app’s assets, leaving sibling sites alone.

## Weather

Arrival weather is fetched directly from [Open-Meteo](https://open-meteo.com/en/docs), only when you tap the weather button. It needs internet access; the last retrieved forecast is saved for offline viewing and labeled with its age.

Before takeoff, optionally enter your departure time using the departure airport’s local time. After you tap **I’m flying now**, your timer determines the estimated arrival. Overnight flights and the destination time zone are handled automatically. Weather uses the nearest forecast hour to that arrival, rather than silently substituting another date.

This is a model forecast near the airport, not a prediction of turbulence or an assessment of landing safety. There is no turbulence score or countdown. Follow crew guidance and keep your seat belt fastened while seated.

## Local preview and editing

Requires Node 20 or later, with no packages to install:

```sh
npm start
```

Open **http://127.0.0.1:4173/flights/**. The local server serves static files only, matching GitHub Pages. Opening `index.html` directly also runs the companion, but service-worker offline caching needs a local server or HTTPS hosting.

```sh
npm test       # timer, persistence normalization, time zones, and forecasts
npm run build # regenerate the checked-in browser bundle and offline version
```

Edit `app.js`, `core.js`, `index.html`, and `style.css`. After changes, run `npm run build` (also run by `npm start`) and include the regenerated `still.js` and `sw.js` when publishing. The small dependency-free packager hashes shell assets to update the offline cache. A subsequent reload uses the new version once downloaded.

Settings and downloaded weather stay in this browser. No external data is polled in the background. All illustrations are local SVGs and text uses system fonts.

## Sources

Sources are linked inside **About & sources**: [Open-Meteo / CC BY 4.0](https://open-meteo.com/), [FAA turbulence guidance](https://www.faa.gov/travelers/fly_safe/turbulence), [NWS turbulence explanation](https://www.weather.gov/zme/safety_turb), and [Marcus Aurelius, George Long translation, Book VII](https://classics.mit.edu/Antoninus/meditations.7.seven.html). The remaining thoughts are original or labeled as inspired by Stoic ideas.

## Cloudflare Pages (existing t0m project)

This keeps `/trollfjord/` and adds `/flights/` to the same deployment.
In the Build configuration shown in Cloudflare, use:

- Build command: `node scripts/build-pages.mjs`
- Build output directory: `dist`
- Root directory: leave blank (repository root)
- Production branch: `master`

Deploy the commit containing these changes. Cloudflare discovers the repository-root
`functions/` directory automatically. The build restricts Function invocations to
`/flights/api/*`; static assets and Trollfjord remain static. No Node server is needed
in production. The generated `dist/` directory is ignored by Git.

### Free live flight status

[Aviationstack’s free personal-use plan](https://aviationstack.com/pricing) currently
includes 100 requests per month, real-time flights, and HTTPS. Create a free key,
then add `AVIATIONSTACK_KEY` as a **secret** in the Pages project's Variables and
Secrets settings and redeploy. Never put the key in frontend code or commit it.
Only add it to Preview if you also want previews to use your quota.

Tap **Check flight status** to retrieve status, departure/arrival times, and arrival
gate when supplied. No background polling runs. Results are cached at the edge for
five minutes; the browser also prevents repeated checks within five minutes.
The cache is per Cloudflare location, not a global monthly quota: public visitors
can consume requests too. Check your provider usage dashboard.

Free real-time results may not include a future flight yet. The app matches the
exact airports and local departure date; it never substitutes another day's flight.
It does not use paid future or historical endpoints. Your illustrated route and
chapter timer remain manual, independent of reported status. Status data can lag.

The backend only permits the two journeys in `core.js`, within two days before and
seven days after departure. Editing a number/date in the browser does not expand
this allowlist. AC 4067 is a codeshare: if the provider cannot find it, set
`RETURN_FLIGHT_IDENT` to the operating United IATA number from your ticket (e.g.
`UA123`, using the actual number). `OUTBOUND_FLIGHT_IDENT` is also supported.

Alternatively, add `AEROAPI_KEY` for [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/).
When both secrets exist, Aviationstack takes precedence. The same override variables
apply; use an IATA identifier when using Aviationstack.

### Backend verification

`npm test` covers matching dates across time zones, exact routes, ambiguous results,
missing keys, cached responses, provider failures, and normalized data. Tests use
fixtures and make no paid API requests. A real response needs your provider key.
For full local Cloudflare testing, run `node scripts/build-pages.mjs`, then
`npx wrangler pages dev dist` from the repository root, with secrets in an ignored
root `.dev.vars` file. The usual `npm start` preview remains static-only.
