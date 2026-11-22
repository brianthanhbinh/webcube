# pCubes Pascal-to-browser port status

## Browser architecture

- `web/index.html` contains the page structure and loads the compiled Pascal runtime.
- `web/style.css` contains the browser interface styling.
- `web/app.js` handles browser events and calls the Pascal bridge.
- `web/renderer.js` is the Canvas drawing layer. It accepts face geometry from Pascal in the form `{ faces: [{ vertices: [[x, y, z], ...], color: "#rrggbb" }] }`.
- `web/pcubes_web.pas` remains the browser-facing Pascal entry point.
- Puzzle rules, turns, scramble, undo, and redo remain in the original Pascal model.

## Implemented

- The browser UI, application controller, and Canvas renderer are now separate files.
- The renderer has an empty-state view and a face-polygon drawing path for geometry supplied by the Pascal engine.
- The HTML page loads the Pas2JS RTL, compiled Pascal program, and JavaScript application module separately.

## Not complete yet

- XML-to-`TPuzzle` loading is not implemented; the file picker currently passes text to a placeholder.
- The Pascal bridge does not yet export render geometry, so the Canvas viewport currently displays its empty state.
- The reset adapter and browser puzzle library are not implemented.
- The browser build still needs a successful CI compile and browser runtime test.

Do not treat the browser page as a complete working puzzle app yet.
