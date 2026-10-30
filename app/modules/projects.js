'use strict';
// Projects: create, rename, recolour and delete projects; per project task counts, tracked time, notes and
// bookmarks (#projects/<id>). Tags are managed here too.
(() => {
  const { S, esc, icon } = FK;
  const focusSoon = id => setTimeout(() => document.getElementById(id)?.focus(), 60);
  const nextColor = list => FK.PALETTE[list.length % FK.PALETTE.length];

  // Only http(s) links are kept; "example.com" becomes "https://example.com/".
  function safeUrl(v) {
    v = String(v || '').trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`;
    try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && u.hostname ? u.href : null; } catch { return null; }
  }

  // Stats for a project id ('' = Inbox): top-level task counts and time on its tasks and their subtasks.
  function stats(pid) {
    const own = S.tasks.filter(t => (t.projectId || '') === pid);
    const ids = new Set(own.flatMap(t => [t.id, ...FK.tasks.descendants(t.id)]));
    const top = own.filter(t => !t.parentId), open = top.filter(t => t.status !== 'done');
    return { open, done: top.length - open.length, spent: FK.total(0, Date.now(), s => ids.has(s.taskId)), est: open.reduce((n, t) => n + t.estimate, 0) };
  }

  function navItem(p, sel) {
    const st = stats(p.id);
    return `<li><a class="pj-item" href="#projects/${esc(p.id || 'inbox')}" style="--c:${esc(p.color)}"${sel ? ' aria-current="true"' : ''}>
      <span class="pj-ico">${p.id ? FK.dot(p.color) : icon('inbox')}</span><span class="grow pj-name">${esc(p.name)}</span>
      <span class="faint small num">${st.spent ? FK.hm(st.spent) : ''}</span><span class="badge num" title="Open tasks">${st.open.length}</span></a></li>`;
  }

  function detail(p) {
    const st = stats(p.id), id = esc(p.id);
    const tile = (label, value) => `<div class="pj-stat"><span class="eyebrow">${label}</span><b class="num">${value}</b></div>`;
    const tasks = st.open.length ? `<ul class="list pj-tasks">${FK.tasks.sort(st.open).slice(0, 8).map(t => `<li>
        <span class="grow title">${esc(t.title)}</span>${t.due ? `<span class="tag${t.due < FK.today() ? ' tag-danger' : ''}">${esc(FK.fmtDate(t.due, { month: 'short', day: 'numeric' }))}</span>` : ''}
        <button class="btn-icon btn-sm btn-ghost" id="pj-o-${esc(t.id)}" data-click="projectsOpenTask" data-id="${esc(t.id)}" aria-label="Open ${esc(t.title)}">${icon('right')}</button></li>`).join('')}</ul>
        ${st.open.length > 8 ? `<p class="faint small">+${st.open.length - 8} more in Tasks</p>` : ''}`
      : `<p class="faint small pj-none">No open tasks. Add one in Tasks with <code>+${esc(p.id ? p.name.replace(/\s+/g, '-') : 'project')}</code>.</p>`;
    const head = p.id
      ? `<input type="color" id="pj-color" value="${esc(p.color)}" data-change="projectsSet" data-field="color" data-id="${id}" aria-label="Project colour" title="Colour">
         <input type="text" id="pj-name" class="pj-title" value="${esc(p.name)}" data-change="projectsSet" data-field="name" data-id="${id}" aria-label="Project name">
         <button class="btn-danger btn-sm" id="pj-delete" data-click="projectsDelete" data-id="${id}">${icon('trash')}Delete</button>`
      : `<span class="pj-inbox">${icon('inbox')}</span><h2 class="grow">Inbox</h2>`;
    const marks = (p.bookmarks || []).map((b, i) => {
      const href = safeUrl(b.url), host = href ? new URL(href).hostname.replace(/^www\./, '') : '';
      return `<li>${icon('flag')}<span class="grow pj-mark">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(b.title || host)}</a>` : esc(b.title)}
          <span class="faint small">${esc(host || b.url)}</span></span>
        <button class="btn-icon btn-sm btn-ghost" id="pj-bd-${i}" data-click="projectsMarkDel" data-id="${id}" data-i="${i}" aria-label="Remove bookmark ${esc(b.title || host)}">${icon('x')}</button></li>`;
    }).join('');
    return `<section class="card pj-detail">
      <div class="pj-head">${head}</div>
      <div class="pj-stats">${tile('Open', st.open.length)}${tile('Done', st.done)}${tile('Tracked', FK.hm(st.spent))}${tile('Estimate left', FK.hm(st.est * 60000))}</div>
      <div class="pj-cols">
        <div class="pj-sec"><h4>Open tasks</h4>${tasks}</div>
        ${p.id ? `<div class="pj-sec"><h4>Bookmarks</h4>
          ${marks ? `<ul class="list pj-marks">${marks}</ul>` : '<p class="faint small pj-none">Links to docs, repos or boards for this project.</p>'}
          <form class="pj-addmark" data-submit="projectsMarkAdd" data-id="${id}">
            <input type="text" id="pj-mt" name="title" placeholder="Title" aria-label="Bookmark title" autocomplete="off">
            <input type="text" id="pj-mu" name="url" placeholder="https://…" aria-label="Bookmark URL" autocomplete="off" required inputmode="url">
            <button class="btn-icon" id="pj-madd" aria-label="Add bookmark">${icon('plus')}</button></form></div>` : ''}
      </div>
      ${p.id ? `<div class="pj-sec"><h4><label for="pj-notes">Notes</label></h4>
        <textarea id="pj-notes" rows="6" placeholder="Goals, context, decisions…" data-input="projectsNotes" data-id="${id}">${esc(p.notes || '')}</textarea></div>`
        : '<p class="muted small">Tasks without a project live here. Drag them onto a project in Tasks, or pick one in their details.</p>'}
    </section>`;
  }

  function tagsCard() {
    const count = id => S.tasks.filter(t => t.tagIds.includes(id)).length;
    const rows = S.tags.map(g => {
      const id = esc(g.id);
      return `<li><input type="color" class="pj-sw" id="tg-c-${id}" value="${esc(g.color)}" data-change="projectsTagSet" data-field="color" data-id="${id}" aria-label="Colour of tag ${esc(g.name)}">
        <span class="faint">#</span><input type="text" id="tg-n-${id}" class="pj-tagname grow" value="${esc(g.name)}" data-change="projectsTagSet" data-field="name" data-id="${id}" aria-label="Name of tag ${esc(g.name)}">
        <span class="faint small num">${count(g.id)} task${count(g.id) === 1 ? '' : 's'}</span>
        <button class="btn-icon btn-sm btn-ghost" id="tg-d-${id}" data-click="projectsTagDel" data-id="${id}" aria-label="Delete tag ${esc(g.name)}">${icon('trash')}</button></li>`;
    }).join('');
    return `<section class="card pj-tagcard" aria-labelledby="pj-tags-h">
      <div class="card-head"><div><h3 id="pj-tags-h">Tags</h3><p class="muted small">Rename, recolour or delete. Deleting a tag removes it from its tasks.</p></div><span class="badge num">${S.tags.length}</span></div>
      ${rows ? `<ul class="list divided pj-tags">${rows}</ul>` : ''}
      <form class="row pj-newrow" data-submit="projectsTagAdd">
        <input type="color" id="pj-newtag-c" name="color" value="${nextColor(S.tags)}" aria-label="New tag colour">
        <input type="text" id="pj-newtag" name="name" class="grow" placeholder="New tag, e.g. deep-work" aria-label="New tag name" autocomplete="off" required>
        <button id="pj-newtag-add">${icon('plus')}Add tag</button></form>
    </section>`;
  }

  FK.register({
    id: 'projects', name: 'Projects', group: 'Plan', key: 'o', icon: FK.icon('projects'),
    desc: 'Notes, bookmarks and tags per project',
    render(arg) {
      const inbox = { id: '', name: 'Inbox', color: 'var(--faint)' };
      const sel = arg === 'inbox' ? inbox : FK.project(arg) || S.projects[0] || inbox;
      return `<div class="pj-layout">
          <aside class="card pj-nav" aria-label="Projects">
            <div class="card-head"><h3>Projects</h3><span class="badge num">${S.projects.length}</span></div>
            <ul class="pj-list">${[inbox, ...S.projects].map(p => navItem(p, p === sel)).join('')}</ul>
            <form class="pj-new" data-submit="projectsAdd">
              <input type="color" id="pj-new-c" name="color" value="${nextColor(S.projects)}" aria-label="New project colour">
              <input type="text" id="pj-new" name="name" placeholder="New project" aria-label="New project name" autocomplete="off" required>
              <button class="btn-icon btn-primary" id="pj-new-add" aria-label="Create project">${icon('plus')}</button></form>
          </aside>
          ${detail(sel)}
        </div>
        ${tagsCard()}`;
    },
    actions: {
      projectsAdd(form) {
        const f = form.elements, name = f.name.value.trim();
        if (!name) return false;
        const p = { id: FK.uid(), name, color: FK.color(f.color.value), notes: '', bookmarks: [] };
        S.projects.push(p);
        FK.go('projects', p.id);
        FK.announce(`Project ${name} created`);
      },
      projectsSet(el) {
        const p = FK.project(el.dataset.id), v = el.value.trim();
        if (!p) return false;
        if (el.dataset.field === 'name') { if (v) p.name = v; } else p.color = FK.color(v, S.projects.indexOf(p));
      },
      projectsNotes(el) {
        const p = FK.project(el.dataset.id);
        if (p) { p.notes = el.value; FK.save(); }
        return false;
      },
      projectsDelete(el) {
        const p = FK.project(el.dataset.id);
        if (!p) return false;
        const n = S.tasks.filter(t => t.projectId === p.id);
        if (!confirm(`Delete project “${p.name}”?${n.length ? ` Its ${n.length} task${n.length > 1 ? 's' : ''} move to Inbox.` : ''}`)) return false;
        n.forEach(t => FK.tasks.update(t.id, { projectId: null }));
        S.projects = S.projects.filter(x => x !== p);
        FK.go('projects');
        FK.toast(`Deleted “${p.name}”.`);
      },
      projectsMarkAdd(form) {
        const p = FK.project(form.dataset.id), f = form.elements, url = safeUrl(f.url.value);
        if (!p) return false;
        if (!url) { FK.toast('Bookmarks must be http:// or https:// links.'); return false; }
        (p.bookmarks ||= []).push({ title: f.title.value.trim() || new URL(url).hostname.replace(/^www\./, ''), url });
        focusSoon('pj-mt');
      },
      projectsMarkDel(el) {
        FK.project(el.dataset.id)?.bookmarks.splice(Number(el.dataset.i), 1);
      },
      projectsOpenTask(el) { FK.tasks.open(el.dataset.id); return false; },
      projectsTagAdd(form) {
        const f = form.elements, name = f.name.value.trim().replace(/^#/, '').replace(/\s+/g, '-');
        if (!name) return false;
        if (S.tags.some(g => g.name.toLowerCase() === name.toLowerCase())) { FK.toast(`#${name} already exists.`); return false; }
        S.tags.push({ id: FK.uid(), name, color: FK.color(f.color.value) });
      },
      projectsTagSet(el) {
        const g = FK.tag(el.dataset.id), v = el.value.trim();
        if (!g) return false;
        if (el.dataset.field === 'color') g.color = FK.color(v, S.tags.indexOf(g));
        else if (v.replace(/^#/, '')) g.name = v.replace(/^#/, '').replace(/\s+/g, '-');
      },
      projectsTagDel(el) {
        const g = FK.tag(el.dataset.id);
        if (!g) return false;
        const n = S.tasks.filter(t => t.tagIds.includes(g.id));
        if (!confirm(`Delete tag #${g.name}?${n.length ? ` It is removed from ${n.length} task${n.length > 1 ? 's' : ''}.` : ''}`)) return false;
        n.forEach(t => FK.tasks.update(t.id, { tagIds: t.tagIds.filter(x => x !== g.id) }));
        S.tags = S.tags.filter(x => x !== g);
      },
    },
    commands: () => [
      { label: 'New project', hint: 'Projects', keywords: 'add create', run() { FK.go('projects'); focusSoon('pj-new'); } },
      { label: 'New tag', hint: 'Projects', keywords: 'add create label', run() { FK.go('projects'); focusSoon('pj-newtag'); } },
      ...S.projects.map(p => ({ label: `Open project: ${p.name}`, hint: 'Projects', run: () => FK.go('projects', p.id) })),
    ],
  });
})();
