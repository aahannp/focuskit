'use strict';
// Tasks: the full list. Quick add with inline syntax, filters, grouping by project, drag to reorder,
// and a detail panel (#tasks/<id>) for notes, tags, estimate, due, repeat and subtasks.
(() => {
  const { S, esc, icon } = FK;
  const FILTERS = [['all', 'All'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['done', 'Done']];
  const REPEATS = [['', 'Never'], ['day', 'Every day'], ['weekday', 'Every weekday'], ['week', 'Every week'], ['month', 'Every month']];
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  let query = '';

  const view = () => S.tasksView;
  const focusSoon = id => setTimeout(() => document.getElementById(id)?.focus(), 60);
  const close = id => { FK.go('tasks'); focusSoon(`tk-x-${id}`); };
  const named = (list, name) => list.find(x => x.name.toLowerCase() === name.toLowerCase() || x.name.replace(/\s+/g, '-').toLowerCase() === name.toLowerCase());

  function tagByName(name) {
    let t = named(S.tags, name);
    if (!t) S.tags.push(t = { id: FK.uid(), name, color: FK.PALETTE[S.tags.length % FK.PALETTE.length] });
    return t;
  }
  function projectByName(name) {
    let p = named(S.projects, name);
    if (!p) S.projects.push(p = { id: FK.uid(), name, color: FK.PALETTE[S.projects.length % FK.PALETTE.length], notes: '', bookmarks: [] });
    return p;
  }

  // "today", "tomorrow", "fri", "2026-11-05" → 'YYYY-MM-DD'
  function parseDue(v) {
    v = v.toLowerCase();
    const k = FK.today();
    if (['today', 'tod'].includes(v)) return k;
    if (['tomorrow', 'tmr', 'tom'].includes(v)) return FK.addDays(k, 1);
    const wd = DAYS.indexOf(v.slice(0, 3));
    if (wd >= 0 && /^[a-z]+$/.test(v)) return FK.addDays(k, (wd - new Date().getDay() + 7) % 7 || 7);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && FK.dayKey(new Date(`${v}T00:00`)) === v ? v : null;
  }
  // "30m", "1h", "1h30m", "1.5h", "45" → minutes
  function parseEst(v) {
    const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m?)?$/i.exec(v);
    return m ? Math.round((Number(m[1]) || 0) * 60 + (Number(m[2]) || 0)) : 0;
  }
  // "Write report #work +Acme !tomorrow ~45m" → task fields. Unknown tags and projects are created.
  function parse(text) {
    const f = { tagIds: [], projectId: null, due: null, estimate: 0 };
    f.title = text.replace(/(^|\s)([#+!~])([^\s#+!~]\S*)/g, (m, sp, k, v) => {
      if (k === '#') { const id = tagByName(v).id; if (!f.tagIds.includes(id)) f.tagIds.push(id); return sp; }
      if (k === '+') { f.projectId = projectByName(v).id; return sp; }
      const d = k === '!' ? parseDue(v) : null, e = k === '~' ? parseEst(v) : 0;
      if (d) f.due = d;
      if (e) f.estimate = e;
      return d || e ? sp : m;
    }).replace(/\s+/g, ' ').trim();
    return f;
  }

  // ---------- pieces ----------
  function dueTag(due, done) {
    const k = FK.today(), short = FK.fmtDate(due, { month: 'short', day: 'numeric' });
    if (due === k) return `<span class="tag" style="--c:var(--accent)">${icon('calendar')}Today</span>`;
    if (due === FK.addDays(k, 1)) return `<span class="tag">${icon('calendar')}Tomorrow</span>`;
    if (due < k && !done) return `<span class="tag tag-danger">${icon('calendar')}Overdue · ${esc(short)}</span>`;
    return `<span class="tag">${icon('calendar')}${esc(short)}</span>`;
  }
  const tagChip = t => `<span class="tag" style="--c:${esc(t.color)}">#${esc(t.name)}</span>`;
  const projChip = p => `<span class="tag" style="--c:${esc(p.color)}">${FK.dot(p.color)}${esc(p.name)}</span>`;

  function timeText(t, now = Date.now()) {
    const spent = FK.tasks.spent(t.id, now), est = t.estimate * 60000;
    return { text: est ? `${FK.hm(spent)} / ${FK.hm(est)}` : spent ? FK.hm(spent) : '', pct: est ? Math.min(100, spent / est * 100) : 0, over: est && spent > est };
  }

  function row(t, { grouped, drag }) {
    const id = esc(t.id), done = t.status === 'done', on = FK.isRunning({ taskId: t.id }), open = FK.route().arg === t.id;
    const p = FK.project(t.projectId), kids = FK.tasks.children(t.id), kd = kids.filter(k => k.status === 'done').length;
    const tm = timeText(t);
    const meta = [
      !grouped && p && projChip(p),
      ...t.tagIds.map(FK.tag).filter(Boolean).map(tagChip),
      t.due && dueTag(t.due, done),
      t.repeat && `<span class="tag" title="Repeats every ${esc(t.repeat.every)}">${icon('repeat')}${esc(t.repeat.every)}</span>`,
      kids.length && `<span class="tag" title="Subtasks done">${icon('check')}${kd}/${kids.length}</span>`,
      t.notes.trim() && `<span class="tag" title="Has notes">${icon('notes')}</span>`,
    ].filter(Boolean).join('');
    return `<li class="tk-row${done ? ' done' : ''}${on ? ' on' : ''}${open ? ' open' : ''}" data-task-id="${id}" data-id="${id}"
        ${drag ? `data-drag="${id}" data-drop="tasksReorder" data-drop-label="Before or after ${esc(t.title)}" aria-label="${esc(t.title)}"` : ''}>
      ${drag ? `<span class="tk-grip" aria-hidden="true">${icon('grip')}</span>` : ''}
      <input type="checkbox" class="check" id="tk-c-${id}" data-change="tasksDone" data-id="${id}" ${done ? 'checked' : ''} aria-label="Done: ${esc(t.title)}">
      <div class="grow tk-main"><span class="task-title" data-click="tasksOpen" data-id="${id}">${esc(t.title)}</span>${meta ? `<span class="task-meta">${meta}</span>` : ''}</div>
      <span class="tk-time${tm.over ? ' over' : ''}" ${tm.text ? '' : 'hidden'} data-tk-time="${id}">
        ${t.estimate ? `<span class="tk-mini" aria-hidden="true"><i style="width:${tm.pct.toFixed(1)}%"></i></span>` : ''}<span class="num">${esc(tm.text)}</span></span>
      ${done ? '' : `<button class="btn-icon btn-sm ${on ? 'btn-primary' : 'btn-ghost'} tk-play" id="tk-p-${id}" data-click="fkToggle" data-task-id="${id}"
        aria-label="${on ? 'Stop' : 'Start'} ${esc(t.title)}" title="${on ? 'Stop' : 'Start'} timer">${icon(on ? 'stop' : 'play')}</button>`}
      <button class="btn-icon btn-sm btn-ghost tk-more" id="tk-x-${id}" data-click="tasksOpen" data-id="${id}" aria-expanded="${open}"
        aria-label="Details for ${esc(t.title)}" title="Details">${icon('right')}</button></li>`;
  }

  function visible() {
    const v = view(), k = FK.today(), q = query.toLowerCase();
    let list = S.tasks.filter(t => !t.parentId);
    if (v.filter === 'today') list = FK.tasks.today();
    else if (v.filter === 'upcoming') list = list.filter(t => t.status !== 'done' && t.due > k).sort((a, b) => a.due.localeCompare(b.due) || a.order - b.order);
    else if (v.filter === 'done') list = list.filter(t => t.status === 'done').sort((a, b) => b.doneAt - a.doneAt);
    else list = FK.tasks.sort(list);
    if (v.tag) list = list.filter(t => t.tagIds.includes(v.tag));
    if (q) list = list.filter(t => `${t.title} ${t.notes}`.toLowerCase().includes(q));
    return list;
  }

  function counts() {
    const top = S.tasks.filter(t => !t.parentId), k = FK.today();
    return {
      all: top.filter(t => t.status !== 'done').length,
      today: FK.tasks.today().filter(t => t.status !== 'done').length,
      upcoming: top.filter(t => t.status !== 'done' && t.due > k).length,
      done: top.filter(t => t.status === 'done').length,
    };
  }

  function listHtml(list) {
    const v = view(), drag = ['all', 'today'].includes(v.filter) && !query;
    if (!list.length) {
      const any = S.tasks.some(t => !t.parentId);
      return `<section class="card">${FK.empty(any
        ? { icon: 'search', title: 'Nothing here', hint: query || v.tag ? 'No task matches this search or tag.' : v.filter === 'done' ? 'Finished tasks show up here.' : v.filter === 'upcoming' ? 'Tasks due after today show up here.' : 'Nothing due today. Enjoy it, or plan something.' }
        : { icon: 'tasks', title: 'No tasks yet', hint: 'Add one above. Try: Plan trip #personal +Travel !fri ~30m' })}</section>`;
    }
    if (v.group !== 'project') {
      return `<section class="card tk-card"><ul class="list tk-list" aria-label="Tasks">${list.map(t => row(t, { drag })).join('')}</ul></section>`;
    }
    const groups = [{ id: '', name: 'Inbox', color: 'var(--faint)' }, ...S.projects]
      .map(p => ({ p, items: list.filter(t => (t.projectId || '') === p.id) })).filter(g => g.items.length);
    return groups.map(({ p, items }) => {
      const open = items.filter(t => t.status !== 'done').length;
      const spent = items.reduce((s, t) => s + FK.tasks.spent(t.id), 0);
      return `<section class="card tk-card" aria-label="${esc(p.name)}">
        <div class="tk-group" ${drag ? `data-drop="tasksToProject" data-project="${esc(p.id)}" data-drop-label="Move to ${esc(p.name)}"` : ''}>
          <span class="tk-group-ico" style="--c:${esc(p.color)}">${p.id ? FK.dot(p.color) : icon('inbox')}</span>
          <h3 class="grow">${esc(p.name)}</h3>
          ${spent ? `<span class="muted small num">${FK.hm(spent)}</span>` : ''}<span class="badge num" title="Open tasks">${open}</span></div>
        <ul class="list tk-list">${items.map(t => row(t, { grouped: true, drag })).join('')}</ul></section>`;
    }).join('');
  }

  function detail(t) {
    if (!t) return '';
    const id = esc(t.id), done = t.status === 'done', on = FK.isRunning({ taskId: t.id }), tm = timeText(t);
    const kids = FK.tasks.children(t.id), parent = FK.tasks.get(t.parentId);
    const opt = (val, label, sel) => `<option value="${esc(val)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
    const sub = k => `<li class="tkd-sub${k.status === 'done' ? ' done' : ''}">
        <input type="checkbox" class="check" id="tkd-sc-${esc(k.id)}" data-change="tasksDone" data-id="${esc(k.id)}" ${k.status === 'done' ? 'checked' : ''} aria-label="Done: ${esc(k.title)}">
        <span class="grow title">${esc(k.title)}</span>
        <button class="btn-icon btn-sm btn-ghost" id="tkd-sd-${esc(k.id)}" data-click="tasksDelete" data-id="${esc(k.id)}" aria-label="Delete subtask ${esc(k.title)}">${icon('trash')}</button></li>`;
    return `<aside class="card tk-detail${on ? ' live' : ''}" aria-label="Task details">
      ${parent ? `<button class="link small tkd-parent" data-click="tasksOpen" data-id="${esc(parent.id)}">${icon('left')}${esc(parent.title)}</button>` : ''}
      <div class="tkd-head">
        <input type="checkbox" class="check" id="tkd-done" data-change="tasksDone" data-id="${id}" ${done ? 'checked' : ''} aria-label="Done">
        <input type="text" id="tkd-title" class="tkd-title" value="${esc(t.title)}" data-change="tasksSet" data-field="title" data-id="${id}" aria-label="Title">
        <button class="btn-icon btn-sm btn-ghost" id="tkd-close" data-click="tasksClose" data-id="${id}" aria-label="Close details">${icon('x')}</button>
      </div>
      <div class="tkd-timer">
        <div class="grow"><span class="eyebrow">Time spent</span><b class="num tkd-spent" data-tk-time="${id}"><span class="num">${esc(FK.hm(FK.tasks.spent(t.id)))}</span></b>
          ${t.estimate ? `<div class="progress${tm.over ? ' over' : ''}"><span style="width:${tm.pct.toFixed(1)}%"></span></div>` : ''}</div>
        ${done ? '' : `<button class="${on ? 'btn-danger' : 'btn-primary'}" id="tkd-run" data-click="fkToggle" data-task-id="${id}">${icon(on ? 'stop' : 'play')}${on ? 'Stop' : 'Start'}</button>`}
      </div>
      <div class="tkd-fields">
        <label class="tkd-field"><span>${icon('projects')}Project</span>
          <select id="tkd-project" data-change="tasksSet" data-field="projectId" data-id="${id}">
            ${opt('', 'Inbox', !t.projectId)}${S.projects.map(p => opt(p.id, p.name, p.id === t.projectId)).join('')}</select></label>
        <label class="tkd-field"><span>${icon('calendar')}Due</span>
          <input type="date" id="tkd-due" value="${esc(t.due || '')}" data-change="tasksSet" data-field="due" data-id="${id}"></label>
        <label class="tkd-field"><span>${icon('clock')}Estimate</span>
          <span class="row tight"><input type="number" id="tkd-est" min="0" step="5" value="${t.estimate || ''}" placeholder="0" data-change="tasksSet" data-field="estimate" data-id="${id}"><span class="muted small">&nbsp;min</span></span></label>
        <label class="tkd-field"><span>${icon('repeat')}Repeat</span>
          <select id="tkd-repeat" data-change="tasksSet" data-field="repeat" data-id="${id}">${REPEATS.map(([v, l]) => opt(v, l, (t.repeat?.every || '') === v)).join('')}</select></label>
      </div>
      <div class="tkd-sec"><h4>Tags</h4>
        <div class="row tkd-tags">${S.tags.map(g => `<button class="chip" style="--c:${esc(g.color)}" id="tkd-t-${esc(g.id)}" data-click="tasksTag" data-id="${id}" data-tag="${esc(g.id)}" aria-pressed="${t.tagIds.includes(g.id)}">#${esc(g.name)}</button>`).join('')}
          <form data-submit="tasksTagAdd" data-id="${id}" class="tkd-inline"><input type="text" id="tkd-newtag" name="name" class="input-sm" placeholder="New tag" aria-label="New tag" autocomplete="off" required></form></div></div>
      <div class="tkd-sec"><h4>Subtasks${kids.length ? ` <span class="num">${kids.filter(k => k.status === 'done').length}/${kids.length}</span>` : ''}</h4>
        ${kids.length ? `<ul class="list tkd-subs">${kids.map(sub).join('')}</ul>` : ''}
        <form data-submit="tasksSubAdd" data-id="${id}" class="tkd-addsub">${icon('plus')}<input type="text" id="tkd-newsub" name="title" placeholder="Add a subtask" aria-label="New subtask" autocomplete="off" required></form></div>
      <div class="tkd-sec"><h4><label for="tkd-notes">Notes</label></h4>
        <textarea id="tkd-notes" rows="5" placeholder="Links, details, next steps…" data-input="tasksNotes" data-id="${id}">${esc(t.notes)}</textarea></div>
      <div class="spread tkd-foot"><span class="faint small">Added ${esc(FK.fmtDate(t.createdAt, { month: 'short', day: 'numeric' }))}${t.doneAt ? ` · done ${esc(FK.fmtDate(t.doneAt, { month: 'short', day: 'numeric' }))}` : ''}</span>
        <button class="btn-danger btn-sm" id="tkd-delete" data-click="tasksDelete" data-id="${id}">${icon('trash')}Delete</button></div>
    </aside>`;
  }

  FK.register({
    id: 'tasks', name: 'Tasks', group: 'Plan', key: 'k', icon: FK.icon('tasks'),
    desc: 'Projects, tags, subtasks, estimates, due dates, repeats',
    state: { tasksView: { filter: 'all', group: 'project', tag: null } },
    render(arg) {
      const v = view(), c = counts(), list = visible(), t = FK.tasks.get(arg);
      if (v.tag && !FK.tag(v.tag)) v.tag = null;
      const tags = S.tags.length ? `<div class="row tk-tags" role="group" aria-label="Filter by tag">
          ${S.tags.map(g => `<button class="chip" style="--c:${esc(g.color)}" id="tk-tag-${esc(g.id)}" data-click="tasksTagFilter" data-id="${esc(g.id)}" aria-pressed="${v.tag === g.id}">#${esc(g.name)}</button>`).join('')}</div>` : '';
      return `<form class="tk-add" data-submit="tasksAdd">
          <span class="tk-add-ico" aria-hidden="true">${icon('plus')}</span>
          <input type="text" id="tk-add" name="title" data-quickadd autocomplete="off" required aria-describedby="tk-syntax"
            placeholder="Add a task" aria-label="New task">
          <kbd aria-hidden="true">A</kbd>
        </form>
        <p class="tk-syntax faint small" id="tk-syntax"><code>#tag</code> <code>+project</code> <code>!today</code> <code>!fri</code> <code>!2026-11-05</code> <code>~30m</code> in the title fill in the fields.</p>
        <div class="tk-bar">
          <div class="seg" role="group" aria-label="Show">${FILTERS.map(([k, l]) => `<button id="tk-f-${k}" data-click="tasksFilter" data-id="${k}" aria-pressed="${v.filter === k}">${l}<span class="tk-count num">${c[k]}</span></button>`).join('')}</div>
          <span class="grow"></span>
          <label class="tk-search">${icon('search')}<input type="search" id="tk-search" value="${esc(query)}" placeholder="Search tasks" aria-label="Search tasks" data-input="tasksSearch" autocomplete="off"></label>
          <div class="seg" role="group" aria-label="Group by">
            <button id="tk-g-project" data-click="tasksGroup" data-id="project" aria-pressed="${v.group === 'project'}" title="Group by project">${icon('projects')}<span class="sr-only">Group by project</span></button>
            <button id="tk-g-flat" data-click="tasksGroup" data-id="flat" aria-pressed="${v.group !== 'project'}" title="Flat list">${icon('tasks')}<span class="sr-only">Flat list</span></button>
          </div>
        </div>
        ${tags}
        <div class="tk-layout${t ? ' has-detail' : ''}">
          <div class="stack tk-lists">${listHtml(list)}</div>
          ${detail(t)}
        </div>`;
    },
    after(main) {
      const s = main.querySelector('#tk-search');
      if (s && document.activeElement === s) s.setSelectionRange(s.value.length, s.value.length);
    },
    tick(now) {
      const r = S.running;
      if (!r?.taskId || !document.querySelector('.view-tasks')) return;
      for (let t = FK.tasks.get(r.taskId); t; t = FK.tasks.get(t.parentId)) {
        const tm = timeText(t, now);
        document.querySelectorAll(`[data-tk-time="${CSS.escape(t.id)}"]`).forEach(el => {
          el.hidden = false;
          el.querySelector('.num').textContent = el.classList.contains('tkd-spent') ? FK.hm(FK.tasks.spent(t.id, now)) : tm.text;
          const bar = el.querySelector('.tk-mini i');
          if (bar) bar.style.width = `${tm.pct.toFixed(1)}%`;
        });
      }
    },
    actions: {
      tasksAdd(form) {
        const v = view(), f = parse(form.elements.title.value);
        if (!f.title) { FK.toast('Give the task a title too.'); return false; }
        if (!f.due && v.filter === 'today') f.due = FK.today();
        if (v.tag && !f.tagIds.includes(v.tag)) f.tagIds.push(v.tag);
        FK.tasks.add(f);
        FK.announce(`Added ${f.title}`);
      },
      tasksDone(el) {
        const t = FK.tasks.get(el.dataset.id);
        if (!t) return;
        if (!el.checked) return void FK.tasks.update(t.id, { status: 'todo' });
        const repeat = t.repeat;
        FK.tasks.complete(t.id);
        if (repeat) {
          const next = S.tasks.at(-1);
          FK.toast(`Done. Next “${next.title}” is due ${FK.fmtDate(next.due, { weekday: 'short', month: 'short', day: 'numeric' })}.`);
        }
      },
      tasksOpen(el) {
        const id = el.dataset.id;
        if (FK.route().arg === id) return close(id);
        FK.go('tasks', id);
        focusSoon('tkd-title');
      },
      tasksClose: el => close(el.dataset.id),
      tasksSet(el) {
        const { id, field } = el.dataset, v = el.value;
        if (field === 'title' && !v.trim()) return;
        const patch = {
          title: () => v.trim(), projectId: () => v || null, due: () => v || null,
          estimate: () => Math.max(0, Math.round(Number(v) || 0)), repeat: () => v ? { every: v } : null,
        }[field];
        if (patch) FK.tasks.update(id, { [field]: patch() });
      },
      tasksNotes(el) {
        FK.tasks.update(el.dataset.id, { notes: el.value });
        return false;
      },
      tasksTag(el) {
        const t = FK.tasks.get(el.dataset.id), tag = el.dataset.tag;
        if (t) FK.tasks.update(t.id, { tagIds: t.tagIds.includes(tag) ? t.tagIds.filter(x => x !== tag) : [...t.tagIds, tag] });
      },
      tasksTagAdd(form) {
        const t = FK.tasks.get(form.dataset.id), name = form.elements.name.value.trim().replace(/^#/, '').replace(/\s+/g, '-');
        if (!t || !name) return false;
        const tag = tagByName(name);
        if (!t.tagIds.includes(tag.id)) FK.tasks.update(t.id, { tagIds: [...t.tagIds, tag.id] });
      },
      tasksSubAdd(form) {
        const p = FK.tasks.get(form.dataset.id), title = form.elements.title.value.trim();
        if (!p || !title) return false;
        FK.tasks.add({ title, parentId: p.id, projectId: p.projectId });
      },
      tasksDelete(el) {
        const t = FK.tasks.get(el.dataset.id);
        if (!t) return false;
        const n = FK.tasks.descendants(t.id).length;
        if (!confirm(`Delete “${t.title}”${n ? ` and its ${n} subtask${n > 1 ? 's' : ''}` : ''}?`)) return false;
        const parent = t.parentId;
        FK.tasks.remove(t.id);
        if (FK.route().arg === t.id) FK.go('tasks', parent || '');
      },
      tasksFilter(el) { view().filter = el.dataset.id; },
      tasksGroup(el) { view().group = el.dataset.id; },
      tasksTagFilter(el) { const v = view(); v.tag = v.tag === el.dataset.id ? null : el.dataset.id; },
      tasksSearch(el) { query = el.value; },
      // Drop a row on another row: it lands before it (or after it, when moving down) and joins its project.
      tasksReorder(zone, payload) {
        const src = FK.tasks.get(payload), dst = FK.tasks.get(zone.dataset.id);
        if (!src || !dst || src === dst) return false;
        const list = S.tasks.filter(t => !t.parentId).sort((a, b) => a.order - b.order);
        const down = list.indexOf(src) < list.indexOf(dst);
        list.splice(list.indexOf(src), 1);
        const i = list.indexOf(dst) + (down ? 1 : 0), prev = list[i - 1], next = list[i];
        // ponytail: midpoint order, so only the moved task is written; renumber if floats ever get too close.
        const order = prev && next ? (prev.order + next.order) / 2 : prev ? prev.order + 1 : next.order - 1;
        const patch = { order };
        if (view().group === 'project' && src.projectId !== dst.projectId) patch.projectId = dst.projectId;
        FK.tasks.update(src.id, patch);
      },
      tasksToProject(zone, payload) {
        const t = FK.tasks.get(payload);
        if (!t) return false;
        FK.tasks.update(t.id, { projectId: zone.dataset.project || null });
      },
    },
    commands: () => [
      { label: 'New task with tags, project, due…', hint: 'Tasks', keywords: 'add create', run() { FK.go('tasks'); focusSoon('tk-add'); } },
      ...FILTERS.map(([k, l]) => ({ label: `Tasks: show ${l}`, hint: 'Tasks', keywords: 'filter list', run() { view().filter = k; FK.go('tasks'); } })),
    ],
  });
})();
