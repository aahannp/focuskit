'use strict';
// Today: greeting, today's focus time, today's tasks with quick add, and the running timer.
(() => {
  const { S, esc, icon } = FK;

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
      return `<section class="today-hero">
          <p class="eyebrow">${esc(FK.fmtDate(Date.now(), { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
          <h2 class="display">${greeting()}</h2>
          <p class="muted">${esc(summary)}</p>
        </section>
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
              <div class="card-head"><h3 id="today-focus-h">Focus today</h3><span class="muted small">Goal ${FK.hm(S.goalMin * 60000)}</span></div>
              ${FK.ring(0, '<b class="num" id="today-total"></b>', { id: 'today-ring', sub: '<span id="today-pct"></span>', size: 176 })}
            </section>
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
      const run = document.getElementById('today-run');
      if (run && S.running) run.textContent = FK.hms(now - S.running.start);
      document.querySelectorAll('[data-spent]').forEach(el => { el.textContent = FK.hm(FK.tasks.spent(el.dataset.spent, now)); });
    },
    actions: {
      todayAdd(form) {
        FK.tasks.add({ title: form.elements.title.value.trim() || 'Task', due: FK.today() });
        setTimeout(() => document.getElementById('today-add')?.focus());
      },
      todayDone(el) {
        if (el.checked) FK.tasks.complete(el.dataset.id);
        else FK.tasks.update(el.dataset.id, { status: 'todo' });
      },
    },
  });
})();
