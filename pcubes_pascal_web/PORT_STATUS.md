# pCubes Pascal-to-browser port status

## Present in this repository
- Browser UI in `web/index.html`.
- Pascal-to-JavaScript bridge in `web/pcubes_web.pas`.
- Pas2JS build script in `build/build.sh`.
- The bridge creates the original `TPuzzle` class and exposes `window.pCubes` methods for status, model information, scramble, undo, redo, reset, library, and XML requests.

## Not complete yet
- XML-to-`TPuzzle` loading is not implemented; the file picker currently passes text to a placeholder.
- No Canvas/WebGL renderer is implemented.
- The browser build has not been verified by a successful Pas2JS compile in this environment.
- A deployment build pipeline and the complete source dependency tree still need to be added.

Do not treat the browser page as a complete working puzzle app yet.