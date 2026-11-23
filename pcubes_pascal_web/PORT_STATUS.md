# pCubes Pascal-to-browser port status

## Browser architecture

- `web/index.html`: page structure and runtime loading.
- `web/style.css`: browser interface styling.
- `web/app.js`: file loading, controls, and Pascal bridge calls.
- `web/renderer.js`: Canvas projection and face drawing.
- `web/pcubes_web.pas`: browser-facing Pascal API.
- `source/`: original Pascal puzzle model and XML loader.

## Implemented

- GitHub Actions compiles the Pascal browser bridge with Pas2JS and commits the generated runtime.
- XML files are parsed by the browser and passed to the original Pascal XML loader.
- Visible puzzle face geometry is exported from Pascal and drawn in Canvas.
- Scramble, undo, and redo call the Pascal puzzle model.
- Reset reloads the last successfully loaded XML file.
- The browser no longer calls the desktop-only script dictionaries that were nil in Pas2JS. Static numeric XML expressions are evaluated by the browser JavaScript engine.

## Browser-port limitations

- XML `Script` blocks and desktop custom Pascal script functions are currently skipped in the browser build. Puzzles that depend on those scripts may not load correctly.
- The desktop puzzle library UI is not ported; users load a puzzle XML file.
- Direct mouse/touch layer turning has not been implemented.
- CI verifies compilation and generated asset commit; a real-browser end-to-end test is still outstanding.
