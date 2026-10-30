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

## Module API
Everything a module may use. Read this, `app/modules/today.js` (a full example) and nothing else.

**Files.** `app/modules/<id>.js` and `<id>.css` already exist and are already loaded by `index.html` — never edit
`index.html`, `core.js`, `boot.js` or `style.css`. Plain browser JS, no imports, no inline `<script>`/`on*=` handlers
(CSP). Wrap the file in `(() => { ... })();`. Scope module CSS under `.view-<id>` (the view wrapper class).

**Register.**
```js
FK.register({
  id: 'board', name: 'Board', group: 'Plan',        // group: 'Plan' | 'Focus' | 'Track' | 'Other'
  key: 'b',                                          // optional: `g b` jumps here (letters in use: t k b m p o f y w h s c i d n)
  icon: FK.icon('board'),                            // inline SVG string
  desc: 'Kanban columns',                            // optional, shown in Settings
  state: { boardCols: [] },                          // optional: extra top-level keys of S with their defaults
  render(arg) { return '<section class="card">…</section>'; },   // HTML string; arg = text after '#board/'
  after(main, arg) {},                               // optional: runs after render (focus, measure, etc.)
  tick(now) {},                                      // optional: every 100 ms while enabled; update text only, never re-render
  actions: { boardMove(el, e) {} },                  // prefix names with the module id; names are global
  commands: [{ label: 'New column', hint: 'Board', run() {} }],  // or a function returning that array
});
```
Rendering is full re-render of `#main` after every action: an action that returns `false` skips save + render
(use for typing). Elements keep focus across renders when they have a stable `id`. Escape every user string with `FK.esc`.

**Events (delegated, no listeners needed).** `data-click="action"`, `data-change`, `data-input`, `data-submit` (form;
default prevented) call `actions[action](el, event)` then save + render. Put ids on `data-id="…"`/`data-*` and read `el.dataset`.
Drag & drop: `data-drag="payload"` on an item (made draggable + keyboard focusable automatically), `data-drop="action"`
(+ optional `data-drop-label="To do column"`) on a zone → `actions[action](zoneEl, payload, event|null)`. Keyboard users
press Space/Enter on the item, arrows/Tab to pick a zone, Enter to drop, Esc to cancel. `data-quickadd` on the input
that the `A` shortcut should focus; `data-task-id` on a task row lets `S` (start/stop) act on the focused row.
Core actions you can use in markup: `fkToggle` (with `data-task-id` and/or `data-subject-id`: start/stop timer),
`fkStop`, `fkStartCurrent`, `fkPalette`, `fkHelp`, `fkCloseModal`.

**State.** `FK.S` is the data model above plus `version: 2`, `ui {collapsed}`, `goalMin` (daily goal, minutes) and any
module `state`. Mutate it inside actions; core saves. Outside an action call `FK.save()` then `FK.render()`.

**Functions.**
- Tasks: `FK.tasks.get(id)`, `add(partial)` → task, `update(id, patch)` (status 'done' completes), `complete(id)`
  (sets doneAt; repeating tasks spawn the next occurrence), `remove(id)` (with subtasks), `children(id)`,
  `descendants(id)` → ids, `spent(id, now?)` ms incl. subtasks, `sort(list)`, `isToday(t)`, `today()` (top-level),
  `open(id)` → `#tasks/<id>`. These save but don't render.
- Timer: `FK.start({taskId, subjectId})`, `FK.stop()`, `FK.toggle({…})`, `FK.isRunning({taskId}|{subjectId}|undefined)`,
  `FK.label()` (running label). Starting a task sets status 'doing'. One session runs at a time; it survives reload.
- Time data: `FK.sessions()` (stored + running), `FK.overlap(s, from, to)` ms, `FK.total(from, to, filter?)` ms.
- Lookups: `FK.project(id)`, `FK.tag(id)`, `FK.subject(id)`.
- Format: `FK.esc`, `FK.uid()`, `FK.hms(ms)` 01:02:03, `FK.hm(ms)` 1h 02m, `FK.mmss(ms)`, `FK.hmst(ms)` with tenths,
  `FK.clock(ms)` 14:05, `FK.fmtDate(dateOrKey, intlOpts)`, `FK.pad`.
- Days (local time): `FK.today()` 'YYYY-MM-DD', `FK.dayKey(ms|Date)`, `FK.dayStart(key|ms)` ms, `FK.daysAgo(n)` ms of
  that day's midnight, `FK.addDays(key, n)` key, `FK.nextDay(ms)` ms.
- UI: `FK.icon(name, cls?)`, `FK.ring(pct, labelHtml, {size, stroke, sub, id, aria})` + `FK.setRing(elOrId, pct, aria)`,
  `FK.bar(label, value, max, color?, text?)`, `FK.empty({icon, title, hint, action})`, `FK.dot(color)`,
  `FK.modal(title, bodyHtml)` / `FK.closeModal()`, `FK.toast(msg)`, `FK.notify(title, body)` (system + beep + toast),
  `FK.beep()`, `FK.announce(msg)` (screen reader), `FK.palette()`, `FK.go(id, arg?)`, `FK.route()` → {id, arg},
  `FK.isOn(id)`, `FK.render()`, `FK.save()`. Colours: `FK.PALETTE`, `FK.color(c, i)` (sanitise).
- Icons: today sun moon tasks board matrix planner focus study stopwatch history metrics calendar habits projects dday
  notes settings search plus play pause stop check x trash left right sidebar keyboard clock flag reset download upload
  bell palette sparkle target inbox repeat tag edit more grip coffee.

**CSS kit (style.css).** Tokens: `--accent --accent-2 --accent-soft --accent-line --grad --bg --card --card-2 --line
--line-2 --fg --muted --faint --ok --warn --danger --r --r-lg --t`. Per-element colour: `style="--c:#hex"` on `.tag`,
`.dot`, `.chip`.
- Layout: `.card` (+`.live`), `.card-head`, `.row` (`.tight` `.center`), `.stack`, `.spread`, `.grow`, `.grid .cols-2 .cols-3`,
  `.auto-grid`, `.field-row` + `.field-label`.
- Text: `.eyebrow`, `.display`, `.big-time`, `.grad-text`, `.muted`, `.faint`, `.small`, `.num` (tabular), `.danger-text`, `.sr-only`.
- Buttons: plain `<button>`, `.btn` (for labels/links), `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-icon`, `.btn-sm`,
  `.btn-lg`, `.btn-block`, `.link`. Icon-only buttons need `aria-label`.
- Inputs: native `input/select/textarea` are styled; `.input-sm`; `input.check` (round task checkbox);
  `input.switch[role=switch]`; `.seg > button[aria-pressed]` segmented control; `.tabs[role=tablist] > button[role=tab][aria-selected]`.
- Bits: `.tag` (`.tag-danger` `.tag-ok`), `.chip[aria-pressed]` (filter chip), `.badge` (`.accent`), `<kbd>`.
- Lists: `ul.list > li` rows (`.on` highlighted, `.done` strikes `.task-title`/`.title`), `.list.divided`.
- Progress: `FK.ring`, `.progress > span[style=width:%]`, `FK.bar`.
- Drag states: `.dragging`, `.drop-over`, `.drop-target`, `body.is-dragging`.
- Empty state: `FK.empty(...)`. Respect `prefers-reduced-motion` in module animations.
