'use strict';
// FocusKit v2 core: window.FK. State, helpers, timer, task API, module registry, renderer,
// delegated actions, drag & drop, router, command palette, shortcuts and Settings.
// Modules (modules/*.js) call FK.register(); boot.js calls FK.boot() once they are all loaded.
// The Module API section of SPEC-v2.md documents what modules may use.
(() => {
  const KEY = 'focuskit';
  const GROUPS = ['Plan', 'Focus', 'Track', 'Other'];
  const ACCENTS = [['Violet', '#7c5cff'], ['Blue', '#3b82f6'], ['Teal', '#14b8a6'], ['Green', '#22c55e'], ['Amber', '#f59e0b'], ['Rose', '#f43f5e']];
  const PALETTE = ['#7c5cff', '#3b82f6', '#14b8a6', '#22c55e', '#f59e0b', '#f43f5e', '#ec4899', '#64748b'];
  const REPEATS = ['day', 'weekday', 'week', 'month'];
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const COLOR_RE = /^#[0-9a-f]{3,8}$/i;

  const DEFAULTS = () => ({
    version: 2,
    modules: {},              // { [moduleId]: false } for modules switched off
    theme: 'dark', accent: ACCENTS[0][1], ui: { collapsed: false }, goalMin: 240,
    projects: [],             // { id, name, color, notes, bookmarks: [{ title, url }] }
    tags: [],                 // { id, name, color }
    tasks: [],                // see normTask
    subjects: [],             // { id, name, color }
    sessions: [],             // { taskId, subjectId, start, end } in ms; every stat derives from these
    running: null,            // { taskId, subjectId, start, reminded }: the one live timer
    focus: { mode: 'pomodoro', focusMin: 25, breakMin: 5 },
    breakCfg: { every: 50, min: 10, endsAt: null },
    idleMin: 5,
    habits: [],               // { id, name, color, target, log: { 'YYYY-MM-DD': count } }
    days: {},                 // { 'YYYY-MM-DD': { rating 1..5, note } }
    ddays: [],                // { id, name, date: 'YYYY-MM-DD' }
    notes: '',
    watch: { start: null, elapsed: 0, laps: [] },   // stopwatch; laps are running totals in ms
  });
  const extra = {};           // defaults modules add through register({ state })

  const S = {};               // the one state object; import/reset replace its contents, never the object
  const MODS = [];
  const ACTIONS = {};

  // ---------- helpers ----------
  const $ = sel => document.querySelector(sel);
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = n => String(Math.floor(n)).padStart(2, '0');
  const hms = ms => { const s = Math.max(0, ms) / 1000; return `${pad(s / 3600)}:${pad(s / 60 % 60)}:${pad(s % 60)}`; };
  const mmss = ms => { const s = Math.ceil(Math.max(0, ms) / 1000); return `${pad(s / 60)}:${pad(s % 60)}`; };
  const hmst = ms => `${hms(ms)}.${Math.floor(ms / 100 % 10)}`;
  const hm = ms => { const m = Math.floor(Math.max(0, ms) / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`; };
  const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const today = () => dayKey();
  const dayStart = k => typeof k === 'string' ? new Date(`${k}T00:00`).getTime() : new Date(new Date(k).toDateString()).getTime();
  const addDays = (k, n) => { const d = new Date(`${k}T00:00`); d.setDate(d.getDate() + n); return dayKey(d); };
  const daysAgo = n => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime(); };
  const nextDay = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };
  const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (k, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
    new Date(typeof k === 'string' ? `${k}T00:00` : k).toLocaleDateString(undefined, opts);
  const color = (c, i = 0) => COLOR_RE.test(c) ? c : PALETTE[i % PALETTE.length];
  const dot = c => `<span class="dot" style="--c:${esc(c)}"></span>`;

  // All sessions, with the running timer included up to now.
  const sessions = () => S.running ? [...S.sessions, { ...S.running, end: Date.now() }] : S.sessions;
  const overlap = (s, from, to) => Math.max(0, Math.min(s.end, to) - Math.max(s.start, from));
  const total = (from, to, keep = () => true) => sessions().filter(keep).reduce((sum, s) => sum + overlap(s, from, to), 0);

  // ---------- state: load / merge / migrate / save ----------
  function defaults() {
    const d = DEFAULTS();
    for (const [k, v] of Object.entries(extra)) d[k] = isObj(v) && isObj(d[k]) ? { ...d[k], ...v } : v;
    return structuredClone(d);
  }
  // Take keys from v whose type matches the default's; keep keys the default does not know.
  function mergeObj(d, v) {
    const out = { ...d };
    for (const [k, x] of Object.entries(v)) {
      if (x == null) continue;
      if (k in d && d[k] !== null && (typeof x !== typeof d[k] || Array.isArray(x) !== Array.isArray(d[k]))) continue;
      out[k] = x;
    }
    return out;
  }
  const str = (v, d = '') => typeof v === 'string' ? v : d;
  const num = (v, d = 0) => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(+v) ? +v : d;
  const idOrNull = v => v == null || v === '' ? null : String(v);

  function normTask(t) {
    const { done, ...rest } = t;   // v1 had done: boolean
    const status = ['todo', 'doing', 'done'].includes(t.status) ? t.status : done ? 'done' : 'todo';
    return {
      ...rest,
      id: String(t.id ?? uid()), title: str(t.title, 'Task'), notes: str(t.notes),
      projectId: idOrNull(t.projectId), tagIds: Array.isArray(t.tagIds) ? t.tagIds.map(String) : [],
      parentId: idOrNull(t.parentId), subjectId: idOrNull(t.subjectId),
      estimate: num(t.estimate), due: DAY_RE.test(t.due) ? t.due : null,
      plannedAt: Number.isFinite(t.plannedAt) ? t.plannedAt : null, plannedMin: num(t.plannedMin),
      repeat: REPEATS.includes(t.repeat?.every) ? { every: t.repeat.every } : null,
      status, quadrant: [1, 2, 3, 4].includes(t.quadrant) ? t.quadrant : null,
      order: num(t.order), createdAt: num(t.createdAt, Date.now()),
      doneAt: status === 'done' ? num(t.doneAt) : null,
    };
  }

  // v1 → v2: pomo → focus, breakEvery/breakTimer → breakCfg, renamed module ids. Tasks then go through normTask.
  function migrate(d) {
    const m = { ...d, version: 2 };
    if (isObj(d.pomo)) m.focus = { mode: 'pomodoro', focusMin: d.pomo.focusMin, breakMin: d.pomo.breakMin };
    m.breakCfg = { every: d.breakEvery, min: d.breakTimer?.min, endsAt: d.breakTimer?.endsAt };
    // v1 had one flat to-do list: keep its open items on Today.
    if (Array.isArray(d.tasks)) m.tasks = d.tasks.map(t => isObj(t) && !t.done ? { ...t, due: today() } : t);
    if (isObj(d.modules)) {
      const renamed = { watch: 'stopwatch', pomo: 'focus', stats: 'metrics', break: null };
      m.modules = {};
      for (const [k, v] of Object.entries(d.modules)) {
        const id = k in renamed ? renamed[k] : k;
        if (id) m.modules[id] = v;
      }
    }
    return m;
  }

  function merge(data) {
    const s = defaults();
    if (!isObj(data)) return s;
    if (!data.version) data = migrate(data);
    for (const k in s) {
      const v = data[k], d = s[k];
      if (v == null) continue;
      if (d === null) { if (isObj(v)) s[k] = v; }
      else if (Array.isArray(d)) { if (Array.isArray(v)) s[k] = v.filter(isObj); }
      else if (isObj(d)) { if (isObj(v)) s[k] = mergeObj(d, v); }
      else if (typeof v === typeof d) s[k] = v;
    }
    s.version = 2;
    s.tasks = s.tasks.map((t, i) => normTask({ order: i, ...t }));
    s.sessions = s.sessions.filter(x => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start);
    if (s.running && !Number.isFinite(s.running.start)) s.running = null;
    for (const k of ['projects', 'tags', 'subjects', 'habits', 'ddays']) {
      s[k] = s[k].map((x, i) => ({ ...x, id: String(x.id ?? uid()), name: str(x.name, 'Untitled'), ...(k !== 'ddays' && { color: color(x.color, i) }) }));
    }
    s.ddays = s.ddays.filter(x => DAY_RE.test(x.date));
    s.accent = color(s.accent);
    if (!['dark', 'light'].includes(s.theme)) s.theme = 'dark';
    return s;
  }

  function replace(next) {
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, next);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save: browser storage is unavailable.'); }
  }
  function load() {
    let raw = null, data = {};
    try { raw = localStorage.getItem(KEY); data = JSON.parse(raw) || {}; }
    catch { try { if (raw) localStorage.setItem(`${KEY}-corrupt`, raw); } catch {} }
    // Keep a copy of v1 data before migrating it.
    try { if (isObj(data) && !data.version && raw && !localStorage.getItem(`${KEY}-v1-backup`)) localStorage.setItem(`${KEY}-v1-backup`, raw); } catch {}
    replace(merge(data));
  }

  // ---------- alerts: toast, beep, system notification, screen-reader announcements ----------
  let audio, toastTimer;
  const unlockAudio = () => { try { audio ||= new AudioContext(); } catch {} };
  function beep() {
    try {
      unlockAudio();
      audio.resume();
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.6);
    } catch {}
  }
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
  }
  function announce(msg) {
    const el = $('#live');
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 30);
  }
  function askNotify() {
    if (window.Notification?.permission === 'default') return Notification.requestPermission();
    return Promise.resolve();
  }
  function notify(title, body) {
    beep();
    toast(`${title}: ${body}`);
    if (window.Notification?.permission === 'granted') try { new Notification(title, { body }); } catch {}
  }

  // ---------- lookups ----------
  const byId = list => id => id == null ? undefined : list().find(x => x.id === id);
  const project = byId(() => S.projects), tag = byId(() => S.tags), subject = byId(() => S.subjects);

  // ---------- timer: one running session, stored in S so it survives reloads ----------
  function label(r = S.running) {
    return r ? [tasks.get(r.taskId)?.title, subject(r.subjectId)?.name].filter(Boolean).join(' · ') || 'Focus' : '';
  }
  function start({ taskId = null, subjectId = null } = {}) {
    stop();
    const t = tasks.get(taskId);
    if (t) {
      subjectId ??= t.subjectId;
      if (t.status === 'todo') t.status = 'doing';
    }
    S.running = { taskId: t ? t.id : null, subjectId: subjectId || null, start: Date.now(), reminded: false };
    askNotify();
    save();
    announce(`Timer started: ${label()}`);
  }
  function stop() {
    const r = S.running;
    if (!r) return;
    if (Date.now() - r.start >= 1000) S.sessions.push({ taskId: r.taskId, subjectId: r.subjectId, start: r.start, end: Date.now() });
    S.running = null;
    save();
    announce('Timer stopped');
  }
  const isRunning = ({ taskId, subjectId } = {}) => {
    const r = S.running;
    return !!r && (taskId ? r.taskId === taskId : subjectId ? r.subjectId === subjectId : true);
  };
  const toggle = who => isRunning(who) ? stop() : start(who);

  // ---------- tasks ----------
  // Next due date after today for a repeating task; months keep the original day (clamped to month length).
  function nextDue(due, every) {
    const now = today(), base = due || now, anchor = Number(base.slice(8));
    let d = base, months = 0;
    do {
      if (every === 'month') {
        months++;
        const [y, m] = base.split('-').map(Number);
        const last = new Date(y, m - 1 + months + 1, 0).getDate();
        d = dayKey(new Date(y, m - 1 + months, Math.min(anchor, last)));
      } else {
        d = addDays(d, every === 'week' ? 7 : 1);
        if (every === 'weekday') while ([0, 6].includes(new Date(`${d}T00:00`).getDay())) d = addDays(d, 1);
      }
    } while (d <= now);
    return d;
  }

  const tasks = {
    get: id => id == null ? undefined : S.tasks.find(t => t.id === id),
    add(partial = {}) {
      const order = Math.max(0, ...S.tasks.map(t => t.order)) + 1;
      const t = normTask({ order, ...partial, id: uid(), createdAt: Date.now() });
      S.tasks.push(t);
      save();
      return t;
    },
    update(id, patch) {
      const t = tasks.get(id);
      if (!t) return;
      const { status, ...rest } = patch;
      Object.assign(t, rest);
      if (status === 'done') return tasks.complete(id);
      if (status) { t.status = status; t.doneAt = null; }
      Object.assign(t, normTask(t));
      save();
      return t;
    },
    // Marks done; a repeating task hands its repeat on to a new copy due on the next date.
    complete(id) {
      const t = tasks.get(id);
      if (!t || t.status === 'done') return t;
      if (S.running?.taskId === id) stop();
      t.status = 'done';
      t.doneAt = Date.now();
      if (t.repeat) {
        const { title, notes, projectId, tagIds, subjectId, estimate, plannedMin, quadrant, repeat, parentId } = t;
        tasks.add({ title, notes, projectId, tagIds: [...tagIds], subjectId, estimate, plannedMin, quadrant, repeat, parentId,
          due: nextDue(t.due, repeat.every) });
        t.repeat = null;
      }
      save();
      return t;
    },
    remove(id) {
      const ids = new Set([id, ...tasks.descendants(id)]);
      if (ids.has(S.running?.taskId)) stop();
      S.tasks = S.tasks.filter(t => !ids.has(t.id));
      save();
    },
    children: id => tasks.sort(S.tasks.filter(t => t.parentId === id)),
    descendants: id => tasks.children(id).flatMap(c => [c.id, ...tasks.descendants(c.id)]),
    spent(id, now = Date.now()) {
      const ids = new Set([id, ...tasks.descendants(id)]);
      return total(0, now, s => ids.has(s.taskId));
    },
    // Not-done tasks before done ones, then by order.
    sort: list => [...list].sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.order - b.order),
    isToday(t) {
      const k = today();
      return t.status === 'doing' || (!!t.due && t.due <= k) || (t.plannedAt != null && dayKey(t.plannedAt) === k);
    },
    // Top-level tasks for today: open ones that are due/planned/doing, plus ones finished today.
    today() {
      const from = daysAgo(0);
      return tasks.sort(S.tasks.filter(t => !t.parentId && (t.status === 'done' ? t.doneAt >= from : tasks.isToday(t))));
    },
    open(id) {
      if (!isOn('tasks')) return toast('Turn on the Tasks module in Settings to open tasks.');
      go('tasks', id);
    },
  };

  // ---------- UI helpers modules use in their HTML ----------
  const ICONS = {
    today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a7 7 0 0 0 10.6 10.6z"/>',
    tasks: '<path d="M3.5 6.5 5 8l3-3M3.5 13.5 5 15l3-3"/><path d="M12 6.5h8.5M12 13.5h8.5M12 20h8.5M4 20h4"/>',
    board: '<rect x="3" y="3.5" width="18" height="17" rx="3"/><path d="M8.5 7.5v8M12 7.5v4.5M15.5 7.5v10"/>',
    matrix: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
    planner: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M7.5 13.5h4M7.5 17h7"/>',
    focus: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    study: '<path d="M4 19.5v-14A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.2 1.8M9.5 2.5h5M12 2.5V6M18.5 6.5l1.2-1.2"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3 2"/>',
    metrics: '<path d="M3.5 3.5v17h17"/><path d="m7.5 15 3.5-4.5 3 3 5-6.5"/>',
    calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/><circle cx="8.5" cy="14" r=".6" fill="currentColor"/><circle cx="12" cy="14" r=".6" fill="currentColor"/><circle cx="15.5" cy="14" r=".6" fill="currentColor"/><circle cx="8.5" cy="17.2" r=".6" fill="currentColor"/>',
    habits: '<path d="M12 21.5c3.9 0 6.5-2.7 6.5-6.4 0-3.6-2.6-5.8-3.6-9.6-1.9 1.7-2.9 3.6-2.9 5.6-1.1-.9-2-2.2-2.2-3.8-2.6 2-4.3 4.7-4.3 7.8 0 3.7 2.6 6.4 6.5 6.4z"/>',
    projects: '<path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.5l2.2 2.5H18A2.5 2.5 0 0 1 20.5 9.5V17a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17z"/>',
    dday: '<path d="M5 21.5V3.5M5 4.5h12.5l-2.5 4 2.5 4H5"/>',
    notes: '<path d="M14 3H7a2.5 2.5 0 0 0-2.5 2.5v13A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5V8.5z"/><path d="M14 3v5.5h5.5M8.5 13h7M8.5 16.5h4.5"/>',
    settings: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5A1.5 1.5 0 0 0 8 21h8a1.5 1.5 0 0 0 1.5-1.5L18.5 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9.5 4v16"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    flag: '<path d="M5 21.5V3.5M5 4.5h12.5l-2.5 4 2.5 4H5"/>',
    reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    download: '<path d="M12 3.5v12M7 10.5l5 5 5-5M4.5 20.5h15"/>',
    upload: '<path d="M12 20.5v-12M7 13.5l5-5 5 5M4.5 3.5h15"/>',
    bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15.5 6 9M10 21a2.2 2.2 0 0 0 4 0"/>',
    palette: '<path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1 .5 1.3 0 .5-.9.9-2 .9z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="11" cy="7" r="1.2" fill="currentColor"/><circle cx="16" cy="8.5" r="1.2" fill="currentColor"/>',
    sparkle: '<path d="M12 3.5 13.8 10.2 20.5 12 13.8 13.8 12 20.5 10.2 13.8 3.5 12 10.2 10.2z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    inbox: '<path d="M3.5 13.5 6 5.5A2 2 0 0 1 7.9 4h8.2A2 2 0 0 1 18 5.5l2.5 8M3.5 13.5V18A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5v-4.5M3.5 13.5h4.5l1.5 2.5h5l1.5-2.5h4.5"/>',
    repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10A4 4 0 0 1 7.5 6h13M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>',
    tag: '<path d="M3.5 12.2V5A1.5 1.5 0 0 1 5 3.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
    grip: '<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>',
    coffee: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 2.5v3M12 2.5v3"/>',
  };
  const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.sparkle}</svg>`;

  // Progress ring. pct 0..100; label/sub are HTML. Update later with FK.setRing(el, pct).
  function ring(pct, labelHtml = '', { size = 168, stroke = 10, sub = '', id = '', aria = '' } = {}) {
    const r = 50 - stroke / 2;
    return `<div class="ring"${id ? ` id="${esc(id)}"` : ''} style="--size:${Number(size) || 168}px" role="img" aria-label="${esc(aria || `${Math.round(pct)}%`)}">
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="${r}" stroke-width="${stroke}"/>
      <circle class="ring-fill" cx="50" cy="50" r="${r}" stroke-width="${stroke}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - clamp(pct)}"/></svg>
      <div class="ring-label">${labelHtml}${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  }
  const clamp = p => Math.max(0, Math.min(100, Number(p) || 0));
  function setRing(el, pct, aria) {
    el = typeof el === 'string' ? document.getElementById(el) : el;
    el?.querySelector('.ring-fill')?.setAttribute('stroke-dashoffset', 100 - clamp(pct));
    if (el && aria) el.setAttribute('aria-label', aria);
  }
  // A labelled horizontal bar: label, track, value text.
  const bar = (labelText, value, max, c = '', text = '') =>
    `<div class="bar"><span class="bar-label" title="${esc(labelText)}">${c ? dot(c) : ''}${esc(labelText)}</span>
      <div class="progress"><span style="width:${(clamp(value / Math.max(max, 1e-9) * 100)).toFixed(1)}%${c ? `;background:${esc(c)}` : ''}"></span></div>
      <span class="bar-val num">${esc(text || hm(value))}</span></div>`;
  const empty = ({ icon: ic = '', title = '', hint = '', action = '' } = {}) =>
    `<div class="empty">${ic ? `<div class="empty-ico">${ic.startsWith('<') ? ic : icon(ic)}</div>` : ''}
      <h3>${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ''}${action}</div>`;

  // ---------- modal (shared <dialog id="modal">) ----------
  function modal(title, body) {
    const el = $('#modal');
    el.innerHTML = `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2>
      <button class="btn-icon btn-ghost" data-click="fkCloseModal" aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>`;
    if (!el.open) el.showModal();
    el.querySelector('[autofocus], input, select, textarea')?.focus();
  }
  const closeModal = () => $('#modal').open && $('#modal').close();

  // ---------- registry, router, renderer ----------
  function register(m) {
    if (!m?.id || MODS.some(x => x.id === m.id)) return console.warn('FocusKit: bad or duplicate module', m?.id);
    MODS.push(m);
    for (const [k, fn] of Object.entries(m.actions || {})) {
      if (ACTIONS[k]) console.warn(`FocusKit: action "${k}" is defined twice`);
      ACTIONS[k] = fn;
    }
    Object.assign(extra, m.state);
  }
  const isOn = m => { const id = typeof m === 'string' ? m : m.id; return id === 'settings' || (MODS.some(x => x.id === id) && S.modules[id] !== false); };
  const enabled = () => GROUPS.flatMap(g => MODS.filter(m => m.group === g && isOn(m)));

  function route() {
    const h = location.hash.slice(1), i = h.indexOf('/');
    return i < 0 ? { id: h, arg: '' } : { id: h.slice(0, i), arg: decodeURIComponent(h.slice(i + 1)) };
  }
  function go(id, arg = '') {
    const h = arg ? `${id}/${encodeURIComponent(arg)}` : id;
    if (location.hash.slice(1) === h) render(); else location.hash = h;
  }
  function currentView() {
    const { id } = route(), mods = enabled();
    return [...mods, SETTINGS].find(m => m.id === id) || mods.find(m => m.id === 'today') || mods[0] || SETTINGS;
  }

  function navHtml(view) {
    const link = m => `<a href="#${esc(m.id)}" class="nav-item"${m === view ? ' aria-current="page"' : ''} title="${esc(m.name)}">
      ${m.icon || icon(m.id)}<span class="nav-text">${esc(m.name)}</span></a>`;
    return GROUPS.map(g => {
      const ms = enabled().filter(m => m.group === g);
      return ms.length ? `<div class="nav-group" role="group" aria-label="${g}"><div class="nav-label" aria-hidden="true">${g}</div>${ms.map(link).join('')}</div>` : '';
    }).join('');
  }
  function chipHtml() {
    const r = S.running;
    if (!r) return `<button class="chip-idle" data-click="fkStartCurrent" title="Start the current task (S)">${icon('play')}<span>Start timer</span></button>`;
    const t = tasks.get(r.taskId), c = subject(r.subjectId)?.color || project(t?.projectId)?.color || 'var(--accent)';
    return `<div class="timer-chip" style="--c:${esc(c)}"><span class="pulse" aria-hidden="true"></span>
      <span class="chip-label">${esc(label())}</span><b class="num" id="fk-chip-time" role="timer" aria-label="Time on current timer"></b>
      <button class="btn-icon btn-sm chip-stop" data-click="fkStop" aria-label="Stop timer" title="Stop (S)">${icon('stop')}</button></div>`;
  }

  let lastView = null;
  function render() {
    const root = document.documentElement;
    root.dataset.theme = S.theme;
    $('#theme-btn').innerHTML = icon(S.theme === 'dark' ? 'sun' : 'moon');
    root.style.setProperty('--accent', S.accent);
    $('#app').classList.toggle('collapsed', !!S.ui.collapsed);
    const view = currentView(), { arg } = route();
    $('#nav').innerHTML = navHtml(view);
    if (view === SETTINGS) $('#nav-settings').setAttribute('aria-current', 'page');
    else $('#nav-settings').removeAttribute('aria-current');
    $('#view-title').textContent = view.name;
    $('#chip').innerHTML = chipHtml();

    const main = $('#main'), focused = document.activeElement?.id;
    let html;
    try { html = view.render(arg); } catch (e) { console.error(e); html = empty({ icon: 'x', title: `${view.name} hit an error`, hint: String(e.message || e) }); }
    main.innerHTML = `<div class="view view-${esc(view.id)}">${html}</div>`;
    main.querySelectorAll('[data-drag]').forEach(el => {
      el.draggable = true;
      if (!el.hasAttribute('tabindex') && !el.matches('a,button,input,select,textarea')) el.tabIndex = 0;
      el.setAttribute('aria-roledescription', 'draggable item');
    });
    if (view !== lastView) { main.scrollTop = 0; lastView = view; }
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
    try { view.after?.(main, arg); } catch (e) { console.error(e); }
    tick();
  }

  function tick() {
    const now = Date.now();
    for (const m of enabled()) if (m.tick) try { m.tick(now); } catch (e) { console.error(e); }
    const r = S.running, el = $('#fk-chip-time');
    if (el && r) el.textContent = hms(now - r.start);
    document.title = r ? `${hms(now - r.start)} · ${label()}` : 'FocusKit';
  }

  // Runs an action; it saves and re-renders unless it returns false.
  function run(fn) { if (fn() !== false) { save(); render(); } }

  // ---------- drag & drop: data-drag="payload" onto data-drop="action"; keyboard: Space/Enter picks up ----------
  let dragging = null, overZone = null, kbd = null;
  function setOver(z) {
    overZone?.classList.remove('drop-over');
    overZone = z;
    z?.classList.add('drop-over');
  }
  function drop(zone, payload, e) {
    const fn = ACTIONS[zone.dataset.drop];
    if (!fn) return console.warn(`FocusKit: no action "${zone.dataset.drop}"`);
    run(() => fn(zone, payload, e));
  }
  function wireDrag() {
    document.addEventListener('dragstart', e => {
      const el = e.target.closest?.('[data-drag]');
      if (!el) return;
      dragging = el.dataset.drag;
      e.dataTransfer.setData('text/plain', dragging);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
      document.body.classList.add('is-dragging');
    });
    document.addEventListener('dragend', e => {
      e.target.classList?.remove('dragging');
      document.body.classList.remove('is-dragging');
      setOver(null);
      dragging = null;
    });
    document.addEventListener('dragover', e => {
      const z = dragging != null && e.target.closest?.('[data-drop]');
      if (!z) return setOver(null);
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(z);
    });
    document.addEventListener('drop', e => {
      const z = dragging != null && e.target.closest?.('[data-drop]');
      if (!z) return;
      e.preventDefault();
      const payload = dragging;
      setOver(null);
      drop(z, payload, e);
    });
  }
  function pickUp(el) {
    const zones = [...$('#main').querySelectorAll('[data-drop]')];
    if (!zones.length) return;
    kbd = { payload: el.dataset.drag, zones, i: 0 };
    zones.forEach(z => { z.classList.add('drop-target'); if (!z.hasAttribute('tabindex')) z.tabIndex = -1; });
    el.classList.add('dragging');
    announce('Picked up. Arrow keys choose where, Enter drops, Escape cancels.');
    moveTo(Math.max(0, zones.indexOf(el.closest('[data-drop]'))));
  }
  function moveTo(i) {
    const z = kbd.zones[(i + kbd.zones.length) % kbd.zones.length];
    kbd.i = kbd.zones.indexOf(z);
    setOver(z);
    z.focus();
    announce(z.dataset.dropLabel || z.getAttribute('aria-label') || `Drop target ${kbd.i + 1} of ${kbd.zones.length}`);
  }
  function endKbd() {
    kbd.zones.forEach(z => z.classList.remove('drop-target'));
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    setOver(null);
    const k = kbd;
    kbd = null;
    return k;
  }
  function dragKey(e) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Tab: e.shiftKey ? -1 : 1 }[e.key];
    if (step) { e.preventDefault(); moveTo(kbd.i + step); return; }
    if (e.key === 'Escape') { e.preventDefault(); endKbd(); announce('Move cancelled.'); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const k = endKbd(), zone = k.zones[k.i];
      drop(zone, k.payload, null);
      const moved = [...document.querySelectorAll('[data-drag]')].find(x => x.dataset.drag === k.payload);
      moved?.focus();
      announce('Dropped.');
    }
  }

  // ---------- command palette ----------
  let palItems = [], palSel = 0, palMode = '';
  const fuzzy = (q, s) => {
    s = s.toLowerCase();
    const i = s.indexOf(q);
    if (i >= 0) return 1000 - i;
    let last = -1, score = 0;
    for (const c of q) {
      const k = s.indexOf(c, last + 1);
      if (k < 0) return 0;
      score += k === last + 1 ? 3 : 1;
      last = k;
    }
    return score;
  };
  function palSource(q) {
    const add = q && { label: `Add “${q}” to Today`, hint: 'New task', icon: icon('plus'), run: () => quickAdd(q) };
    if (palMode === 'add') return add ? [add] : [];
    const items = [];
    for (const m of [...enabled(), SETTINGS]) items.push({ label: m.name, hint: 'Go to', icon: m.icon || icon(m.id), run: () => go(m.id) });
    items.push(
      { label: 'Add task', hint: 'A', icon: icon('plus'), run: () => setTimeout(() => palette('add')) },
      S.running ? { label: `Stop timer · ${label()}`, hint: 'S', icon: icon('stop'), run: stop }
        : { label: 'Start timer on current task', hint: 'S', icon: icon('play'), run: startCurrent },
      { label: `Switch to ${S.theme === 'dark' ? 'light' : 'dark'} theme`, hint: 'Theme', icon: icon(S.theme === 'dark' ? 'sun' : 'moon'), run: () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; } },
      { label: S.ui.collapsed ? 'Expand sidebar' : 'Collapse sidebar', hint: '[', icon: icon('sidebar'), run: () => { S.ui.collapsed = !S.ui.collapsed; } },
      { label: 'Keyboard shortcuts', hint: '?', icon: icon('keyboard'), run: () => setTimeout(help) },
    );
    for (const m of enabled()) {
      const cmds = typeof m.commands === 'function' ? m.commands() : m.commands || [];
      for (const c of cmds) items.push({ hint: m.name, icon: m.icon, ...c });
    }
    if (!q) return items;
    for (const t of S.tasks.filter(t => t.status !== 'done')) {
      items.push({ label: t.title, hint: 'Task', icon: icon('check'), run: () => tasks.open(t.id), alt: () => start({ taskId: t.id }) });
    }
    const ql = q.toLowerCase();
    const scored = items.map(it => [fuzzy(ql, `${it.label} ${it.keywords || ''}`), it]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    return [...scored.slice(0, 40), add];
  }
  function palRender() {
    const q = $('#pal-input').value.trim();
    palItems = palSource(q);
    palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
    $('#pal-list').innerHTML = palItems.map((it, i) => `<li role="option" id="pal-${i}" data-i="${i}" aria-selected="${i === palSel}">
      <span class="pal-ico">${it.icon || ''}</span><span class="pal-label">${esc(it.label)}</span>
      ${it.alt ? `<span class="pal-alt"><kbd>${MOD}</kbd><kbd>↵</kbd> start</span>` : ''}<span class="pal-hint">${esc(it.hint || '')}</span></li>`).join('')
      || `<li class="pal-empty">${palMode === 'add' ? 'Type a task title, then press Enter.' : 'No matches.'}</li>`;
    $('#pal-input').setAttribute('aria-activedescendant', palItems.length ? `pal-${palSel}` : '');
    $(`#pal-${palSel}`)?.scrollIntoView({ block: 'nearest' });
  }
  function palette(mode = '') {
    const d = $('#palette'), input = $('#pal-input');
    palMode = mode;
    palSel = 0;
    input.value = '';
    input.placeholder = mode === 'add' ? 'New task for today…' : 'Search modules, tasks and commands…';
    if (!d.open) d.showModal();
    input.focus();
    palRender();
  }
  function palRun(i, alt) {
    const it = palItems[i];
    if (!it) return;
    $('#palette').close();
    run(() => alt && it.alt ? it.alt() : it.run());
  }
  function wirePalette() {
    const d = $('#palette'), input = $('#pal-input'), list = $('#pal-list');
    input.addEventListener('input', () => { palSel = 0; palRender(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        palSel = (palSel + (e.key === 'ArrowDown' ? 1 : -1) + palItems.length) % Math.max(1, palItems.length);
        palRender();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        palRun(palSel, e.metaKey || e.ctrlKey);
      }
    });
    list.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) palRun(Number(li.dataset.i), e.metaKey || e.ctrlKey); });
    list.addEventListener('mousemove', e => {
      const li = e.target.closest('[data-i]');
      if (li && Number(li.dataset.i) !== palSel) { palSel = Number(li.dataset.i); palRender(); }
    });
    for (const dlg of [d, $('#modal')]) dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // backdrop click
  }

  // ---------- shortcuts ----------
  const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';
  function quickAdd(title) {
    const t = tasks.add({ title: title.trim(), due: today() });
    toast(`Added “${t.title}” to Today`);
  }
  // Current task: the task row holding focus, else the first open task for today.
  function startCurrent() {
    const focusedId = document.activeElement?.closest?.('[data-task-id]')?.dataset.taskId;
    const t = tasks.get(focusedId) || tasks.today().find(x => x.status !== 'done');
    if (!t) { toast('No task for today. Press A to add one.'); return false; }
    start({ taskId: t.id });
  }
  function help() {
    const nav = [...enabled(), SETTINGS].filter(m => m.key).map(m => `<li><span><kbd>g</kbd> <kbd>${esc(m.key)}</kbd></span>${esc(m.name)}</li>`).join('');
    modal('Keyboard shortcuts', `<div class="help-grid">
      <section><h3>Everywhere</h3><ul class="keys">
        <li><span><kbd>${MOD}</kbd> <kbd>K</kbd></span>Command palette</li>
        <li><span><kbd>A</kbd></span>Add task</li>
        <li><span><kbd>S</kbd></span>Start / stop current task</li>
        <li><span><kbd>F</kbd></span>Focus mode</li>
        <li><span><kbd>[</kbd></span>Collapse sidebar</li>
        <li><span><kbd>?</kbd></span>This help</li>
        <li><span><kbd>Space</kbd></span>Pick up a draggable item, then arrows + <kbd>Enter</kbd></li>
      </ul></section>
      <section><h3>Go to</h3><ul class="keys">${nav}</ul></section></div>`);
  }
  let gUntil = 0;
  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette').open ? $('#palette').close() : palette(); return; }
    if (kbd) return dragKey(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], dialog')) return;
    if ((e.key === ' ' || e.key === 'Enter') && e.target.matches?.('[data-drag]') && !e.target.matches('a,button')) { e.preventDefault(); pickUp(e.target); return; }
    if (gUntil > Date.now()) {
      gUntil = 0;
      const m = [...enabled(), SETTINGS].find(x => x.key === e.key.toLowerCase() || x.key === e.key);
      if (m) { e.preventDefault(); go(m.id); }
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const actions = {
      g: () => { gUntil = Date.now() + 1500; },
      a: () => { const qa = $('#main [data-quickadd]'); qa ? qa.focus() : palette('add'); },
      s: () => run(() => S.running ? stop() : startCurrent()),
      f: () => isOn('focus') ? go('focus') : toast('Turn on the Focus module in Settings.'),
      '?': help,
      '[': () => run(() => { S.ui.collapsed = !S.ui.collapsed; }),
    };
    const fn = actions[e.key] || actions[k];
    if (fn) { e.preventDefault(); fn(); }
  }

  // ---------- Settings ----------
  const SETTINGS = {
    id: 'settings', name: 'Settings', key: ',', icon: icon('settings'),
    render() {
      const perm = window.Notification ? Notification.permission : 'unsupported';
      const groups = GROUPS.map(g => {
        const ms = MODS.filter(m => m.group === g);
        return ms.length ? `<div class="mod-group"><h4>${g}</h4>${ms.map(m => `<label class="toggle-row">
          <span class="toggle-ico">${m.icon || ''}</span><span class="grow">${esc(m.name)}${m.desc ? `<small>${esc(m.desc)}</small>` : ''}</span>
          <input type="checkbox" role="switch" class="switch" id="mod-${esc(m.id)}" data-change="fkModule" data-id="${esc(m.id)}" ${isOn(m) ? 'checked' : ''}></label>`).join('')}</div>` : '';
      }).join('');
      const custom = !ACCENTS.some(([, c]) => c === S.accent);
      return `<div class="settings stack">
        <section class="card"><div class="card-head"><h3>Appearance</h3></div>
          <div class="field-row"><span class="field-label" id="theme-l">Theme</span>
            <div class="seg" role="group" aria-labelledby="theme-l">
              <button id="theme-dark" data-click="fkTheme" data-id="dark" aria-pressed="${S.theme === 'dark'}">${icon('moon')}Dark</button>
              <button id="theme-light" data-click="fkTheme" data-id="light" aria-pressed="${S.theme === 'light'}">${icon('sun')}Light</button>
            </div></div>
          <div class="field-row"><span class="field-label" id="accent-l">Accent</span>
            <div class="swatches" role="group" aria-labelledby="accent-l">
              ${ACCENTS.map(([n, c]) => `<button class="swatch" id="accent-${n.toLowerCase()}" style="--c:${c}" data-click="fkAccent" data-id="${c}" aria-label="${n}" aria-pressed="${S.accent === c}"></button>`).join('')}
              <label class="swatch swatch-custom${custom ? ' on' : ''}" style="--c:${esc(S.accent)}" title="Custom colour">
                <input type="color" id="accent-custom" value="${esc(S.accent)}" data-input="fkAccentPreview" data-change="fkAccent" aria-label="Custom accent colour">${icon('plus')}</label>
            </div></div>
          <div class="field-row"><label class="field-label" for="goal">Daily focus goal</label>
            <span class="row"><input type="number" id="goal" min="10" max="1440" step="10" value="${Number(S.goalMin)}" data-change="fkGoal" class="input-sm"> <span class="muted">minutes</span></span></div>
        </section>
        <section class="card"><div class="card-head"><div><h3>Modules</h3><p class="muted">Switch off what you don't use. Their data stays.</p></div></div>
          <div class="mod-grid">${groups}</div></section>
        <section class="card"><div class="card-head"><h3>Notifications</h3><span class="badge">${esc(perm)}</span></div>
          <div class="row">
            ${perm === 'default' ? `<button id="notif-ask" class="btn-primary" data-click="fkAskNotify">${icon('bell')}Enable notifications</button>` : ''}
            <button id="notif-test" data-click="fkTestNotify">Send a test</button>
            ${perm === 'denied' ? '<span class="muted">Blocked. Allow notifications for this app in your system settings.</span>' : ''}
          </div></section>
        <section class="card"><div class="card-head"><div><h3>Data</h3><p class="muted">Everything is stored on this device only.</p></div></div>
          <div class="row">
            <button id="export" data-click="fkExport">${icon('download')}Export JSON</button>
            <input type="file" id="import" class="sr-only" accept=".json,application/json" data-change="fkImport">
            <label for="import" class="btn">${icon('upload')}Import JSON</label>
            <span class="grow"></span>
            <button id="reset" class="btn-danger" data-click="fkReset">${icon('trash')}Reset all data</button>
          </div></section>
        <p class="muted center small">FocusKit v2 · <button class="link" data-click="fkHelp">Keyboard shortcuts</button></p>
      </div>`;
    },
  };
  const CORE_ACTIONS = {
    fkStop: () => stop(),
    fkStartCurrent: () => startCurrent(),
    fkToggle: el => toggle({ taskId: el.dataset.taskId, subjectId: el.dataset.subjectId }),
    fkPalette: () => { palette(); return false; },
    fkHelp: () => { help(); return false; },
    fkCloseModal: () => { closeModal(); return false; },
    fkSidebar: () => { S.ui.collapsed = !S.ui.collapsed; },
    fkThemeToggle: () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; },
    fkTheme: el => { S.theme = el.dataset.id; },
    fkAccent: el => { S.accent = color(el.dataset.id || el.value, 0); },
    fkAccentPreview: el => { document.documentElement.style.setProperty('--accent', el.value); return false; },
    fkGoal: el => { S.goalMin = Math.max(10, Number(el.value) || 240); },
    fkModule: el => { S.modules[el.dataset.id] = el.checked; },
    fkAskNotify: () => { askNotify().then(render); return false; },
    fkTestNotify: () => { notify('FocusKit', 'Alerts are working.'); return false; },
    fkExport() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
      a.download = `focuskit-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return false;
    },
    fkImport(el) {
      const file = el.files[0];
      if (!file) return false;
      file.text().then(text => {
        const data = JSON.parse(text);
        if (!isObj(data)) throw new Error('not an object');
        replace(merge(data));
        save();
        render();
        toast('Data imported.');
      }).catch(() => toast('That file is not a FocusKit export.'));
      return false;
    },
    fkReset() {
      if (!confirm('Delete all FocusKit data? Export first if you want a backup.')) return false;
      replace(defaults());
      toast('All data reset.');
    },
  };

  // ---------- boot ----------
  function boot() {
    Object.assign(ACTIONS, CORE_ACTIONS);
    load();
    save();
    for (const type of ['click', 'change', 'input', 'submit']) {
      document.addEventListener(type, e => {
        const el = e.target.closest?.(`[data-${type}]`);
        if (!el) return;
        const fn = ACTIONS[el.dataset[type]];
        if (!fn) return console.warn(`FocusKit: no action "${el.dataset[type]}"`);
        if (type === 'submit') e.preventDefault();
        run(() => fn(el, e));
      });
    }
    wireDrag();
    wirePalette();
    document.addEventListener('keydown', onKey);
    addEventListener('pointerdown', unlockAudio, { once: true });
    addEventListener('keydown', unlockAudio, { once: true });
    addEventListener('hashchange', () => { render(); $('#main').focus({ preventScroll: true }); });
    addEventListener('storage', e => { if (e.key === KEY) { try { replace(merge(JSON.parse(e.newValue))); } catch { return; } render(); } });
    $('#kbd-k').textContent = `${MOD} K`;
    render();
    setInterval(tick, 100);   // 100ms so stopwatches can show tenths
  }

  window.FK = {
    S, PALETTE, ACCENTS, GROUPS,
    boot, register, render, save, go, route, isOn, enabled,
    esc, uid, pad, hms, hm, mmss, hmst, clock, fmtDate, dayKey, today, dayStart, addDays, daysAgo, nextDay, color,
    sessions, overlap, total,
    start, stop, toggle, isRunning, label,
    tasks, project, tag, subject,
    notify, beep, toast, announce, askNotify,
    icon, ring, setRing, bar, empty, dot, modal, closeModal, palette, help,
    _nextDue: nextDue, _merge: merge,
  };
})();
