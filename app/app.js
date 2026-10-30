'use strict';
// FocusKit — a plain study + productivity app. Every feature is one entry in MODULES;
// Settings can switch each one off. All data lives in localStorage under "focuskit".

const KEY = 'focuskit';
const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
const DEFAULTS = () => ({
  modules: {},          // { [moduleId]: false } for modules switched off
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  subjects: [],         // { id, name, color }
  sessions: [],         // { subjectId, taskId, start, end } in ms; stats are computed from these
  running: null,        // { subjectId, taskId, start, reminded }: the one live timer
  tasks: [],            // { id, title, subjectId, estimate (min), done }
  pomo: { focusMin: 25, breakMin: 5, mode: 'focus', endsAt: null, left: null },
  watch: { start: null, elapsed: 0, laps: [] },   // standalone stopwatch; laps are running totals in ms
  ddays: [],            // { id, name, date: 'YYYY-MM-DD' }
  breakEvery: 50,       // minutes of continuous timing before a break reminder
  notes: '',
});

// Keep only keys whose type matches the defaults, so a bad import can't break rendering.
function merge(d) {
  const s = DEFAULTS();
  for (const k in s)
    if (d[k] != null && typeof d[k] === typeof s[k] && Array.isArray(d[k]) === Array.isArray(s[k])) s[k] = d[k];
  s.pomo = { ...DEFAULTS().pomo, ...s.pomo };
  s.watch = { ...DEFAULTS().watch, ...s.watch };
  return s;
}

let S;
try { S = merge(JSON.parse(localStorage.getItem(KEY)) || {}); } catch { S = DEFAULTS(); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save: browser storage is unavailable.'); }
}

// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = n => String(Math.floor(n)).padStart(2, '0');
const hms = ms => { const s = ms / 1000; return `${pad(s / 3600)}:${pad(s / 60 % 60)}:${pad(s % 60)}`; };
const mmss = ms => { const s = Math.ceil(ms / 1000); return `${pad(s / 60)}:${pad(s % 60)}`; };
const hmst = ms => `${hms(ms)}.${Math.floor(ms / 100 % 10)}`;
const hm = ms => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`; };
const daysAgo = n => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime(); };
const subject = id => S.subjects.find(s => s.id === id);
const dot = color => `<span class="dot" style="background:${esc(color)}"></span>`;

// All sessions, with the running timer included up to now.
const sessions = () => S.running ? [...S.sessions, { ...S.running, end: Date.now() }] : S.sessions;
const overlap = (s, from, to) => Math.max(0, Math.min(s.end, to) - Math.max(s.start, from));
const total = (from, to, keep = () => true) => sessions().filter(keep).reduce((sum, s) => sum + overlap(s, from, to), 0);

function startTimer(subjectId, taskId = null) {
  stopTimer();
  S.running = { subjectId, taskId, start: Date.now(), reminded: false };
  askNotify();
}
function stopTimer() {
  const r = S.running;
  if (!r) return;
  if (Date.now() - r.start >= 1000) S.sessions.push({ subjectId: r.subjectId, taskId: r.taskId, start: r.start, end: Date.now() });
  S.running = null;
}

// ---------- alerts: in-app toast + beep, plus a system notification when allowed ----------
let audio, toastTimer;
const unlockAudio = () => { try { audio ||= new AudioContext(); } catch {} };
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });

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
  $('#toast').textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 8000);
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

function bar(label, ms, max, color = 'var(--accent)') {
  return `<div class="bar"><span title="${esc(label)}">${esc(label)}</span>
    <div class="track"><div class="fill" style="width:${(ms / max * 100).toFixed(1)}%;background:${esc(color)}"></div></div>
    <span class="num">${hm(ms)}</span></div>`;
}
const watchTime = now => S.watch.elapsed + (S.watch.start ? now - S.watch.start : 0);
const pomoLeft = now => {
  const p = S.pomo;
  return p.endsAt ? p.endsAt - now : p.left ?? (p.mode === 'focus' ? p.focusMin : p.breakMin) * 60000;
};

// ---------- modules ----------
// { id, name, render() -> html, tick?(now) runs every second while on, actions: { name(el) } }
// An action re-renders after it runs unless it returns false.
let statsDays = 7;

const MODULES = [
  {
    id: 'study', name: 'Study',
    render() {
      const rows = S.subjects.map(s => {
        const on = S.running?.subjectId === s.id;
        return `<li class="${on ? 'on' : ''}">${dot(s.color)}<span class="grow">${esc(s.name)}</span>
          <span class="num" data-sub="${esc(s.id)}"></span>
          <button id="run-${esc(s.id)}" data-click="studyRun" data-id="${esc(s.id)}">${on ? 'Stop' : 'Start'}</button>
          <button id="del-${esc(s.id)}" data-click="studyDel" data-id="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">×</button></li>`;
      }).join('');
      return `<h2>Today</h2><p class="big" id="study-total"></p>
        ${rows ? `<ul class="list">${rows}</ul>` : '<p class="muted">Add a subject to start timing.</p>'}
        <form data-submit="studyAdd">
          <input type="text" id="sub-name" name="name" placeholder="New subject" aria-label="Subject name" required>
          <input type="color" id="sub-color" name="color" value="${PALETTE[S.subjects.length % PALETTE.length]}" aria-label="Subject colour">
          <button id="sub-add">Add subject</button>
        </form>`;
    },
    tick(now) {
      const today = daysAgo(0);
      document.querySelectorAll('[data-sub]').forEach(el => {
        el.textContent = hms(total(today, now, s => s.subjectId === el.dataset.sub));
      });
      const t = $('#study-total');
      if (t) t.textContent = hms(total(today, now));
    },
    actions: {
      studyRun: el => S.running?.subjectId === el.dataset.id ? stopTimer() : startTimer(el.dataset.id),
      studyDel(el) {
        const s = subject(el.dataset.id);
        if (!confirm(`Delete subject "${s.name}"? Its past time stays in Stats as "Other".`)) return false;
        if (S.running?.subjectId === s.id) stopTimer();
        S.subjects = S.subjects.filter(x => x !== s);
      },
      studyAdd(form) {
        const f = form.elements;
        S.subjects.push({ id: uid(), name: f.name.value.trim() || 'Subject', color: f.color.value });
      },
    },
  },

  {
    id: 'watch', name: 'Stopwatch',
    render() {
      const w = S.watch;
      const laps = w.laps.map((t, i) => `<li><span class="grow">Lap ${i + 1}</span>
        <span class="num">${hmst(t - (w.laps[i - 1] || 0))}</span><span class="num muted">${hmst(t)}</span></li>`).reverse().join('');
      return `<p class="big" id="watch-time"></p>
        <div class="row">
          <button id="watch-go" data-click="watchGo">${w.start ? 'Pause' : 'Start'}</button>
          <button id="watch-lap" data-click="watchLap" ${w.start ? '' : 'disabled'}>Lap</button>
          <button id="watch-reset" data-click="watchReset">Reset</button>
        </div>
        ${laps ? `<ul class="list" aria-label="Laps">${laps}</ul>` : ''}`;
    },
    tick(now) {
      const el = $('#watch-time');
      if (el) el.textContent = hmst(watchTime(now));
    },
    actions: {
      watchGo() {
        const w = S.watch, now = Date.now();
        if (w.start) { w.elapsed += now - w.start; w.start = null; } else w.start = now;
      },
      watchLap() { S.watch.laps.push(watchTime(Date.now())); },
      watchReset() { S.watch = { start: null, elapsed: 0, laps: [] }; },
    },
  },

  {
    id: 'tasks', name: 'Tasks',
    render() {
      const options = S.subjects.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      const rows = [...S.tasks].sort((a, b) => a.done - b.done).map(t => {
        const on = S.running?.taskId === t.id, sub = subject(t.subjectId), id = esc(t.id);
        return `<li class="${t.done ? 'done' : ''} ${on ? 'on' : ''}">
          <input type="checkbox" id="done-${id}" data-change="taskDone" data-id="${id}" ${t.done ? 'checked' : ''}>
          <label class="grow" for="done-${id}">${esc(t.title)}${sub ? ` <small>${dot(sub.color)}${esc(sub.name)}</small>` : ''}</label>
          <span class="num"><span data-task="${id}" data-est="${Number(t.estimate) || 0}"></span>${t.estimate ? ` / ${hm(t.estimate * 60000)}` : ''}</span>
          ${t.done ? '' : `<button id="run-${id}" data-click="taskRun" data-id="${id}">${on ? 'Stop' : 'Start'}</button>`}
          <button id="del-${id}" data-click="taskDel" data-id="${id}" aria-label="Delete ${esc(t.title)}">×</button></li>`;
      }).join('');
      return `<form data-submit="taskAdd">
          <input type="text" id="task-title" name="title" placeholder="New task" aria-label="Task" required>
          ${options ? `<select id="task-sub" name="subject" aria-label="Subject"><option value="">No subject</option>${options}</select>` : ''}
          <input type="number" id="task-est" name="estimate" min="0" step="5" placeholder="Est. min" aria-label="Estimate in minutes">
          <button id="task-add">Add task</button>
        </form>
        ${rows ? `<ul class="list">${rows}</ul>` : '<p class="muted">No tasks yet.</p>'}`;
    },
    tick(now) {
      document.querySelectorAll('[data-task]').forEach(el => {
        const spent = total(0, now, s => s.taskId === el.dataset.task), est = el.dataset.est * 60000;
        el.textContent = hm(spent);
        el.parentElement.classList.toggle('over', est > 0 && spent > est);
      });
    },
    actions: {
      taskAdd(form) {
        const f = form.elements;
        S.tasks.push({ id: uid(), title: f.title.value.trim() || 'Task', subjectId: f.subject?.value || null,
          estimate: Number(f.estimate.value) || 0, done: false });
      },
      taskRun(el) {
        const t = S.tasks.find(x => x.id === el.dataset.id);
        S.running?.taskId === t.id ? stopTimer() : startTimer(t.subjectId, t.id);
      },
      taskDone(el) {
        const t = S.tasks.find(x => x.id === el.dataset.id);
        t.done = el.checked;
        if (t.done && S.running?.taskId === t.id) stopTimer();
      },
      taskDel(el) {
        if (S.running?.taskId === el.dataset.id) stopTimer();
        S.tasks = S.tasks.filter(x => x.id !== el.dataset.id);
      },
    },
  },

  {
    id: 'pomo', name: 'Pomodoro',
    render() {
      const p = S.pomo;
      return `<h2>${p.mode === 'focus' ? 'Focus' : 'Break'}</h2>
        <p class="big" id="pomo-left"></p>
        <div class="row">
          <button id="pomo-go" data-click="pomoGo">${p.endsAt ? 'Pause' : 'Start'}</button>
          <button id="pomo-reset" data-click="pomoReset">Reset</button>
          <button id="pomo-skip" data-click="pomoSkip">Skip to ${p.mode === 'focus' ? 'break' : 'focus'}</button>
        </div>
        <div class="row">
          <label for="pomo-focus">Focus (min)</label>
          <input type="number" id="pomo-focus" min="1" max="180" value="${Number(p.focusMin)}" data-change="pomoLen" data-id="focusMin">
          <label for="pomo-break">Break (min)</label>
          <input type="number" id="pomo-break" min="1" max="60" value="${Number(p.breakMin)}" data-change="pomoLen" data-id="breakMin">
        </div>`;
    },
    tick(now) {
      const p = S.pomo;
      if (p.endsAt && now >= p.endsAt) {
        notify(p.mode === 'focus' ? 'Focus done' : 'Break over', p.mode === 'focus' ? 'Time for a break.' : 'Back to focus.');
        p.mode = p.mode === 'focus' ? 'break' : 'focus';
        p.endsAt = p.left = null;
        save();
        render();
        return;
      }
      const el = $('#pomo-left');
      if (el) el.textContent = mmss(pomoLeft(now));
    },
    actions: {
      pomoGo() {
        const p = S.pomo, now = Date.now();
        if (p.endsAt) { p.left = p.endsAt - now; p.endsAt = null; }
        else { p.endsAt = now + pomoLeft(now); p.left = null; askNotify(); }
      },
      pomoReset() { S.pomo.endsAt = S.pomo.left = null; },
      pomoSkip() {
        const p = S.pomo;
        p.mode = p.mode === 'focus' ? 'break' : 'focus';
        p.endsAt = p.left = null;
      },
      pomoLen(el) {
        S.pomo[el.dataset.id] = Math.max(1, Number(el.value) || 1);
        if (!S.pomo.endsAt) S.pomo.left = null;
      },
    },
  },

  {
    id: 'stats', name: 'Stats',
    render() {
      const now = Date.now(), from = daysAgo(statsDays - 1);
      const ranges = [[1, 'Today'], [7, '7 days'], [30, '30 days']];
      const cards = ranges.map(([n, label]) => `<div class="card"><small>${label}</small><b>${hm(total(daysAgo(n - 1), now))}</b></div>`).join('');
      const pick = ranges.map(([n, label]) =>
        `<button id="range-${n}" data-click="statsRange" data-id="${n}" aria-pressed="${n === statsDays}">${label}</button>`).join('');

      const bySubject = new Map();
      for (const s of sessions()) {
        const key = subject(s.subjectId) ? s.subjectId : '';
        bySubject.set(key, (bySubject.get(key) || 0) + overlap(s, from, now));
      }
      const subs = [...bySubject].filter(([, ms]) => ms > 0).sort((a, b) => b[1] - a[1]);
      const subBars = subs.map(([id, ms]) => {
        const s = subject(id);
        return bar(s ? s.name : 'Other', ms, subs[0][1], s?.color);
      }).join('');

      const days = Array.from({ length: statsDays }, (_, i) => [daysAgo(i), total(daysAgo(i), daysAgo(i - 1))]);
      const dayMax = Math.max(1, ...days.map(d => d[1]));
      const dayBars = days.map(([t, ms]) =>
        bar(new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), ms, dayMax)).join('');

      return `<div class="cards">${cards}</div>
        <div class="row" role="group" aria-label="Range">${pick}</div>
        <h2>By subject</h2>${subBars || '<p class="muted">Nothing tracked in this range.</p>'}
        <h2>By day</h2>${dayBars}`;
    },
    actions: {
      statsRange(el) { statsDays = Number(el.dataset.id); },
    },
  },

  {
    id: 'dday', name: 'D-Day',
    render() {
      const today = daysAgo(0);
      const rows = [...S.ddays].sort((a, b) => a.date.localeCompare(b.date)).map(d => {
        const n = Math.round((new Date(`${d.date}T00:00`) - today) / 864e5);
        const label = n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : `D+${-n}`;
        return `<li><b class="num">${label}</b><span class="grow">${esc(d.name)} <small>${esc(d.date)}</small></span>
          <button id="del-${esc(d.id)}" data-click="ddayDel" data-id="${esc(d.id)}" aria-label="Delete ${esc(d.name)}">×</button></li>`;
      }).join('');
      return `<form data-submit="ddayAdd">
          <input type="text" id="dday-name" name="name" placeholder="Exam, deadline…" aria-label="Name" required>
          <input type="date" id="dday-date" name="date" aria-label="Date" required>
          <button id="dday-add">Add</button>
        </form>
        ${rows ? `<ul class="list">${rows}</ul>` : '<p class="muted">No countdowns yet.</p>'}`;
    },
    actions: {
      ddayAdd(form) {
        const f = form.elements;
        S.ddays.push({ id: uid(), name: f.name.value.trim(), date: f.date.value });
      },
      ddayDel(el) { S.ddays = S.ddays.filter(d => d.id !== el.dataset.id); },
    },
  },

  {
    id: 'break', name: 'Break reminder',
    render() {
      return `<div class="row">
          <label for="break-every">Remind me to take a break after</label>
          <input type="number" id="break-every" min="5" max="240" value="${Number(S.breakEvery)}" data-change="breakEvery">
          <span>minutes of continuous timing.</span>
        </div>
        <p class="muted">Counts from when the current study or task timer started.</p>`;
    },
    tick(now) {
      const r = S.running;
      if (r && !r.reminded && now - r.start >= S.breakEvery * 60000) {
        r.reminded = true;
        save();
        notify('Take a break', `You have been focused for ${S.breakEvery} minutes.`);
      }
    },
    actions: {
      breakEvery(el) { S.breakEvery = Math.max(1, Number(el.value) || 50); },
    },
  },

  {
    id: 'notes', name: 'Notes',
    render() {
      return `<h2><label for="notes">Notes</label></h2>
        <textarea id="notes" data-input="notes" placeholder="Scratchpad…">${esc(S.notes)}</textarea>`;
    },
    actions: {
      notes(el) { S.notes = el.value; save(); return false; },
    },
  },
];

const SETTINGS = {
  id: 'settings', name: 'Settings',
  render() {
    const toggles = MODULES.map(m => `<label><input type="checkbox" id="mod-${m.id}" data-change="toggleModule" data-id="${m.id}"
      ${isOn(m) ? 'checked' : ''}> ${m.name}</label>`).join('');
    const perm = window.Notification ? Notification.permission : 'unsupported';
    return `<fieldset><legend>Modules</legend>${toggles}</fieldset>
      <fieldset><legend>Appearance</legend>
        <label>Theme <select id="theme" data-change="theme">
          <option value="light" ${S.theme === 'light' ? 'selected' : ''}>Light</option>
          <option value="dark" ${S.theme === 'dark' ? 'selected' : ''}>Dark</option>
        </select></label>
      </fieldset>
      <fieldset><legend>Notifications</legend>
        <div class="row"><span>System notifications: ${perm}</span>
          ${perm === 'default' ? '<button id="notif-ask" data-click="askNotify">Enable</button>' : ''}
          <button id="notif-test" data-click="testNotify">Test</button>
        </div>
      </fieldset>
      <fieldset><legend>Data</legend>
        <div class="row">
          <button id="export" data-click="exportData">Export JSON</button>
          <label for="import">Import JSON</label>
          <input type="file" id="import" accept=".json,application/json" data-change="importData">
        </div>
        <div class="row"><button id="reset" class="danger" data-click="reset">Reset all data</button></div>
      </fieldset>`;
  },
  actions: {
    stop: () => stopTimer(),
    toggleModule(el) { S.modules[el.dataset.id] = el.checked; },
    theme(el) { S.theme = el.value; },
    askNotify() { askNotify().then(render); return false; },
    testNotify() { notify('FocusKit', 'Alerts are working.'); return false; },
    exportData() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
      a.download = `focuskit-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return false;
    },
    importData(el) {
      const file = el.files[0];
      if (!file) return false;
      file.text().then(text => {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
        S = merge(data);
        save();
        render();
        toast('Data imported.');
      }).catch(() => toast('That file is not a FocusKit export.'));
      return false;
    },
    reset() {
      if (!confirm('Delete all FocusKit data? Export first if you want a backup.')) return false;
      S = DEFAULTS();
    },
  },
};

// ---------- shell ----------
const isOn = m => S.modules[m.id] !== false;
const ACTIONS = Object.assign({}, ...[...MODULES, SETTINGS].map(m => m.actions));

function render() {
  document.documentElement.dataset.theme = S.theme;
  const mods = MODULES.filter(isOn);
  const view = [...mods, SETTINGS].find(m => m.id === location.hash.slice(1)) || mods[0] || SETTINGS;
  $('#tabs').innerHTML = [...mods, SETTINGS].map(m =>
    `<a href="#${m.id}"${m === view ? ' aria-current="page"' : ''}>${m.name}</a>`).join('');

  const r = S.running;
  const label = r && [S.tasks.find(t => t.id === r.taskId)?.title, subject(r.subjectId)?.name].filter(Boolean).join(' · ');
  $('#now').innerHTML = r ? `${dot(subject(r.subjectId)?.color || 'var(--muted)')}<span>${esc(label || 'Timer')}</span>
    <b class="num" id="now-time"></b><button id="now-stop" data-click="stop">Stop</button>` : '';

  const focused = document.activeElement?.id;   // keep keyboard focus across re-renders
  $('#main').innerHTML = view.render();
  if (focused) document.getElementById(focused)?.focus();
  tick();
}

function tick() {
  const now = Date.now();
  MODULES.filter(isOn).forEach(m => m.tick?.(now));
  const r = S.running, p = S.pomo, el = $('#now-time');
  if (el && r) el.textContent = hms(now - r.start);
  document.title = r ? `${hms(now - r.start)} · FocusKit` : p.endsAt ? `${mmss(p.endsAt - now)} · FocusKit` : 'FocusKit';
}

// One delegated listener per event type: elements name their action in data-click / data-change / data-input / data-submit.
for (const type of ['click', 'change', 'input', 'submit']) {
  document.addEventListener(type, e => {
    const el = e.target.closest(`[data-${type}]`);
    if (!el) return;
    if (type === 'submit') e.preventDefault();
    if (ACTIONS[el.dataset[type]](el) !== false) { save(); render(); }
  });
}
addEventListener('hashchange', render);
addEventListener('storage', e => { if (e.key === KEY) { S = merge(JSON.parse(e.newValue) || {}); render(); } });
setInterval(tick, 100);   // 100ms so the stopwatch shows tenths
render();
