'use strict';
// Today: greeting, today's plan (timeline + up next), focus time vs goal, today's tasks with quick add,
// the running timer and "evaluate your day".
(() => {
  const { S, esc, icon } = FK;
  const FROM = 6 * 60, TO = 24 * 60;   // timeline window in minutes, same as Planner
  const RATINGS = ['Rough', 'Meh', 'Okay', 'Good', 'Great'];
  let evalOpen = false;                  // "Evaluate your day" opened before 17:00

  const minsOf = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
  const pos = m => (Math.max(FROM, Math.min(TO, m)) - FROM) / (TO - FROM) * 100;   // % across the strip
  const hhmm = m => `${Math.floor(m / 60)}:${FK.pad(m % 60)}`;
  // Today's planned blocks { t, s, e } in minutes, sorted by start.
  function planned() {
    const k = FK.today();
    return S.tasks.filter(t => t.plannedAt != null && FK.dayKey(t.plannedAt) === k)
      .map(t => { const s = minsOf(t.plannedAt); return { t, s, e: Math.min(TO, s + (t.plannedMin || t.estimate || 30)) }; })
      .sort((a, b) => a.s - b.s)
      .map((b, i, all) => ({ ...b, low: all.slice(0, i).some(o => !o.low && o.e > b.s) }));   // overlaps drop to the lower half
  }

  function planCard() {
    const bl = planned(), now = minsOf(Date.now());
    const next = bl.find(b => b.t.status !== 'done' && b.e > now);
    const ticks = [6, 9, 12, 15, 18, 21, 24].map(h => `<span style="left:${pos(h * 60)}%">${h}</span>`).join('');
    const strip = bl.map(b => `<li class="tl-block${b.t.status === 'done' ? ' done' : ''}${b === next ? ' next' : ''}${b.low ? ' low' : bl.some(o => o.low && o.s < b.e && o.e > b.s) ? ' high' : ''}" style="--c:${esc(FK.project(b.t.projectId)?.color || 'var(--accent)')};left:${pos(b.s).toFixed(2)}%;width:${(pos(b.e) - pos(b.s)).toFixed(2)}%"
        title="${hhmm(b.s)}–${hhmm(b.e)} ${esc(b.t.title)}"><span class="sr-only">${hhmm(b.s)} to ${hhmm(b.e)}: </span><span class="tl-text">${esc(b.t.title)}</span></li>`).join('');
    let up = '<p class="muted small up-none">Nothing else timeboxed today.</p>';
    if (next) {
      const id = esc(next.t.id), on = FK.isRunning({ taskId: next.t.id }), inMin = next.s - now;
      up = `<div class="up-next"><span class="up-when"><span class="eyebrow">Up next</span><b class="num">${hhmm(next.s)}</b></span>
        <span class="grow up-title"><b>${esc(next.t.title)}</b><span class="muted small">${inMin > 0 ? `in ${FK.hm(inMin * 60000)}` : 'now'} · ${FK.hm((next.e - next.s) * 60000)}</span></span>
        ${FK.isOn('focus') ? `<a class="btn btn-sm btn-ghost" id="up-focus" href="#focus/${id}">${icon('focus')}Focus</a>` : ''}
        <button class="btn-sm ${on ? 'btn-danger' : 'btn-primary'}" id="up-start" data-click="fkToggle" data-task-id="${id}">${icon(on ? 'stop' : 'play')}${on ? 'Stop' : 'Start'}</button></div>`;
    }
    return `<section class="card today-plan" aria-labelledby="today-plan-h">
      <div class="card-head"><h3 id="today-plan-h">Today's plan</h3>${FK.isOn('planner') ? `<a class="btn btn-sm btn-ghost" id="today-planner" href="#planner">${icon('planner')}Plan day</a>` : ''}</div>
      <div class="tl"><ul class="tl-track" aria-label="Planned blocks">${strip}</ul>
        <div class="tl-now" id="today-now" aria-hidden="true"></div>
        <div class="tl-ticks" aria-hidden="true">${ticks}</div>
        ${bl.length ? '' : `<p class="tl-empty muted small">No timeboxes yet${FK.isOn('planner') ? ' · drag tasks onto the Planner grid' : ''}</p>`}</div>
      ${bl.length ? up : ''}</section>`;
  }

  function evalCard() {
    const d = S.days[FK.today()] || {};
    return `<section class="card eval-card" aria-labelledby="eval-h">
      <div class="card-head"><h3 id="eval-h">Evaluate your day</h3>${d.rating ? `<span class="badge accent">${RATINGS[d.rating - 1]}</span>` : ''}</div>
      <div class="rate" role="group" aria-labelledby="eval-h">${RATINGS.map((r, i) => `<button id="rate-${i + 1}" data-click="todayRate" data-id="${i + 1}"
        aria-pressed="${d.rating === i + 1}" aria-label="${i + 1} of 5, ${r}"><b>${i + 1}</b><small>${r}</small></button>`).join('')}</div>
      <label class="sr-only" for="eval-note">A note about today</label>
      <textarea id="eval-note" rows="2" maxlength="280" data-input="todayNote" placeholder="What went well? What would you change?">${esc(d.note || '')}</textarea>
      <p class="faint small">Saved as you go.</p></section>`;
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function row(t) {
    const id = esc(t.id), done = t.status === 'done', on = FK.isRunning({ taskId: t.id });
    const p = FK.project(t.projectId), late = !done && t.due && t.due < FK.today();
    const meta = [
      p && `<span class="tag" style="--c:${esc(p.color)}">${esc(p.name)}</span>`,
      late && `<span class="tag tag-danger">Due ${esc(FK.fmtDate(t.due, { month: 'short', day: 'numeric' }))}</span>`,
      t.repeat && `<span class="tag" title="Repeats every ${esc(t.repeat.every)}">${icon('repeat')}${esc(t.repeat.every)}</span>`,
    ].filter(Boolean).join('');
    return `<li class="task-row${done ? ' done' : ''}${on ? ' on' : ''}" data-task-id="${id}">
      <input type="checkbox" class="check" id="td-${id}" data-change="todayDone" data-id="${id}" ${done ? 'checked' : ''} aria-label="Done: ${esc(t.title)}">
      <span class="grow task-main"><span class="task-title">${esc(t.title)}</span>${meta ? `<span class="task-meta">${meta}</span>` : ''}</span>
      <span class="num muted task-time"><span data-spent="${id}"></span>${t.estimate ? ` / ${FK.hm(t.estimate * 60000)}` : ''}</span>
      ${done ? '' : `<button class="btn-icon ${on ? 'btn-primary' : 'btn-ghost'}" id="tr-${id}" data-click="fkToggle" data-task-id="${id}"
        aria-label="${on ? 'Stop' : 'Start'} ${esc(t.title)}" title="${on ? 'Stop' : 'Start'}">${icon(on ? 'stop' : 'play')}</button>`}</li>`;
  }

  FK.register({
    id: 'today', name: 'Today', group: 'Plan', key: 't', icon: FK.icon('today'),
    render() {
      const list = FK.tasks.today(), done = list.filter(t => t.status === 'done').length, open = list.length - done;
      const r = S.running;
      const summary = list.length
        ? `${open ? `${open} task${open > 1 ? 's' : ''} to go` : 'All done for today'}${done ? ` · ${done} done` : ''}`
        : 'A clear day. Add what matters below.';
      const now = r
        ? `<div class="now-live"><span class="eyebrow">Tracking</span>
            <p class="now-label">${esc(FK.label())}</p>
            <p class="big-time num" id="today-run" role="timer"></p>
            <button class="btn-danger btn-block" id="today-stop" data-click="fkStop">${icon('stop')}Stop</button></div>`
        : `<div class="now-idle"><span class="eyebrow">Not tracking</span>
            <p class="muted">Start a task to track your focus time.</p>
            <button class="btn-primary btn-block" id="today-start" data-click="fkStartCurrent" ${open ? '' : 'disabled'}>${icon('play')}Start next task</button></div>`;
      const showEval = evalOpen || new Date().getHours() >= 17 || !!S.days[FK.today()];
      const doneToday = S.tasks.filter(t => !t.parentId && t.status === 'done' && t.doneAt >= FK.daysAgo(0)).length;
      return `<section class="today-hero">
          <div class="grow">
            <p class="eyebrow">${esc(FK.fmtDate(Date.now(), { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
            <h2 class="display">${greeting()}</h2>
            <p class="muted">${esc(summary)}</p>
          </div>
          ${showEval ? '' : `<button class="btn-ghost" id="today-eval" data-click="todayEval">${icon('sparkle')}Evaluate your day</button>`}
        </section>
        ${planCard()}
        <div class="today-grid">
          <section class="card today-tasks" aria-labelledby="today-tasks-h">
            <div class="card-head"><h3 id="today-tasks-h">Today's tasks</h3><span class="badge num">${done}/${list.length}</span></div>
            <form class="quick-add" data-submit="todayAdd">
              <span class="quick-ico" aria-hidden="true">${icon('plus')}</span>
              <input type="text" id="today-add" name="title" data-quickadd placeholder="Add a task for today" aria-label="New task for today" autocomplete="off" required>
              <kbd aria-hidden="true">A</kbd>
            </form>
            ${list.length ? `<ul class="list" aria-label="Today's tasks">${list.map(row).join('')}</ul>`
              : FK.empty({ icon: 'sparkle', title: 'Nothing planned yet', hint: 'Type a task above and press Enter.' })}
          </section>
          <aside class="stack today-side">
            <section class="card focus-card" aria-labelledby="today-focus-h">
              <div class="card-head"><h3 id="today-focus-h">Focus today</h3>
                <label class="goal-set small muted">Goal <input type="number" id="today-goal" class="input-sm num" min="10" max="1440" step="15" value="${Number(S.goalMin)}" data-change="todayGoal" aria-label="Daily focus goal in minutes"> min</label></div>
              ${FK.ring(0, '<b class="num" id="today-total"></b>', { id: 'today-ring', sub: '<span id="today-pct"></span>', size: 176 })}
              <div class="focus-stats">
                <div><b class="num" id="today-done">${doneToday}</b><span class="muted small">task${doneToday === 1 ? '' : 's'} done</span></div>
                <div><b class="num" id="today-sessions"></b><span class="muted small">sessions</span></div>
              </div>
            </section>
            ${showEval ? evalCard() : ''}
            <section class="card now-card${r ? ' live' : ''}" aria-label="Timer">${now}</section>
          </aside>
        </div>`;
    },
    tick(now) {
      const total = document.getElementById('today-total');
      if (!total) return;
      const ms = FK.total(FK.daysAgo(0), now), pct = ms / (S.goalMin * 60000) * 100;
      total.textContent = FK.hm(ms);
      document.getElementById('today-pct').textContent = `${Math.floor(pct)}% of goal`;
      FK.setRing('today-ring', pct, `Focused ${FK.hm(ms)} today, ${Math.floor(pct)}% of goal`);
      document.getElementById('today-sessions').textContent = FK.sessions().filter(s => s.end > FK.daysAgo(0)).length;
      const nowEl = document.getElementById('today-now');
      if (nowEl) { const m = new Date(now).getHours() * 60 + new Date(now).getMinutes(); nowEl.hidden = m < FROM; nowEl.style.left = `${pos(m)}%`; }
      const run = document.getElementById('today-run');
      if (run && S.running) run.textContent = FK.hms(now - S.running.start);
      document.querySelectorAll('[data-spent]').forEach(el => { el.textContent = FK.hm(FK.tasks.spent(el.dataset.spent, now)); });
    },
    actions: {
      todayAdd(form) {
        FK.tasks.add({ title: form.elements.title.value.trim() || 'Task', due: FK.today() });
        setTimeout(() => document.getElementById('today-add')?.focus());
      },
      todayGoal(el) { S.goalMin = Math.max(10, Math.min(1440, Math.round(Number(el.value)) || 240)); },
      todayEval() { evalOpen = true; setTimeout(() => document.getElementById('rate-1')?.focus()); },
      todayRate(el) { const k = FK.today(); S.days[k] = { ...S.days[k], rating: Number(el.dataset.id) }; },
      todayNote(el) {
        const k = FK.today();
        S.days[k] = { ...S.days[k], note: el.value.slice(0, 280) };
        FK.save();
        return false;
      },
      todayDone(el) {
        if (el.checked) FK.tasks.complete(el.dataset.id);
        else FK.tasks.update(el.dataset.id, { status: 'todo' });
      },
    },
  });
})();
