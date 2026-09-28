# Handshake

A 1990s home page that dials up the Internet. Open `index.html` in a browser, or serve this directory with any static web server. There is no build step, package installation, or backend.

- Press **Connect** in the Dial-Up Networking dialog to hear a real 56K modem handshake, with a Sound Recorder style line monitor and Windows 95 style status messages.
- **Cancel** or **Disconnect** stops the audio and resets the connection immediately.
- **Redial automatically** dials again six seconds after connecting. It can be changed during playback or after connecting.
- Speaker volume and mute work throughout the connection. Audio only starts after a click.
- A vacation photo loads automatically with the page at low resolution, then progressively fills in with detail. It deliberately stalls halfway, leaving the top half sharp and the bottom half pixelated. It runs independently of the modem; reduced motion shows the half-loaded result immediately.
- The period decoration includes a raised WordArt-style title, animated globe GIFs, Comic Sans, tiled backgrounds, a marquee, rainbow dividers, and a row of 88x31 badges. Reduced-motion preferences disable the animations and show a still globe.
- The seven-digit counter counts page loads in the current browser, starting at one, using localStorage. It is not a global visitor total. If storage is blocked, the page explains that the count is for the current visit only.
- The Web Ring visits the classic sites in **Cool Links**: AOL, MapQuest, Yahoo!, Lycos, and GeoCities. **Random** picks from that directory; **List Sites** jumps to it. It is a curated set of links, not an external webring service.

## The sound

`assets/dialup.mp3` is ["The Sound of dial-up Internet"](https://freesound.org/people/wtermini/sounds/546450/) by William Termini, the recording behind the well-known [YouTube clip](https://www.youtube.com/watch?v=gsNaR6FRuO0). It is released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain). The bundled copy is trimmed to the audible part and encoded as mono MP3.

The status simply shows Disconnected, Connecting, or Connected, with a countdown when automatic redial is enabled.

If the recording cannot be fetched or decoded, for example when `index.html` is opened straight from disk and the browser blocks `fetch()` on `file://`, the page falls back to a browser-synthesized approximation so the button still works.

## Preview locally

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. The site also works as a static GitHub Pages subdirectory. All assets are local; the network icon and badges are inline SVG.

The globe is the public-domain [Globe rotating.gif](https://commons.wikimedia.org/wiki/File:Globe_rotating.gif) from Wikimedia Commons, bundled unchanged (40 × 40 pixels, 36 frames). The PNG is its first frame for reduced-motion preferences.

The vacation photo is [Ocean beach sunset](https://commons.wikimedia.org/wiki/File:Ocean_beach_sunset.jpg) by Jon Sullivan, released into the public domain. The slow download is a local visual effect; it does not throttle or interrupt the actual image request.

The dialog uses [MS Sans Serif](https://fontstruct.com/fontstructions/show/1384746) and [MS Sans Serif Bold](https://fontstruct.com/fontstructions/show/1384862) by **lou**, licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The WOFF2 conversions are bundled unchanged from [98.css](https://github.com/jdan/98.css/tree/main/fonts/converted); font license notices are in `assets/fonts/`.
