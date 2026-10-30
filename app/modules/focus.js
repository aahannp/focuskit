'use strict';
// Focus: one task in a distraction-free view with a Pomodoro / Flowtime / Countdown timer.
// Focus phases are real tracked sessions (FK.start/stop); breaks are not tracked. Also break
// reminders, idle detection and an anti-procrastination helper. Timer state lives in S.focus.
(() => {
  const { S, esc, icon } = FK;
  const MIN = 60000;
  const MODES = [['pomodoro', 'Pomodoro'], ['flowtime', 'Flowtime'], ['countdown', 'Countdown']];
  const PHASES = { focus: 'Focus', short: 'Short break', long: 'Long break', break: 'Break' };
  const TIPS = {
    big: ['Too big', 'Shrink it to the smallest next step you could finish in 10 minutes.', 'Split into subtasks'],
    unclear: ['Unclear', 'Write one sentence about what "done" looks like. Clarity kills the dread.', 'Write it in notes'],
    boring: ['Boring', 'Promise yourself just 5 minutes. Starting is the hard part; momentum does the rest.', 'Just 5 minutes'],
    tired: ['Tired', 'Take a real break: stand up, drink water, look out of a window. No phone.', 'Take a 5 min break'],
    distracted: ['Distracted', 'Close other tabs, silence your phone and go full screen with Zen.', 'Go Zen and start'],
  };

  // Last mouse/keyboard input, for idle detection. idleSince is set while the idle dialog is open.
  let lastInput = Date.now(), idleSince = null;
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
    addEventListener(ev, () => { lastInput = Date.now(); }, { capture: true, passive: true });
  }
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.focus?.zen && !document.querySelector('dialog[open]')) { S.focus.zen = false; FK.save(); FK.render(); }
  });

  const F = () => S.focus;
  const started = () => F().startedAt != null;
  const ticking = () => started() && F().paused == null;
  const elapsed = (now = Date.now()) => started() ? F().paused ?? now - F().startedAt : 0;
  // Planned length of a phase in minutes; null counts up (Flowtime focus).
  function phaseMin(phase) {
    const f = F();
    if (phase === 'focus') return f.mode === 'flowtime' ? null : f.mode === 'countdown' ? f.countMin : f.focusMin;
    return { short: f.breakMin, long: f.longMin, break: f.suggestMin }[phase] || 5;
  }
  const dur = () => started() ? F().dur : (phaseMin(F().phase) || 0) * MIN || null;
  // The running session belongs to this timer (same task, and not a Study subject when there is no task).
  function ours() {
    const r = S.running, id = F().taskId || null;
    return !!r && r.taskId === id && (!!id || !r.subjectId);
  }
  // Tracking follows the timer: only a ticking focus phase is tracked.
  function track() {
    const want = F().phase === 'focus' && ticking();
    if (want && !ours()) FK.start({ taskId: F().taskId });
    if (!want && ours()) FK.stop();
  }

  function begin(phase, min = phaseMin(phase)) {
    if (phase !== 'focus') FK.stop();   // starting a break stops any tracking
    Object.assign(F(), { phase, dur: min ? min * MIN : null, startedAt: Date.now(), paused: null });
    track();
  }
  function ready(phase) {
    Object.assign(F(), { phase, dur: null, startedAt: null, paused: null });
    track();
  }
  function setTask(id) {
    F().taskId = FK.tasks.get(id) ? id : null;
    track();
  }

  // A timed phase ended (or was skipped): close its session at the planned end, then line up the next phase.
  function finish(silent) {
    const f = F(), end = Math.min(Date.now(), f.startedAt + (f.dur || Infinity));
    if (f.phase === 'focus' && ours()) {
      FK.stop();
      const s = S.sessions.at(-1);
      if (s && s.end > end && end > s.start) s.end = end;
    }
    let next = 'focus', msg = ['Break over', 'Ready to focus again?'];
    if (f.phase === 'focus' && f.mode === 'pomodoro') {
      f.cycle++;
      next = f.cycle % f.longEvery === 0 ? 'long' : 'short';
      msg = ['Focus done', `Time for a ${phaseMin(next)} min ${next === 'long' ? 'long ' : ''}break.`];
    } else if (f.phase === 'focus') msg = ["Time's up", 'Countdown finished.'];
    if (!silent) FK.notify(...msg);
    const auto = f.autoNext && !(f.phase === 'focus' && f.mode !== 'pomodoro');
    auto ? begin(next) : ready(next);
  }
  // Flowtime: stop counting and suggest a break of about a fifth of the focus time.
  function flowStop() {
    const f = F(), e = elapsed(), min = Math.max(1, Math.round(e / MIN / 5));
    f.suggestMin = min;
    f.autoNext ? begin('break', min) : ready('break');
    FK.announce(`Focused ${FK.hm(e)}. Suggested break: ${min} minutes.`);
  }

  // Drop [since, now] from tracked time; keep the timer going (shifted) or stop everything.
  function cutIdle(since, stop) {
    const f = F(), now = Date.now(), r = S.running;
    S.sessions = S.sessions.flatMap(s => s.end <= since ? [s] : s.start >= since ? [] : [{ ...s, end: since }]);
    if (r && r.start < since) S.sessions.push({ taskId: r.taskId, subjectId: r.subjectId, start: r.start, end: since });
    if (stop) {
      S.running = null;
      ready('focus');
    } else {
      if (r) Object.assign(r, { start: now, reminded: false });
      if (ticking()) f.startedAt = now - Math.max(0, since - f.startedAt);
    }
  }
  function openIdle(since) {
    idleSince = since;
    FK.modal('Were you away?', `<div id="focus-idle" class="focus-idle">
      <p>You were idle for <b class="num" id="focus-idle-min">${Math.round((Date.now() - since) / MIN)} min</b> while
        <b>${esc(FK.label())}</b> was being tracked.</p>
      <div class="stack">
        <button class="btn-primary" id="focus-idle-keep" data-click="focusIdle" data-id="keep" autofocus>Keep the idle time</button>
        <button id="focus-idle-drop" data-click="focusIdle" data-id="drop">Discard idle time, keep going</button>
        <button class="btn-danger" id="focus-idle-stop" data-click="focusIdle" data-id="stop">Discard and stop</button>
      </div></div>`);
    FK.notify('Are you still there?', `No input for ${S.idleMin} min while a timer runs.`);
  }

  function procrastinate() {
    const t = FK.tasks.get(F().taskId);
    FK.modal('Procrastinating?', `<p class="muted focus-pro-lead">That's normal. What's getting in the way${t ? ` of <b>${esc(t.title)}</b>` : ''}?</p>
      <ul class="focus-tips">${Object.entries(TIPS).map(([k, [name, tip, act]]) => `<li>
        <details name="focus-tip"><summary>${esc(name)}</summary><p>${esc(tip)}</p>
          <button class="btn-primary btn-sm" id="focus-tip-${k}" data-click="focusTip" data-id="${k}">${esc(act)}</button></details></li>`).join('')}</ul>`);
  }
  function tip(k) {
    FK.closeModal();
    const f = F(), t = FK.tasks.get(f.taskId);
    const focusEl = id => setTimeout(() => document.getElementById(id)?.focus());
    if (k === 'big') return t ? focusEl('focus-sub-input') : FK.toast('Pick a task first, then split it into subtasks.');
    if (k === 'unclear') return t ? focusEl('focus-notes') : FK.toast('Pick a task first, then describe "done" in its notes.');
    if (k === 'boring') { f.mode = 'countdown'; return begin('focus', 5); }
    if (k === 'tired') return begin('break', 5);
    f.zen = true;
    if (!ticking() || f.phase !== 'focus') begin('focus');
  }

  // ---------- view ----------
  function controls() {
    const f = F(), flow = f.mode === 'flowtime' && f.phase === 'focus';
    const main = !started() ? [`Start${f.phase === 'focus' ? '' : ' break'}`, 'play', 'focusStart']
      : ticking() ? ['Pause', 'pause', 'focusPause'] : ['Resume', 'play', 'focusStart'];
    const second = flow && started() ? `<button class="btn-lg" id="focus-flow-stop" data-click="focusFlowStop">${icon('coffee')}Stop &amp; break</button>`
      : started() || f.phase !== 'focus' ? `<button class="btn-lg btn-ghost" id="focus-skip" data-click="focusSkip">${icon('right')}Skip</button>` : '';
    return `<div class="focus-controls">
      <button class="btn-icon btn-lg btn-ghost" id="focus-reset" data-click="focusReset" aria-label="Reset timer" title="Reset" ${started() || f.phase !== 'focus' ? '' : 'disabled'}>${icon('reset')}</button>
      <button class="btn-primary btn-lg focus-main" id="focus-main" data-click="${main[2]}">${icon(main[1])}${main[0]}</button>
      ${second}</div>`;
  }
  function hint() {
    const f = F();
    if (f.phase === 'break' && !started()) return `Nice session. A ${f.suggestMin} min break is suggested.`;
    if (f.phase !== 'focus') return started() ? 'Breaks are not tracked. Stand up and stretch.' : 'Breaks are not tracked.';
    if (f.mode === 'flowtime') return started() ? 'Counting up. Stop when your focus fades; you get a break of about a fifth.' : 'Count up for as long as you stay in the flow.';
    if (f.mode === 'countdown') return `A single ${f.countMin} min block.`;
    const n = f.longEvery - (f.cycle % f.longEvery);
    return n === 1 ? `Then a ${f.longMin} min long break.` : `Then a ${f.breakMin} min break · ${n} sessions to a long break.`;
  }
  function dots() {
    const f = F();
    if (f.mode !== 'pomodoro') return '';
    const filled = f.phase === 'long' ? f.longEvery : f.cycle % f.longEvery;
    return `<div class="focus-dots" role="img" aria-label="${filled} of ${f.longEvery} focus sessions before a long break">
      ${Array.from({ length: f.longEvery }, (_, i) => `<span class="${i < filled ? 'on' : ''}"></span>`).join('')}</div>`;
  }
  function taskPicker(t) {
    const open = FK.tasks.today().filter(x => x.status !== 'done');
    if (t && !open.includes(t)) open.unshift(t);
    return `<label class="focus-pick"><span class="sr-only">Task to focus on</span>
      <select id="focus-task" data-change="focusTask">
        <option value="">No task, just focus</option>
        ${open.map(x => `<option value="${esc(x.id)}" ${x === t ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}
      </select></label>`;
  }
  function taskPanels(t) {
    if (!t) return `<section class="card focus-hint-card">${FK.empty({ icon: 'target', title: 'Pick a task to see its subtasks and notes', hint: 'Or just start the timer: focus time counts even without a task.' })}</section>`;
    const subs = FK.tasks.children(t.id), done = subs.filter(s => s.status === 'done').length;
    return `<div class="grid cols-2 focus-panels">
      <section class="card" aria-labelledby="focus-subs-h">
        <div class="card-head"><h3 id="focus-subs-h">Subtasks</h3>${subs.length ? `<span class="badge num">${done}/${subs.length}</span>` : ''}</div>
        ${subs.length ? `<ul class="list focus-subs">${subs.map(s => `<li class="${s.status === 'done' ? 'done' : ''}">
          <input type="checkbox" class="check" id="focus-sub-${esc(s.id)}" data-change="focusSub" data-id="${esc(s.id)}" ${s.status === 'done' ? 'checked' : ''} aria-label="Done: ${esc(s.title)}">
          <label class="grow title" for="focus-sub-${esc(s.id)}">${esc(s.title)}</label></li>`).join('')}</ul>` : '<p class="muted small focus-none">Break the work into small, checkable steps.</p>'}
        <form class="row focus-sub-add" data-submit="focusSubAdd">
          <input type="text" id="focus-sub-input" name="title" class="grow input-sm" placeholder="Add a subtask" aria-label="New subtask" autocomplete="off" required>
          <button class="btn-sm" id="focus-sub-btn">${icon('plus')}Add</button>
        </form>
      </section>
      <section class="card" aria-labelledby="focus-notes-h">
        <div class="card-head"><h3 id="focus-notes-h">Notes</h3><span class="muted small">Saved as you type</span></div>
        <textarea id="focus-notes" data-input="focusNotes" rows="7" placeholder="What does done look like? Links, thoughts, next steps…" aria-labelledby="focus-notes-h">${esc(t.notes)}</textarea>
      </section></div>`;
  }
  function settings() {
    const f = F(), num = (key, label, val, min, max) => `<label class="focus-set"><span>${label}</span>
      <input type="number" id="focus-set-${key}" class="input-sm num" data-change="focusSet" data-key="${key}" min="${min}" max="${max}" value="${Number(val)}"></label>`;
    return `<details class="card focus-settings" id="focus-settings"${f.settingsOpen ? ' open' : ''}>
      <summary data-click="focusSettings"><span>${icon('settings')}Timer settings</span><span class="muted small">${f.focusMin}/${f.breakMin}/${f.longMin} min · alerts</span></summary>
      <div class="focus-set-grid">
        ${num('focusMin', 'Focus (min)', f.focusMin, 1, 600)}
        ${num('breakMin', 'Short break (min)', f.breakMin, 1, 120)}
        ${num('longMin', 'Long break (min)', f.longMin, 1, 120)}
        ${num('longEvery', 'Long break every', f.longEvery, 2, 12)}
        ${num('countMin', 'Countdown (min)', f.countMin, 1, 600)}
        ${num('breakEvery', 'Break reminder after (min, 0 = off)', S.breakCfg.every, 0, 600)}
        ${num('idleMin', 'Idle check after (min, 0 = off)', S.idleMin, 0, 120)}
        <label class="focus-set focus-set-switch"><span>Auto-start next phase</span>
          <input type="checkbox" role="switch" class="switch" id="focus-set-autoNext" data-change="focusSet" data-key="autoNext" ${f.autoNext ? 'checked' : ''}></label>
      </div></details>`;
  }

  FK.register({
    id: 'focus', name: 'Focus', group: 'Focus', key: 'f', icon: FK.icon('focus'),
    desc: 'Pomodoro, Flowtime and Countdown on one task',
    state: {
      focus: { mode: 'pomodoro', focusMin: 25, breakMin: 5, longMin: 15, longEvery: 4, countMin: 45, autoNext: false,
        taskId: null, phase: 'focus', startedAt: null, dur: null, paused: null, cycle: 0, suggestMin: 5, zen: false, settingsOpen: false },
    },
    render(arg) {
      const f = F();
      if (arg) {   // #focus/<taskId> picks the task, then drops the id from the URL
        if (FK.tasks.get(arg)) { setTask(arg); FK.save(); }
        history.replaceState(null, '', '#focus');
      }
      if (f.taskId && !FK.tasks.get(f.taskId)) f.taskId = null;
      const t = FK.tasks.get(f.taskId), brk = f.phase !== 'focus';
      const p = t && FK.project(t.projectId);
      const ring = FK.ring(0, `<b class="num" id="focus-time" role="timer" aria-label="Time"></b>`,
        { id: 'focus-ring', size: 300, stroke: 5, sub: `<span class="focus-phase">${esc(PHASES[f.phase])}${started() && !ticking() ? ' · paused' : ''}</span>` });
      return `<div class="focus-wrap${f.zen ? ' zen' : ''}${brk ? ' is-break' : ''}${ticking() ? ' is-on' : ''}">
          <div class="focus-top">
            <div class="seg" role="group" aria-label="Technique">${MODES.map(([id, name]) => `<button id="focus-mode-${id}" data-click="focusMode" data-id="${id}"
              aria-pressed="${f.mode === id}" ${started() && f.mode !== id ? 'disabled title="Reset the timer to switch technique"' : ''}>${name}</button>`).join('')}</div>
            <span class="grow"></span>
            <button class="btn-ghost" id="focus-pro" data-click="focusProcrastinate">${icon('sparkle')}Procrastinating?</button>
            <button class="btn-ghost" id="focus-zen" data-click="focusZen" aria-pressed="${!!f.zen}" title="${f.zen ? 'Exit Zen (Esc)' : 'Hide everything else'}">${icon(f.zen ? 'x' : 'focus')}${f.zen ? 'Exit Zen' : 'Zen'}</button>
          </div>
          <div class="focus-stage">
            <div class="focus-task">
              ${p ? `<span class="tag" style="--c:${esc(p.color)}">${esc(p.name)}</span>` : `<span class="eyebrow">${brk ? 'Break time' : 'Focusing on'}</span>`}
              <h2 class="focus-title">${t ? esc(t.title) : brk ? 'Rest your eyes' : 'Free focus'}</h2>
              ${taskPicker(t)}
            </div>
            ${ring}
            ${dots()}
            ${controls()}
            <p class="muted small focus-hint">${esc(hint())}</p>
            ${t && t.status !== 'done' ? `<button class="link small" id="focus-complete" data-click="focusComplete">${icon('check')}Mark task done</button>` : ''}
          </div>
        </div>
        ${taskPanels(t)}
        ${settings()}`;
    },
    tick(now) {
      const f = F();
      // Someone stopped or switched the timer elsewhere (top bar, Today…): pause instead of tracking the wrong thing.
      if (f.phase === 'focus' && ticking() && !ours()) { f.paused = elapsed(now); FK.save(); FK.render(); return; }
      if (ticking() && f.dur && now - f.startedAt >= f.dur) { finish(); FK.save(); FK.render(); return; }

      const r = S.running, every = S.breakCfg.every;
      if (r && !r.reminded && every > 0 && now - r.start >= every * MIN && !(ours() && f.dur && f.dur <= every * MIN)) {
        r.reminded = true;
        FK.notify('Time for a break', `You've been at it for ${every} min straight. Rest ${S.breakCfg.min || 5} min.`);
        FK.save();
      }
      const dlg = document.getElementById('modal');
      if (idleSince != null && !(dlg?.open && dlg.querySelector('#focus-idle'))) idleSince = null;   // closed with Esc/backdrop: keep
      if (idleSince == null && r && S.idleMin > 0 && now - lastInput >= S.idleMin * MIN) openIdle(lastInput);
      const idleEl = document.getElementById('focus-idle-min');
      if (idleEl && idleSince != null) idleEl.textContent = `${Math.round((now - idleSince) / MIN)} min`;

      const el = document.getElementById('focus-time');
      if (!el) return;
      const d = dur(), e = elapsed(now), shown = d ? d - e : e;
      el.textContent = shown >= 3600000 ? FK.hms(shown) : FK.mmss(shown);
      const pct = d ? e / d * 100 : e % 3600000 / 36000;
      FK.setRing('focus-ring', pct, `${PHASES[f.phase]}: ${d ? `${FK.mmss(d - e)} left` : `${FK.mmss(e)} elapsed`}`);
    },
    actions: {
      focusMode(el) { F().mode = el.dataset.id; ready('focus'); },
      focusStart() {
        const f = F();
        if (!started()) return begin(f.phase);
        f.startedAt = Date.now() - f.paused;
        f.paused = null;
        track();
      },
      focusPause() { F().paused = elapsed(); track(); },
      focusReset() { ready('focus'); },
      focusSkip() { started() ? finish(true) : ready('focus'); },
      focusFlowStop() { flowStop(); },
      focusTask(el) { setTask(el.value); },
      focusComplete() {
        const f = F(), was = ticking() && f.phase === 'focus';
        FK.tasks.complete(f.taskId);
        FK.toast('Task done. Nice work.');
        setTask(FK.tasks.today().find(x => x.status !== 'done')?.id);
        if (was && !ours()) FK.start({ taskId: f.taskId });   // keep the focus block going on the next task
      },
      focusSub(el) { el.checked ? FK.tasks.complete(el.dataset.id) : FK.tasks.update(el.dataset.id, { status: 'todo' }); },
      focusSubAdd(form) {
        FK.tasks.add({ title: form.elements.title.value.trim() || 'Subtask', parentId: F().taskId });
        setTimeout(() => document.getElementById('focus-sub-input')?.focus());
      },
      focusNotes(el) {
        const t = FK.tasks.get(F().taskId);
        if (t) { t.notes = el.value; FK.save(); }
        return false;
      },
      focusSet(el) {
        const k = el.dataset.key, f = F();
        if (k === 'autoNext') { f.autoNext = el.checked; return; }
        const v = Math.round(Number(el.value));
        const ok = Number.isFinite(v) && v >= Number(el.min) && v <= Number(el.max);
        if (!ok) { FK.toast(`Pick a number from ${el.min} to ${el.max}.`); return; }
        if (k === 'breakEvery') S.breakCfg.every = v;
        else if (k === 'idleMin') S.idleMin = v;
        else f[k] = v;
      },
      focusSettings(el, e) { e.preventDefault(); F().settingsOpen = !F().settingsOpen; },
      focusZen() { F().zen = !F().zen; },
      focusProcrastinate() { procrastinate(); return false; },
      focusTip(el) { tip(el.dataset.id); },
      focusIdle(el) {
        const since = idleSince ?? Date.now(), k = el.dataset.id;
        idleSince = null;
        lastInput = Date.now();
        FK.closeModal();
        if (k !== 'keep') cutIdle(since, k === 'stop');
        if (k !== 'keep') FK.toast(k === 'stop' ? 'Idle time discarded. Timer stopped.' : 'Idle time discarded.');
      },
    },
    commands() {
      const go = mode => () => { F().mode = mode; ready('focus'); begin('focus'); FK.go('focus'); };
      return [
        ...MODES.map(([id, name]) => ({ label: `Start ${name}`, hint: 'Focus', icon: icon('focus'), keywords: 'focus timer pomodoro', run: go(id) })),
        ...FK.tasks.today().filter(t => t.status !== 'done')
          .map(t => ({ label: `Focus on “${t.title}”`, hint: 'Focus', icon: icon('target'), run: () => FK.go('focus', t.id) })),
      ];
    },
  });
})();
