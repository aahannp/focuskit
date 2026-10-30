# FocusKit

A simple study and productivity app: study stopwatch, tasks, pomodoro and more. No server, no account — your data stays in your browser/app (localStorage).

## Features
Each one can be turned on or off in **Settings**:
- Study timer
- Stopwatch (with laps)
- Tasks
- Pomodoro
- Stats
- D-Day
- Break reminder
- Notes

## Download (Windows)
Go to the **Releases** page, download the `.exe` (installer, or the portable one that needs no install) and run it.

## Updates
The installer version updates itself from GitHub Releases each time you launch it. The portable `.exe` does not. To ship an update, bump nothing — just push a new tag like `v1.0.1`.

## Run in a browser
Open `app/index.html` in any browser.

## Run / build from source
```
npm install
npm start        # run the desktop app
npm run dist     # build Windows .exe files into dist/
```
Pushing a tag like `v1.0.0` builds the .exe in GitHub Actions and attaches it to a Release.

## Add a new feature
Add one entry to the `MODULES` array in `app/app.js` (id, name, render function). It then shows up in Settings with its own on/off switch.
