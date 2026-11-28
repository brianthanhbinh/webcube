# WebCube — pCubes browser port

This repository contains a browser port of the Lazarus/Free Pascal pCubes puzzle simulator.

## Browser build

The GitHub Actions workflow compiles the original Pascal puzzle model to JavaScript with Pas2JS and commits the generated runtime assets used by the static web app.

Latest verified build: [GitHub Actions run](https://github.com/brianthanhbinh/webcube/actions/runs/45213362836) — successful, including Pascal compilation and generated JavaScript commit.

## Browser features

- Loads puzzle XML through the browser's XML parser and the original Pascal `TXmlReadWrite` loader.
- Exports visible Pascal puzzle faces and vertices to the Canvas renderer.
- Supports Pascal-engine scramble, undo, and redo.
- Reset reloads the last successfully loaded XML file.
- The renderer projects and draws the Pascal geometry in the browser.

Use the built in library.Or use **Load puzzle XML** to open a puzzle file.

## Build locally

Use the matching Pas2JS RTL and compiler setup from `.github/workflows/pascal-build.yml`. Then run:

- Windows: `pcubes_pascal_web/build/build.bat`
- Linux/macOS: `pcubes_pascal_web/build/build.sh`

The Linux CI build installs the compiler and prepares its RTL automatically.
