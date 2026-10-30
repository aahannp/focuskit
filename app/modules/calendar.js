'use strict';
// Calendar: month heatmap of focus time, D-days on their dates, and a day's sessions on click.
(() => {
  const { S, esc, icon } = FK;
  let month = 0, picked = null;   // month: offset from the current month; picked: day start ms

  function detail(day) {
    const end = FK.nextDay(day);
    const list = FK.sessions().filter(s => FK.overlap(s, day, end) > 0).sort((a, b) => a.start - b.start);
    const by = new Map();
    for (const s of list) {
      const sub = FK.subject(s.subjectId), task = FK.tasks.get(s.taskId), p = FK.project(task?.projectId);
      const key = sub?.name || p?.name || 'Other';
      const cur = by.get(key) || { ms: 0, color: sub?.color || p?.color || '' };
      cur.ms += FK.overlap(s, day, end);
      by.set(key, cur);
    }
    const bars = [...by].sort((a, b) => b[1].ms - a[1].ms);
    const rows = list.map(s => {
      const sub = FK.subject(s.subjectId), task = FK.tasks.get(s.taskId);
      return `<li><span class="num muted">${FK.clock(s.start)} – ${FK.clock(s.end)}</span>
        <span class="grow">${sub ? FK.dot(sub.color) + esc(sub.name) : ''}${task ? ` <span class="${sub ? 'muted' : ''}">${esc(task.title)}</span>` : sub ? '' : 'Untitled session'}</span>
        <span class="num">${FK.hm(FK.overlap(s, day, end))}</span></li>`;
    }).join('');
    return `<section class="card cal-detail" aria-live="polite">
      <div class="card-head"><h3>${esc(FK.fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3>
        <span class="badge num">${FK.hm(FK.total(day, end))}</span></div>
      ${rows ? `${bars.map(([n, v]) => FK.bar(n, v.ms, bars[0][1].ms, v.color)).join('')}<ul class="list">${rows}</ul>`
        : '<p class="muted">Nothing tracked this day.</p>'}</section>`;
  }

  FK.register({
    id: 'calendar', name: 'Calendar', group: 'Track', key: 'c', icon: FK.icon('calendar'),
    render() {
      const now = new Date(), first = new Date(now.getFullYear(), now.getMonth() + month, 1);
      const days = Array.from({ length: new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate() },
        (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1).getTime());
      const totals = days.map(t => FK.total(t, FK.nextDay(t)));
      const max = Math.max(1, ...totals), today = FK.daysAgo(0), sum = totals.reduce((a, b) => a + b, 0);
      const blanks = '<span class="cal-blank"></span>'.repeat((first.getDay() + 6) % 7);   // Monday first
      const cells = days.map((t, i) => {
        const ms = totals[i], key = FK.dayKey(t), ddays = S.ddays.filter(d => d.date === key).map(d => d.name);
        const label = [FK.fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }), ms && FK.hm(ms), ...ddays].filter(Boolean).join(', ');
        return `<button class="day lvl${ms && Math.ceil(ms / max * 4)}${t === today ? ' today' : ''}${t > today ? ' future' : ''}" id="day-${t}"
          data-click="calPick" data-id="${t}" aria-pressed="${t === picked}" aria-label="${esc(label)}">
          <span class="day-n">${i + 1}</span>${ms ? `<span class="day-ms num">${FK.hm(ms)}</span>` : ''}
          ${ddays.map(n => `<span class="day-dd">${icon('flag')}${esc(n)}</span>`).join('')}</button>`;
      }).join('');
      const active = totals.filter(Boolean).length;
      return `<section class="card">
          <div class="cal-head">
            <h3 class="grow">${esc(first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</h3>
            <span class="muted small cal-sum"><b class="num">${FK.hm(sum)}</b> over ${active} day${active === 1 ? '' : 's'}</span>
            <div class="row tight">
              <button class="btn-icon btn-ghost" id="cal-prev" data-click="calMove" data-id="-1" aria-label="Previous month">${icon('left')}</button>
              <button class="btn-sm btn-ghost" id="cal-now" data-click="calMove" data-id="0" ${month ? '' : 'disabled'}>Today</button>
              <button class="btn-icon btn-ghost" id="cal-next" data-click="calMove" data-id="1" aria-label="Next month">${icon('right')}</button>
            </div>
          </div>
          <div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span class="cal-dow" aria-hidden="true">${d}</span>`).join('')}${blanks}${cells}</div>
          <div class="cal-legend" aria-hidden="true"><span class="muted small">Less</span>${[0, 1, 2, 3, 4].map(l => `<i class="lvl${l}"></i>`).join('')}<span class="muted small">More</span></div>
        </section>
        ${picked ? detail(picked) : ''}`;
    },
    actions: {
      calMove(el) { const n = Number(el.dataset.id); month = n ? month + n : 0; },
      calPick(el) { const t = Number(el.dataset.id); picked = picked === t ? null : t; },
    },
  });
})();
