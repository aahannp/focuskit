'use strict';
// Matrix: Eisenhower 2x2 on the task's quadrant field (1 do first, 2 schedule, 3 delegate, 4 eliminate),
// plus an Unsorted tray. Drag cards between zones; keyboard users press Space on a card, then arrows + Enter.
(() => {
  const { S, esc, icon } = FK;
  const QUADS = [
    [1, 'Do first', 'Urgent and important', 'var(--danger)'],
    [2, 'Schedule', 'Important, not urgent', 'var(--accent)'],
    [3, 'Delegate', 'Urgent, not important', 'var(--warn)'],
    [4, 'Eliminate', 'Neither', 'var(--faint)'],
  ];

  function card(t) {
    const id = esc(t.id), p = FK.project(t.projectId), late = t.due && t.due < FK.today();
    return `<li class="em-card" data-drag="${id}" data-task-id="${id}" aria-label="${esc(t.title)}">
      <input type="checkbox" class="check" id="em-c-${id}" data-change="matrixDone" data-id="${id}" aria-label="Done: ${esc(t.title)}">
      <span class="grow em-title">${p ? FK.dot(p.color) : ''}${esc(t.title)}</span>
      ${t.due ? `<span class="tag${late ? ' tag-danger' : ''}">${esc(FK.fmtDate(t.due, { month: 'short', day: 'numeric' }))}</span>` : ''}</li>`;
  }

  function zone(q, title, sub, c, items) {
    return `<section class="em-zone ${q ? `em-q${q}` : 'em-tray'}" style="--c:${c}" aria-labelledby="em-h-${q}" data-drop="matrixDrop" data-q="${q}" data-drop-label="${esc(title)}">
      <header class="em-head"><span class="em-num" aria-hidden="true">${q || icon('inbox')}</span>
        <div class="grow"><h3 id="em-h-${q}">${esc(title)}</h3><p class="faint small">${esc(sub)}</p></div>
        <span class="badge num">${items.length}</span></header>
      ${items.length ? `<ul class="em-cards">${items.map(card).join('')}</ul>` : `<p class="em-empty faint small">Drop tasks here</p>`}</section>`;
  }

  FK.register({
    id: 'matrix', name: 'Matrix', group: 'Plan', key: 'm', icon: FK.icon('matrix'),
    desc: 'Eisenhower priority matrix',
    render() {
      const open = FK.tasks.sort(S.tasks.filter(t => !t.parentId && t.status !== 'done'));
      if (!open.length) return `<section class="card">${FK.empty({ icon: 'matrix', title: 'No open tasks', hint: 'Add tasks first, then sort them here by urgency and importance.' })}</section>`;
      const tray = open.filter(t => !t.quadrant);
      return `<div class="em-wrap">
          ${zone(0, 'Unsorted', 'Drag each task into a box', 'var(--muted)', tray)}
          <div class="em-grid-wrap">
            <div class="em-axis em-axis-x" aria-hidden="true"><span>Urgent</span><span>Not urgent</span></div>
            <div class="em-axis em-axis-y" aria-hidden="true"><span>Important</span><span>Not important</span></div>
            <div class="em-grid">${QUADS.map(([q, ti, sub, c]) => zone(q, ti, sub, c, open.filter(t => t.quadrant === q))).join('')}</div>
          </div>
        </div>
        <p class="faint small center">Keyboard: focus a task, press <kbd>Space</kbd>, pick a box with the arrows, then <kbd>Enter</kbd>. Done tasks are hidden.</p>`;
    },
    actions: {
      matrixDrop(zone, payload) {
        const t = FK.tasks.get(payload), q = Number(zone.dataset.q) || null;
        if (!t || t.quadrant === q) return false;
        FK.tasks.update(t.id, { quadrant: q });
      },
      matrixDone(el) { FK.tasks.complete(el.dataset.id); },
    },
    commands: [{ label: 'Go to matrix', hint: 'Matrix', keywords: 'eisenhower priority urgent important', run: () => FK.go('matrix') }],
  });
})();
