'use strict';
// Habits: daily counters ("Water ×8", "Read ×1") with a progress ring, a 7-day history and streaks.
// S.habits: [{ id, name, color, target, log: { 'YYYY-MM-DD': count } }]. Cards reorder by drag or arrow buttons.
(() => {
  const { S, esc, icon } = FK;
  const target = h => Math.max(1, Math.round(Number(h.target)) || 1);
  const count = (h, k) => Math.max(0, Math.round(Number(h.log?.[k])) || 0);
  const met = (h, k) => count(h, k) >= target(h);
  const find = id => S.habits.find(h => h.id === id);

  function streaks(h) {
    let cur = 0, k = FK.today();
    if (!met(h, k)) k = FK.addDays(k, -1);
    while (met(h, k)) { cur++; k = FK.addDays(k, -1); }
    let best = 0, run = 0, prev = null;
    for (const d of Object.keys(h.log || {}).filter(d => met(h, d)).sort()) {
      run = prev && FK.addDays(prev, 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    return { cur, best };
  }

  // Adds n to today's count. say: always toast the new count (palette), not only on reaching the target.
  function bump(h, n, say = false) {
    if (!h.log || typeof h.log !== 'object') h.log = {};
    const k = FK.today(), was = met(h, k), c = Math.max(0, count(h, k) + n);
    if (c) h.log[k] = c; else delete h.log[k];
    if (!was && met(h, k)) FK.toast(`${h.name}: done for today. ${streaks(h).cur} day streak.`);
    else if (say) FK.toast(`${h.name}: ${c}/${target(h)} today`);
    FK.announce(`${h.name}: ${c} of ${target(h)}`);
  }

  function card(h, i) {
    const id = esc(h.id), t = target(h), c = count(h, FK.today()), done = c >= t, { cur, best } = streaks(h);
    const week = Array.from({ length: 7 }, (_, j) => FK.addDays(FK.today(), j - 6)).map(k => {
      const n = count(h, k), pct = Math.min(100, n / t * 100);
      return `<li class="${n >= t ? 'met' : n ? 'part' : ''}" style="--p:${pct.toFixed(0)}%" title="${esc(`${FK.fmtDate(k)}: ${n}/${t}`)}">
        <i></i><span>${esc(FK.fmtDate(k, { weekday: 'narrow' }))}</span><b class="sr-only">${esc(FK.fmtDate(k, { weekday: 'long' }))}: ${n} of ${t}</b></li>`;
    }).join('');
    return `<li class="card hab${done ? ' done' : ''}" style="--c:${esc(h.color)}" data-drag="${id}" data-drop="habitsMove" data-drop-label="Before ${esc(h.name)}" aria-label="${esc(h.name)}">
      <div class="hab-head">
        <h3 class="grow hab-name">${esc(h.name)}${t > 1 ? ` <span class="faint num">×${t}</span>` : ''}</h3>
        <span class="row tight hab-tools">
          <button class="btn-icon btn-ghost btn-sm" id="hu-${id}" data-click="habitsShift" data-id="${id}" data-dir="-1" aria-label="Move ${esc(h.name)} earlier" ${i ? '' : 'disabled'}>${icon('left')}</button>
          <button class="btn-icon btn-ghost btn-sm" id="hd-${id}" data-click="habitsShift" data-id="${id}" data-dir="1" aria-label="Move ${esc(h.name)} later" ${i < S.habits.length - 1 ? '' : 'disabled'}>${icon('right')}</button>
          <button class="btn-icon btn-ghost btn-sm" id="he-${id}" data-click="habitsEdit" data-id="${id}" aria-label="Edit ${esc(h.name)}">${icon('edit')}</button>
        </span>
      </div>
      <div class="hab-body">
        ${FK.ring(c / t * 100, done ? `${icon('check', 'hab-check')}<b class="num">${c}</b>` : `<b class="num">${c}</b>`,
          { size: 104, stroke: 9, sub: `of ${t}`, aria: `${h.name}: ${c} of ${t} today` })}
        <div class="hab-btns">
          <button class="btn-icon hab-plus" id="hp-${id}" data-click="habitsInc" data-id="${id}" data-n="1" aria-label="Add one to ${esc(h.name)}">${icon('plus')}</button>
          <button class="btn-icon btn-ghost hab-minus" id="hm-${id}" data-click="habitsInc" data-id="${id}" data-n="-1" aria-label="Remove one from ${esc(h.name)}" ${c ? '' : 'disabled'}>−</button>
        </div>
      </div>
      <ul class="hab-week" aria-label="Last 7 days">${week}</ul>
      <p class="hab-streak small"><span class="${cur ? 'hab-fire' : 'muted'}">${icon('sparkle')}<b class="num">${cur}</b> day streak</span><span class="faint">Best ${best}</span></p>
    </li>`;
  }

  function form(h) {
        return `<form class="hab-form" data-submit="habitsSave" data-id="${esc(h.id)}">
      <label>Name<input type="text" name="name" id="hf-name" value="${esc(h.name)}" placeholder="e.g. Water" maxlength="60" required autofocus></label>
      <div class="hab-form-row">
        <label>Daily target<input type="number" name="target" id="hf-target" min="1" max="999" value="${target(h)}" required></label>
        <label>Colour<input type="color" name="color" id="hf-color" value="${esc(h.color)}"></label>
      </div>
      <div class="row"><button type="button" class="btn-danger" id="hf-del" data-click="habitsDel" data-id="${esc(h.id)}">${icon('trash')}Delete</button>
        <span class="grow"></span><button type="button" class="btn-ghost" data-click="fkCloseModal">Cancel</button>
        <button class="btn-primary" id="hf-save">${icon('check')}Save</button></div></form>`;
  }

  FK.register({
    id: 'habits', name: 'Habits', group: 'Track', key: 'i', icon: FK.icon('habits'),
    desc: 'Daily counters with streaks',
    render() {
      const k = FK.today(), doneN = S.habits.filter(h => met(h, k)).length, n = S.habits.length;
      const next = FK.PALETTE[n % FK.PALETTE.length];
      return `<section class="card hab-top">
          <div class="grow"><span class="eyebrow">${esc(FK.fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric' }))}</span>
            <h3 class="hab-sum">${n ? doneN === n ? 'All habits done today' : `${doneN} of ${n} habits done today` : 'Build a habit'}</h3>
            ${n ? `<div class="progress hab-progress" role="progressbar" aria-label="Habits done today" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${doneN}"><span style="width:${(doneN / n * 100).toFixed(1)}%"></span></div>` : ''}</div>
          <form class="row hab-add" data-submit="habitsAdd">
            <input type="color" id="hab-color" name="color" value="${next}" aria-label="Habit colour">
            <input type="text" id="hab-name" name="name" placeholder="New habit, e.g. Water" aria-label="Habit name" maxlength="60" required>
            <label class="hab-x" title="Times per day"><span aria-hidden="true">×</span><input type="number" id="hab-target" name="target" min="1" max="999" value="1" aria-label="Daily target" class="input-sm"></label>
            <button id="hab-add" class="btn-primary">${icon('plus')}Add</button>
          </form>
        </section>
        ${n ? `<ul class="hab-grid" aria-label="Habits">${S.habits.map(card).join('')}</ul>`
          : `<section class="card">${FK.empty({ icon: 'habits', title: 'No habits yet', hint: 'Add one above, like “Water ×8” or “Read ×1”, then tap + each time.' })}</section>`}`;
    },
    actions: {
      habitsAdd(f) {
        const e = f.elements;
        S.habits.push({ id: FK.uid(), name: e.name.value.trim() || 'Habit', color: FK.color(e.color.value),
          target: Math.min(999, Math.max(1, Math.round(Number(e.target.value)) || 1)), log: {} });
        setTimeout(() => document.getElementById('hab-name')?.focus());
      },
      habitsInc(el) { const h = find(el.dataset.id); if (h) bump(h, Number(el.dataset.n)); },
      habitsShift(el) {
        const i = S.habits.findIndex(h => h.id === el.dataset.id), j = i + Number(el.dataset.dir);
        if (i < 0 || j < 0 || j >= S.habits.length) return false;
        [S.habits[i], S.habits[j]] = [S.habits[j], S.habits[i]];
      },
      habitsMove(zone, id) {
        const from = S.habits.findIndex(h => h.id === id), to = S.habits.findIndex(h => h.id === zone.dataset.drag);
        if (from < 0 || to < 0 || from === to) return false;
        S.habits.splice(to, 0, ...S.habits.splice(from, 1));
      },
      habitsEdit(el) { const h = find(el.dataset.id); if (h) FK.modal(`Edit ${h.name}`, form(h)); return false; },
      habitsSave(f) {
        const h = find(f.dataset.id), e = f.elements;
        if (!h) return false;
        Object.assign(h, { name: e.name.value.trim() || h.name, color: FK.color(e.color.value),
          target: Math.min(999, Math.max(1, Math.round(Number(e.target.value)) || 1)) });
        FK.closeModal();
      },
      habitsDel(el) {
        const h = find(el.dataset.id);
        if (!h || !confirm(`Delete habit "${h.name}" and its history?`)) return false;
        S.habits = S.habits.filter(x => x !== h);
        FK.closeModal();
      },
    },
    commands: () => S.habits.map(h => ({ label: `Log habit: ${h.name}`, keywords: 'habit plus count', run: () => bump(h, 1, true) })),
  });
})();
