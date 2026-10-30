'use strict';
// Planner: timebox a day. Drag tasks onto a 6:00–24:00 grid of 15-minute slots (sets plannedAt and
// plannedMin), drag blocks to move them, +/- to resize, drop back on the list to unplan.
// The "Schedule at…" form does the same from the keyboard.
(() => {
  const { S, esc, icon } = FK;
  const FROM = 6 * 60, TO = 24 * 60, STEP = 15, SLOT = 16;   // minutes of the day; px per 15-min slot
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  let scrolledTo = null;   // the day we last auto-scrolled the grid to "now" for

  const minsOf = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
  const at = (key, mins) => { const d = new Date(FK.dayStart(key)); d.setHours(0, mins); return d.getTime(); };
  const hhmm = m => `${Math.floor(m / 60)}:${FK.pad(m % 60)}`;
  const len = t => t.plannedMin || t.estimate || 30;
  const top = m => (m - FROM) / STEP * SLOT;
  const dayOf = arg => DAY_RE.test(arg) ? arg : FK.today();

  // Planned blocks of a day as { t, s, e } in minutes, with side-by-side columns for overlaps.
  function blocks(key) {
    const list = S.tasks.filter(t => t.plannedAt != null && FK.dayKey(t.plannedAt) === key)
      .map(t => { const s = minsOf(t.plannedAt); return { t, s, e: Math.min(TO, s + len(t)) }; })
      .sort((a, b) => a.s - b.s || b.e - a.e);
    let group = [], ends = [], groupEnd = -1;
    const close = () => { for (const b of group) b.cols = ends.length; group = []; ends = []; };
    for (const b of list) {
      if (b.s >= groupEnd) close();
      let c = ends.findIndex(e => e <= b.s);
      if (c < 0) c = ends.length;
      ends[c] = b.e;
      b.col = c;
      group.push(b);
      groupEnd = Math.max(groupEnd, b.e);
    }
    close();
    return list;
  }
  // Open top-level tasks not planned on this day: those for the day, then ones with no date.
  function unscheduled(key) {
    const isToday = key === FK.today();
    const open = S.tasks.filter(t => !t.parentId && t.status !== 'done' && !(t.plannedAt != null && FK.dayKey(t.plannedAt) === key));
    const forDay = FK.tasks.sort(open.filter(t => isToday ? FK.tasks.isToday(t) : t.due === key));
    const noDate = FK.tasks.sort(open.filter(t => !t.due && !forDay.includes(t))).slice(0, 40);
    return { forDay, noDate };
  }

  function item(t) {
    const p = FK.project(t.projectId);
    return `<li class="pl-item" data-drag="${esc(t.id)}" data-task-id="${esc(t.id)}" aria-label="${esc(t.title)}, ${len(t)} minutes. Space to pick up.">
      <span class="pl-grip" aria-hidden="true">${icon('grip')}</span>
      <span class="grow pl-item-title">${p ? FK.dot(p.color) : ''}${esc(t.title)}</span>
      <span class="badge num">${FK.hm(len(t) * 60000)}</span></li>`;
  }
  function block(b, key) {
    const { t } = b, id = esc(t.id), done = t.status === 'done', on = FK.isRunning({ taskId: t.id });
    const c = FK.project(t.projectId)?.color || 'var(--accent)', h = (b.e - b.s) / STEP * SLOT;
    const range = `${hhmm(b.s)}–${hhmm(b.e)}`;
    return `<div class="pl-block${done ? ' done' : ''}${on ? ' on' : ''}${h < 40 ? ' tiny' : ''}" data-drag="${id}" data-task-id="${id}"
        style="--c:${esc(c)};top:${top(b.s)}px;height:${h}px;left:calc(${b.col} / ${b.cols} * 100%);width:calc(100% / ${b.cols})"
        aria-label="${esc(t.title)}, ${range}. Space to move.">
      <div class="pl-block-text"><b>${esc(t.title)}</b><span class="num">${range} · ${FK.hm((b.e - b.s) * 60000)}</span></div>
      <div class="pl-tools">
        <button class="btn-icon btn-sm" data-click="plannerResize" data-id="${id}" data-by="-15" aria-label="Shorten ${esc(t.title)} by 15 minutes" title="−15m" ${b.e - b.s <= STEP ? 'disabled' : ''}>−</button>
        <button class="btn-icon btn-sm" data-click="plannerResize" data-id="${id}" data-by="15" aria-label="Lengthen ${esc(t.title)} by 15 minutes" title="+15m" ${b.e >= TO ? 'disabled' : ''}>+</button>
        ${done || key !== FK.today() ? '' : `<button class="btn-icon btn-sm" data-click="fkToggle" data-task-id="${id}" aria-label="${on ? 'Stop' : 'Start'} ${esc(t.title)}" title="${on ? 'Stop' : 'Start'}">${icon(on ? 'stop' : 'play')}</button>`}
        <button class="btn-icon btn-sm" data-click="plannerUnplan" data-id="${id}" aria-label="Remove ${esc(t.title)} from the plan" title="Remove">${icon('x')}</button>
      </div></div>`;
  }

  FK.register({
    id: 'planner', name: 'Planner', group: 'Plan', key: 'p', icon: FK.icon('planner'),
    desc: 'Timebox your day on an hour grid',
    render(arg) {
      const key = dayOf(arg), today = FK.today(), isToday = key === today;
      const bl = blocks(key), { forDay, noDate } = unscheduled(key);
      const nowM = isToday ? Math.max(FROM, minsOf(Date.now())) : FROM;
      const avail = Math.max(0, TO - nowM), planned = bl.reduce((n, b) => n + b.e - b.s, 0);
      const plannedLeft = bl.reduce((n, b) => n + Math.max(0, b.e - Math.max(b.s, nowM)), 0);
      const est = forDay.reduce((n, t) => n + len(t), 0);
      const days = Array.from({ length: 7 }, (_, i) => FK.addDays(today, i));
      const choices = [...forDay, ...bl.filter(b => b.t.status !== 'done').map(b => b.t), ...noDate];
      const defTime = isToday ? Math.min(TO - STEP, Math.ceil(minsOf(Date.now()) / STEP) * STEP) : 9 * 60;
      const hours = Array.from({ length: (TO - FROM) / 60 }, (_, i) => FROM + i * 60);
      const label = FK.fmtDate(key, { weekday: 'long', month: 'short', day: 'numeric' });

      return `<div class="pl-head">
          <div class="seg pl-days" role="group" aria-label="Day to plan">${days.map((d, i) => `<button id="pl-day-${i}" data-click="plannerDay" data-id="${d}" aria-pressed="${d === key}">
            ${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : esc(FK.fmtDate(d, { weekday: 'short', day: 'numeric' }))}</button>`).join('')}</div>
          <div class="pl-sum">
            <span><b class="num">${FK.hm(planned * 60000)}</b> <span class="muted">planned</span></span>
            <span class="muted">·</span>
            <span><b class="num">${FK.hm(Math.max(0, avail - plannedLeft) * 60000)}</b> <span class="muted">free${isToday ? ' left today' : ''}</span></span>
            <div class="progress pl-meter" role="img" aria-label="${FK.hm(plannedLeft * 60000)} of ${FK.hm(avail * 60000)} available is planned"><span style="width:${avail ? Math.min(100, plannedLeft / avail * 100).toFixed(1) : 0}%"></span></div>
          </div>
        </div>
        <div class="pl-layout">
          <section class="card pl-side" data-drop="plannerUnplan" data-drop-label="Unscheduled list (remove from plan)" aria-labelledby="pl-side-h">
            <div class="card-head"><div><h3 id="pl-side-h">Unscheduled</h3><p class="muted small">${forDay.length ? `${FK.hm(est * 60000)} estimated` : 'Drag onto the grid'}</p></div><span class="badge num">${forDay.length}</span></div>
            <form class="pl-form" data-submit="plannerSchedule" aria-label="Schedule a task">
              <select id="pl-task" name="task" aria-label="Task to schedule" ${choices.length ? '' : 'disabled'}>
                ${choices.length ? choices.map(t => `<option value="${esc(t.id)}">${esc(t.title)}${t.plannedAt != null && FK.dayKey(t.plannedAt) === key ? ` (${hhmm(minsOf(t.plannedAt))})` : ''}</option>`).join('') : '<option>No open tasks</option>'}
              </select>
              <div class="row pl-form-row">
                <label class="sr-only" for="pl-time">Start time</label>
                <input type="time" id="pl-time" name="time" min="06:00" max="23:45" value="${FK.pad(defTime / 60)}:${FK.pad(defTime % 60)}" required>
                <label class="sr-only" for="pl-min">Minutes</label>
                <input type="number" id="pl-min" name="min" min="15" max="720" step="15" placeholder="min" title="Minutes (blank = estimate or 30)">
                <button class="btn-primary" id="pl-schedule" ${choices.length ? '' : 'disabled'}>${icon('clock')}Schedule at…</button>
              </div>
            </form>
            ${forDay.length ? `<ul class="list pl-list" aria-label="Tasks for ${esc(label)}">${forDay.map(item).join('')}</ul>`
              : FK.empty({ icon: 'sparkle', title: bl.length ? 'Everything is scheduled' : 'Nothing due', hint: isToday ? 'Add tasks on Today, then drag them here.' : 'Tasks due this day show up here.' })}
            ${noDate.length ? `<h4 class="pl-sub">No date</h4><ul class="list pl-list" aria-label="Tasks with no date">${noDate.map(item).join('')}</ul>` : ''}
          </section>
          <section class="card pl-cal" aria-label="Hour grid for ${esc(label)}">
            <div class="pl-grid" style="--slot:${SLOT}px">
              <div class="pl-times" aria-hidden="true">${hours.map(m => `<span style="top:${top(m)}px">${hhmm(m)}</span>`).join('')}</div>
              <div class="pl-lane">
                ${Array.from({ length: (TO - FROM) / STEP }, (_, i) => {
                  const m = FROM + i * STEP;
                  return `<div class="pl-slot${m % 60 === 0 ? ' hour' : ''}${isToday && m + STEP <= minsOf(Date.now()) ? ' past' : ''}" data-drop="plannerDrop" data-at="${m}" data-drop-label="${hhmm(m)}"></div>`;
                }).join('')}
                ${bl.map(b => block(b, key)).join('')}
                ${isToday ? '<div class="pl-now" id="pl-now" aria-hidden="true"><span></span></div>' : ''}
              </div>
            </div>
            ${bl.length ? '' : '<p class="pl-grid-hint muted small">Drag a task onto a time, or use Schedule at…</p>'}
          </section>
        </div>`;
    },
    after(main, arg) {
      // A drop re-renders the dragged node away, so core never sees its dragend; don't leave blocks unclickable.
      document.body.classList.remove('is-dragging');
      const key = dayOf(arg);
      if (scrolledTo === key) return;
      scrolledTo = key;
      const first = blocks(key)[0], m = key === FK.today() ? minsOf(Date.now()) - 60 : first ? first.s - 30 : 8 * 60;
      const lane = main.querySelector('.pl-lane');
      main.scrollTop += lane.getBoundingClientRect().top - main.getBoundingClientRect().top + top(Math.max(FROM, m)) - 90;
    },
    tick(now) {
      const el = document.getElementById('pl-now');
      if (!el) { if (!document.querySelector('.view-planner')) scrolledTo = null; return; }
      const m = minsOf(now) + new Date(now).getSeconds() / 60;
      el.hidden = m < FROM;
      el.style.top = `${top(m)}px`;
    },
    actions: {
      plannerDay(el) { FK.go('planner', el.dataset.id === FK.today() ? '' : el.dataset.id); return false; },
      plannerDrop(zone, id) {
        const t = FK.tasks.get(id);
        if (!t) return false;
        FK.tasks.update(id, { plannedAt: at(dayOf(FK.route().arg), Number(zone.dataset.at)), plannedMin: len(t) });
        FK.announce(`${t.title} planned at ${zone.dataset.dropLabel}`);
      },
      plannerUnplan(el, payload) {
        const id = typeof payload === 'string' ? payload : el.dataset.id, t = FK.tasks.get(id);
        if (!t || t.plannedAt == null) return false;
        FK.tasks.update(id, { plannedAt: null });
        FK.announce(`${t.title} removed from the plan`);
      },
      plannerResize(el) {
        const t = FK.tasks.get(el.dataset.id);
        const room = TO - minsOf(t.plannedAt);
        FK.tasks.update(t.id, { plannedMin: Math.max(STEP, Math.min(room, len(t) + Number(el.dataset.by))) });
      },
      plannerSchedule(form) {
        const f = form.elements, t = FK.tasks.get(f.task.value), [h, m] = f.time.value.split(':').map(Number);
        if (!t || !Number.isFinite(h)) return false;
        const start = Math.max(FROM, Math.min(TO - STEP, h * 60 + m)), min = Math.round(Number(f.min.value) / STEP) * STEP || len(t);
        FK.tasks.update(t.id, { plannedAt: at(dayOf(FK.route().arg), start), plannedMin: Math.min(min, TO - start) });
        FK.toast(`Planned “${t.title}” at ${hhmm(start)}`);
      },
    },
    commands: [{ label: 'Plan today', hint: 'Planner', keywords: 'timebox schedule', run: () => FK.go('planner') }],
  });
})();
