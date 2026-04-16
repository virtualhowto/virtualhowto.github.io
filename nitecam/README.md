# Android Camera Timelapse Studio

A static GitHub Pages friendly web app for Android phones that:

- accesses the phone camera in-browser
- captures a frame every X seconds
- stores frames in the session and optionally localStorage
- builds an animated GIF from the captured frames
- builds a simple star-trail style stacked image using lighten blending
- exports the last frame or all frames as a ZIP
- works as an installable PWA on supported browsers

## Best target

- Android Chrome over HTTPS
- GitHub Pages is suitable because it serves the app over HTTPS

## Important limits

This is a browser app, not a native Android camera app. That means:

- manual shutter speed / ISO / exposure control is limited by browser APIs
- true long exposure control is usually not available in-browser
- the recommended workflow for star trails is interval capture + stacking, which this app supports

## Deploy to GitHub Pages

1. Create a GitHub repo
2. Upload all files from this folder to the repo root
3. In GitHub:
   - go to **Settings**
   - go to **Pages**
   - set source to **Deploy from a branch**
   - choose **main** and **/(root)**
4. Open the Pages URL on your Android phone
5. Grant camera permission
6. Optionally install it to the home screen

## Local testing

Because camera access generally requires a secure context, local file-open testing is not reliable.
Use one of these instead:

- GitHub Pages
- a local HTTPS dev server
- VS Code Live Server with HTTPS support

## Project structure

- `index.html` – UI
- `css/style.css` – styling
- `js/app.js` – main app wiring
- `js/camera.js` – camera setup and torch support
- `js/capture.js` – capture and interval logic
- `js/processing.js` – star trail, GIF, ZIP export
- `js/storage.js` – local session save/restore
- `js/utils.js` – helpers
- `sw.js` – service worker
- `manifest.webmanifest` – PWA manifest

## Libraries included

- gif.js is loaded from cdnjs at runtime for GIF creation
- JSZip is loaded from cdnjs at runtime for ZIP export

## Suggested next upgrades

- IndexedDB for larger capture sessions
- EXIF metadata retention
- frame culling and exposure scoring
- stronger star-trail masking and dark-sky preservation
- session naming and project save slots
- direct MP4 export using MediaRecorder + canvas pipeline
