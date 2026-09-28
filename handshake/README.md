# Handshake

A 1990s home page that dials up the Internet. Open `index.html` in a browser, or serve this directory with any static web server. There is no build step, package installation, or backend.

- Press **Connect** in the Dial-Up Networking dialog to hear a real 56K modem handshake, with a Sound Recorder style line monitor and Windows 95 style status messages.
- **Cancel** or **Disconnect** stops the audio and resets the connection immediately.
- **Redial automatically** dials again six seconds after connecting. It can be changed during playback or after connecting.
- Speaker volume and mute work throughout the connection. Audio only starts after a click.
- The period decoration includes a raised WordArt-style title, spinning pixel globes, Comic Sans, tiled backgrounds, a marquee, rainbow dividers, and a row of 88x31 badges. Reduced-motion preferences disable the animations.
- The seven-digit counter counts page loads in the current browser, starting at one, using localStorage. It is not a global visitor total. If storage is blocked, the page explains that the count is for the current visit only.
- The Web Ring links to other projects on `tayre.github.io`. **Random** picks from the visible **Cool Links** directory; **List Sites** jumps to that directory. It is a curated set of links, not an external webring service.

## The sound

`assets/dialup.mp3` is ["The Sound of dial-up Internet"](https://freesound.org/people/wtermini/sounds/546450/) by William Termini, the recording behind the well-known [YouTube clip](https://www.youtube.com/watch?v=gsNaR6FRuO0). It is released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain). The bundled copy is trimmed to the audible part and encoded as mono MP3.

The on-screen status messages are timed to the recording's phases (dial tone, DTMF, V.8bis, answer tone, V.8 menus, line probing, training, and so on), following Oona Räisänen's [annotated spectrogram](https://www.windytan.com/2012/11/the-sound-of-dialup-pictured.html).

If the recording cannot be fetched or decoded, for example when `index.html` is opened straight from disk and the browser blocks `fetch()` on `file://`, the page falls back to a browser-synthesized approximation so the button still works.

## Preview locally

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. The site also works as a static GitHub Pages subdirectory. All assets are local; pixel graphics and badges are inline SVG.
