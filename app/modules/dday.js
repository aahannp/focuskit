'use strict';
// D-Day: countdowns to dates (D-12, D-Day, D+3).
(() => {
  const { S, esc, icon } = FK;
  const diff = date => Math.round((FK.dayStart(date) - FK.daysAgo(0)) / 864e5);
  const tag = n => n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : `D+${-n}`;

  FK.register({
    id: 'dday', name: 'D-Day', group: 'Other', key: 'd', icon: FK.icon('dday'),
    render() {
      const list = [...S.ddays].sort((a, b) => (diff(a.date) < 0) - (diff(b.date) < 0) || a.date.localeCompare(b.date));
      const cards = list.map(d => {
        const n = diff(d.date), id = esc(d.id);
        return `<li class="card dday${n < 0 ? ' past' : n === 0 ? ' now' : ''}">
          <span class="dday-n num">${tag(n)}</span>
          <span class="dday-name">${esc(d.name)}</span>
          <span class="muted small">${esc(FK.fmtDate(d.date, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }))}</span>
          <button class="btn-icon btn-ghost btn-sm dday-del" id="del-${id}" data-click="ddayDel" data-id="${id}" aria-label="Delete ${esc(d.name)}">${icon('trash')}</button></li>`;
      }).join('');
      return `<form class="card row add-row" data-submit="ddayAdd">
          <input type="text" id="dday-name" name="name" placeholder="Exam, trip, deadline…" aria-label="Name" class="grow" required>
          <input type="date" id="dday-date" name="date" aria-label="Date" required>
          <button id="dday-add" class="btn-primary">${icon('plus')}Add</button>
        </form>
        ${cards ? `<ul class="dday-grid">${cards}</ul>` : FK.empty({ icon: 'dday', title: 'No countdowns yet', hint: 'Add an exam or a deadline to count down to it.' })}`;
    },
    commands: () => S.ddays.filter(d => diff(d.date) >= 0).map(d => ({ label: `${d.name}: ${tag(diff(d.date))}`, hint: 'D-Day', run: () => FK.go('dday') })),
    actions: {
      ddayAdd(form) {
        const f = form.elements;
        S.ddays.push({ id: FK.uid(), name: f.name.value.trim() || 'D-Day', date: f.date.value });
      },
      ddayDel(el) { S.ddays = S.ddays.filter(d => d.id !== el.dataset.id); },
    },
  });
})();
