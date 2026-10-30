# FocusKit v2 — spec

Same promise as v1: simple, local-first (localStorage, no account, no server), every feature is a module you can switch
off in Settings. v2 adds Super Productivity's core feature set plus a much better-looking UI. Vanilla HTML/CSS/JS, no
deps, no CDN, no build step; must work via file:// and inside Electron (CSP: script-src 'self').

## Look & feel ("really dope, still simple")
- Left sidebar nav (icons via inline SVG + labels, collapsible), main content area, slim top bar with the live timer
  chip (task/subject + time + stop) and a "Ctrl+K" search button.
- Dark-first theme with a light theme; accent colour picker in Settings (CSS variables). Soft cards, 12-16px radius,
  subtle borders, gentle shadows, a tasteful accent gradient on primary buttons/timer ring, smooth 150ms transitions,
  respects prefers-reduced-motion. System font stack (Inter / Segoe UI Variable / system-ui). Generous spacing.
- Big SVG progress rings for Pomodoro / focus / break timers. Empty states with one-line hints.
- Command palette (Ctrl/Cmd+K): jump to any module, add task, start/stop timer, toggle theme, search tasks.
- Keyboard shortcuts: `a` add task, `s` start/stop current task, `f` focus mode, `g` then letter to navigate,
  `?` shows shortcut help. Fully keyboard and screen-reader usable (focus rings, labels, aria-live for timers).

## Architecture
- `app/index.html` — shell markup; loads `core.js`, then every `modules/*.js`, then `boot.js`; links `style.css` and
  every `modules/*.css`.
- `app/core.js` — `window.FK`: state `S` (load/save/merge/migrate from v1 key `focuskit`), helpers (esc, uid, time
  formatting, day math, total/overlap), timer engine (start/stop a tracked session on a task and/or subject), notify/beep,
  toast, `FK.register(module)`, renderer, delegated actions (data-click/change/input/submit), router (hash), command
  palette, shortcuts, Settings (module toggles, theme, accent, export/import/reset).
- `app/modules/<id>.js` + optional `<id>.css` — one feature each, registering `{ id, name, icon, group, render, tick?,
  actions, commands? }`.

## Data model (S)
- `projects` [{id,name,color,notes,bookmarks:[{title,url}]}] — an implicit "Inbox" when projectId is null.
- `tags` [{id,name,color}]
- `tasks` [{id,title,notes,projectId,tagIds[],parentId (subtask),estimate (min),due 'YYYY-MM-DD'|null,
  plannedAt ms|null (timebox start), plannedMin, repeat null|{every:'day'|'weekday'|'week'|'month'},
  status 'todo'|'doing'|'done', quadrant null|1..4, order, createdAt, doneAt}]
- `subjects` [{id,name,color}] (YPT study subjects)
- `sessions` [{taskId,subjectId,start,end}] — every tracked minute; all stats derive from here.
- `running` {taskId,subjectId,start,reminded} | null
- `focus` {mode:'pomodoro'|'flowtime'|'countdown', ...}, `breakCfg`, `idleMin`
- `habits` [{id,name,color,target per day,log:{'YYYY-MM-DD':count}}]
- `days` {'YYYY-MM-DD': {rating 1..5, note}} — "evaluate your day"
- `ddays`, `notes`, `watch`, `modules`, `theme`, `accent`

## Modules
Today (dashboard: today's tasks, planned timeline, focus time, quick add) · Tasks (list w/ projects, tags, subtasks,
notes, estimates, due, repeat; filters) · Board (Kanban todo/doing/done, drag & drop) · Matrix (Eisenhower, drag &
drop) · Planner (timeboxing: drag tasks onto today's hour grid) · Focus (full-screen one task; Pomodoro / Flowtime /
Countdown; break reminders; idle detection; anti-procrastination helper) · Study (YPT subjects timer) · Stopwatch ·
History (worklog per day, timesheet CSV export) · Stats & Metrics (focus time, tasks done, streaks, per project/subject/
tag, calendar heatmap, day ratings) · Habits (counters/habits with streaks) · Projects (notes + bookmarks per project)
· D-Day · Notes · Settings.
Skipped on purpose (need servers/accounts): Jira/GitHub integrations, cloud sync, plugins.
