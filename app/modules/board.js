'use strict';
// Board: Kanban columns by task status. Drag cards between columns, or use the arrow buttons on each card.
(() => {
  const { S, esc, icon } = FK;
  const COLS = [['todo', 'To do', 'var(--muted)'], ['doing', 'Doing', 'var(--accent)'], ['done', 'Done', 'var(--ok)']];
  const DONE_MAX = 30;

  function card(t, i) {
    const id = esc(t.id), done = t.status === 'done', on = FK.isRunning({ taskId: t.id }), p = FK.project(t.projectId);
    const spent = FK.tasks.spent(t.id), late = !done && t.due && t.due < FK.today();
    const tags = t.tagIds.map(FK.tag).filter(Boolean).map(g => `<span class="tag" style="--c:${esc(g.color)}">#${esc(g.name)}</span>`).join('');
    const move = (dir, to) => to ? `<button class="btn-icon btn-sm btn-ghost" id="bd-${dir}-${id}" data-click="boardMove" data-id="${id}" data-to="${to[0]}"
        aria-label="Move ${esc(t.title)} to ${to[1]}" title="Move to ${to[1]}">${icon(dir === 'l' ? 'left' : 'right')}</button>` : '';
    return `<li class="bd-card${done ? ' done' : ''}${on ? ' on' : ''}" style="--c:${esc(p?.color || 'var(--line-2)')}" data-drag="${id}" data-task-id="${id}" aria-label="${esc(t.title)}">
      <div class="bd-top">
        <button class="bd-title task-title" id="bd-o-${id}" data-click="boardOpen" data-id="${id}" title="Open details">${esc(t.title)}</button>
        ${done ? '' : `<button class="btn-icon btn-sm ${on ? 'btn-primary' : 'btn-ghost'} bd-play" id="bd-p-${id}" data-click="fkToggle" data-task-id="${id}"
          aria-label="${on ? 'Stop' : 'Start'} ${esc(t.title)}">${icon(on ? 'stop' : 'play')}</button>`}
      </div>
      ${p || tags || t.due ? `<div class="task-meta">${p ? `<span class="tag" style="--c:${esc(p.color)}">${esc(p.name)}</span>` : ''}${tags}
        ${t.due ? `<span class="tag${late ? ' tag-danger' : ''}">${icon('calendar')}${esc(FK.fmtDate(t.due, { month: 'short', day: 'numeric' }))}</span>` : ''}</div>` : ''}
      <div class="bd-foot">
        <span class="num faint small">${icon('clock')}<span data-bd-spent="${id}">${FK.hm(spent)}</span>${t.estimate ? ` / ${FK.hm(t.estimate * 60000)}` : ''}</span>
        <span class="row tight bd-move">${move('l', COLS[i - 1])}${move('r', COLS[i + 1])}</span>
      </div></li>`;
  }

  FK.register({
    id: 'board', name: 'Board', group: 'Plan', key: 'b', icon: FK.icon('board'),
    desc: 'Kanban: To do, Doing, Done',
    state: { boardProject: '' },
    render() {
      const f = S.boardProject;
      if (f && f !== 'inbox' && !FK.project(f)) S.boardProject = '';
      const top = S.tasks.filter(t => !t.parentId && (!S.boardProject || (S.boardProject === 'inbox' ? !t.projectId : t.projectId === S.boardProject)));
      const opt = (v, l) => `<option value="${esc(v)}"${S.boardProject === v ? ' selected' : ''}>${esc(l)}</option>`;
      const cols = COLS.map(([st, name, c], i) => {
        let items = top.filter(t => t.status === st);
        items = st === 'done' ? items.sort((a, b) => b.doneAt - a.doneAt) : FK.tasks.sort(items);
        const more = items.length - DONE_MAX;
        if (st === 'done') items = items.slice(0, DONE_MAX);
        return `<section class="bd-col bd-${st}" style="--c:${c}" aria-labelledby="bd-h-${st}" data-drop="boardDrop" data-status="${st}" data-drop-label="${name} column">
          <header class="bd-head"><span class="bd-dot" aria-hidden="true"></span><h3 id="bd-h-${st}">${name}</h3><span class="badge num">${top.filter(t => t.status === st).length}</span></header>
          ${items.length ? `<ul class="bd-cards">${items.map(t => card(t, i)).join('')}</ul>` : `<p class="bd-empty faint small">${st === 'doing' ? 'Drag a card here, or start a timer.' : st === 'done' ? 'Finished cards land here.' : 'Nothing to do. Add a card below.'}</p>`}
          ${more > 0 ? `<p class="faint small center">+${more} older</p>` : ''}
          ${st === 'todo' ? `<form class="bd-add" data-submit="boardAdd">${icon('plus')}<input type="text" id="bd-add" name="title" placeholder="Add a card" aria-label="New card" autocomplete="off" required></form>` : ''}
        </section>`;
      }).join('');
      return `<div class="bd-bar">
          <label class="bd-filter">${icon('projects')}<span class="sr-only">Project</span>
            <select id="bd-project" data-change="boardFilter">${opt('', 'All projects')}${opt('inbox', 'Inbox')}${S.projects.map(p => opt(p.id, p.name)).join('')}</select></label>
          <span class="faint small">Drag cards between columns. Keyboard: focus a card, press <kbd>Space</kbd>, arrows, <kbd>Enter</kbd>.</span>
        </div>
        <div class="bd-cols">${cols}</div>`;
    },
    tick(now) {
      const r = S.running;
      if (!r?.taskId) return;
      for (let t = FK.tasks.get(r.taskId); t; t = FK.tasks.get(t.parentId)) {
        const el = document.querySelector(`[data-bd-spent="${CSS.escape(t.id)}"]`);
        if (el) el.textContent = FK.hm(FK.tasks.spent(t.id, now));
      }
    },
    actions: {
      boardDrop(zone, payload) {
        const t = FK.tasks.get(payload);
        if (!t || t.status === zone.dataset.status) return false;
        FK.tasks.update(t.id, { status: zone.dataset.status });
      },
      boardMove(el) {
        FK.tasks.update(el.dataset.id, { status: el.dataset.to });
        setTimeout(() => document.getElementById(`bd-o-${el.dataset.id}`)?.focus());
      },
      boardOpen(el) { FK.tasks.open(el.dataset.id); return false; },
      boardFilter(el) { S.boardProject = el.value; },
      boardAdd(form) {
        const f = S.boardProject;
        FK.tasks.add({ title: form.elements.title.value.trim() || 'Task', projectId: f && f !== 'inbox' ? f : null });
      },
    },
    commands: () => [
      { label: 'Go to board', hint: 'Board', keywords: 'kanban columns', run: () => FK.go('board') },
      ...S.projects.map(p => ({ label: `Board: show ${p.name}`, hint: 'Board', keywords: 'filter project', run() { S.boardProject = p.id; FK.go('board'); } })),
    ],
  });
})();
