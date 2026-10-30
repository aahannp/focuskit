# FocusKit — spec

A simple, plain study/productivity app. Mix of YPT (Yeolpumta: per-subject study stopwatch, daily total, D-day, stats)
and Super Productivity (tasks with time tracking, pomodoro, break reminders). No fancy UI, no server, no accounts.

## Layout
- `app/` — the whole app: `index.html`, `style.css`, `app.js`. Vanilla HTML/CSS/JS, no build step, no npm deps.
  Opens directly in a browser (file:// or any static server). All data in `localStorage` key `focuskit`.
- `main.js`, `package.json` — Electron wrapper that just loads `app/index.html`. Built into a Windows installer by
  electron-builder in GitHub Actions (`.github/workflows/release.yml`) on tag push `v*`.

## Customizable = feature modules
Every feature is a module with an on/off switch in Settings. Off = its tab/UI disappears. Adding a feature = add one
module object to the `MODULES` list in `app.js` (id, name, render function). Modules:
1. Study timer (YPT) — subjects (name + colour), one running stopwatch at a time, today's total per subject + overall.
2. Tasks (Super Productivity) — add/complete/delete tasks, optional subject, per-task time tracking (start/stop), estimate.
3. Pomodoro — focus/break lengths configurable, notification + sound at the end.
4. Stats — today / last 7 days / last 30 days totals, per-subject bars (plain CSS bars), simple day list.
5. D-Day — named countdowns to dates.
6. Break reminder — after N minutes of continuous timing, show a notification.
7. Notes — one plain textarea scratchpad.
Settings (always on): module toggles, theme light/dark, export/import JSON, reset data.
