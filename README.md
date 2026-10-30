# FocusKit

FocusKit is a simple study and productivity app. It is inspired by [YPT](https://www.yeolpumta.com/en/) (study timer) and [Super Productivity](https://super-productivity.com/) (tasks and planning).

It is local-first: no account, no server, no cloud. Your data stays on your device (localStorage). Every feature is a module, and you can switch any of them off in **Settings**.

## Features

- **Today**: your tasks for today, a planned timeline, focus time, quick add
- **Tasks**: projects, tags, subtasks, notes, estimates, due dates, repeating tasks, filters
- **Board**: Kanban (todo / doing / done) with drag and drop
- **Matrix**: Eisenhower matrix with drag and drop
- **Planner**: timeboxing, drag tasks onto today's hour grid
- **Focus**: full-screen single task with Pomodoro, Flowtime or Countdown, break reminders, idle detection, anti-procrastination helper
- **Study**: study timer by subject (YPT style)
- **Stopwatch**
- **History**: worklog per day, timesheet CSV export
- **Stats & Metrics**: focus time, tasks done, streaks, per project / subject / tag, calendar heatmap, day ratings
- **Habits**: counters and habits with streaks
- **Projects**: notes and bookmarks per project
- **D-Day**: countdowns to your dates
- **Notes**
- **Settings**: module toggles, dark/light theme, accent colour, export / import / reset

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl/Cmd + K` | Command palette |
| `a` | Add task |
| `s` | Start / stop current task |
| `f` | Focus mode |
| `g` then a letter | Go to a module |
| `?` | Show shortcut help |

## Download

Get the latest build from the [Releases](../../releases) page:

- **Setup exe**: installs FocusKit and updates itself automatically.
- **Portable exe**: runs without installing, but does not auto-update.

The builds are not code-signed, so Windows SmartScreen may warn you. Click **More info → Run anyway**.

## Run in the browser

Open `app/index.html` in any modern browser. No build step, no server.

## Build from source

```
npm ci
npm start       # run in Electron
npm run dist    # build Windows installers into dist/
```

## Add a module

A module is one file in `app/modules/` (plus an optional `.css` with the same name). It registers itself with `FK.register({ id, name, icon, group, render, ... })`. See the Architecture section in [SPEC-v2.md](SPEC-v2.md) for the module shape.

## Not included (on purpose)

- Integrations (Jira, GitHub, etc.)
- Cloud sync
- Plugins

These need servers or accounts, which goes against the simple, local-first idea. Use Settings → export / import to move your data.
