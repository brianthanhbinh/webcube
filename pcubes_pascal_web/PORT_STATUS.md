# pCubes Pascal-to-browser port status

## Browser architecture

- `web/index.html`: page structure and runtime loading.
- `web/style.css`: browser interface styling.
- `web/app.js`: file loading, controls, and Pascal bridge calls.
- `web/renderer.js`: Canvas projection and face drawing.
- `web/pcubes_web.pas`: browser-facing Pascal API.
- `source/`: original Pascal puzzle model and XML loader.

Puzzle rules, turns, scramble, undo, and redo remain in the original Pascal model.

## Implemented

- Reproducible Pas2JS CI compilation and generated runtime asset commit.
- Browser XML parsing and loading through `TXmlReadWrite.PuzzleLoadFromXml`.
- Pascal geometry export for visible puzzle faces, vertices, and colors.
- Canvas rendering of the exported geometry.
- Pascal-engine scramble, undo, and redo controls.
- Reset by reloading the last successfully loaded XML file.

## Remaining limitations

- The desktop puzzle library UI is not ported; users load a puzzle XML file.
- Browser interaction for directly turning puzzle layers with the mouse/touch has not been implemented.
- CI confirms compilation and generated assets. A real-browser end-to-end interaction test has not yet been added.
