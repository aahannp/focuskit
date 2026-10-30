'use strict';
// Metrics: KPIs, focus per day/hour, breakdowns by project/tag/subject, a year heatmap and day ratings.
// Everything derives from S.sessions (+ tasks for done counts and estimates, S.days for ratings).
(() => {
  const { S, esc, icon } = FK;
  const RANGES = [['today', 'Today', 0], ['7d', '7 days', 6], ['30d', '30 days', 29], ['90d', '90 days', 89], ['all', 'All', null]];
  let range = '7d', shownFrom = 0;   // shownFrom: start of the rendered range, for tick
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // Focus ms per day key, sessions split at midnight.
  function perDay() {
    const m = new Map();
    for (const s of FK.sessions()) {
      for (let t = s.start; t < s.end;) {
        const n = Math.min(FK.nextDay(t), s.end), k = FK.dayKey(t);
        m.set(k, (m.get(k) || 0) + n - t);
        t = n;
      }
    }
    return m;
  }
  // Current streak counts back from today (or yesterday, while today is still open); best is the longest run.
  function streaks(days) {
    let cur = 0, k = FK.today();
    if (!days.has(k)) k = FK.addDays(k, -1);
    while (days.has(k)) { cur++; k = FK.addDays(k, -1); }
    let best = 0, run = 0, prev = null;
    for (const d of [...days].sort()) {
      run = prev && FK.addDays(prev, 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    return { cur, best };
  }
  function bounds(byDay) {
    const r = RANGES.find(x => x[0] === range);
    if (r[2] !== null) return FK.daysAgo(r[2]);
    const first = [...byDay.keys()].sort()[0];
    return first ? FK.dayStart(first) : FK.daysAgo(0);
  }

  // Buckets for the bar chart: hours for Today, days up to ~4 months, else weeks.
  function buckets(from, now, byDay) {
    if (range === 'today') {
      return Array.from({ length: 24 }, (_, h) => {
        const a = from + h * 3600000;   // ponytail: ignores DST days (23/25h); fine for a chart
        return { ms: FK.total(a, a + 3600000), tip: `${FK.pad(h)}:00`, label: h % 6 ? '' : `${FK.pad(h)}:00` };
      });
    }
    const days = [];
    for (let k = FK.dayKey(from); k <= FK.today(); k = FK.addDays(k, 1)) days.push(k);
    if (days.length <= 120) {
      const every = Math.ceil(days.length / 8);
      return days.map((k, i) => ({ ms: byDay.get(k) || 0, tip: FK.fmtDate(k),
        label: (days.length - 1 - i) % every ? '' : FK.fmtDate(k, days.length <= 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }) }));
    }
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const ks = days.slice(i, i + 7);
      weeks.push({ ms: ks.reduce((a, k) => a + (byDay.get(k) || 0), 0), tip: `Week of ${FK.fmtDate(ks[0], { month: 'short', day: 'numeric', year: 'numeric' })}`, label: '' });
    }
    const every = Math.ceil(weeks.length / 8);
    weeks.forEach((w, i) => { if (!((weeks.length - 1 - i) % every)) w.label = FK.fmtDate(days[i * 7], { month: 'short', year: '2-digit' }); });
    return weeks;
  }

  function chart(bs, unit) {
    const goal = unit === 'day' ? S.goalMin * 60000 : 0, peak = Math.max(...bs.map(b => b.ms));
    const step = (unit === 'hour' ? 15 : unit === 'week' ? 300 : 60) * 60000;
    const max = Math.ceil(Math.max(peak, goal, 1) / step) * step;   // round the top of the axis up to a clean value
    const title = unit === 'hour' ? 'Focus by hour' : unit === 'week' ? 'Focus per week' : 'Focus per day';
    return `<section class="card mx-chart-card" aria-labelledby="mx-chart-h">
      <div class="card-head"><h3 id="mx-chart-h">${title}</h3>
        ${goal ? `<span class="muted small mx-goal-key"><i aria-hidden="true"></i>Daily goal ${FK.hm(goal)}</span>` : ''}</div>
      <div class="mx-chart" aria-hidden="true" style="--n:${bs.length}">
        <span class="mx-axis num" style="--g:1">${FK.hm(max)}</span><span class="mx-axis num" style="--g:.5">${FK.hm(max / 2)}</span>
        ${goal ? `<span class="mx-goal" style="--g:${(goal / max).toFixed(4)}"></span>` : ''}
        ${bs.map(b => `<div class="mx-col" data-tip="${esc(`${b.tip} · ${FK.hm(b.ms)}`)}">
          <span class="mx-bar${goal && b.ms >= goal ? ' met' : ''}" style="height:${(b.ms / max * 100).toFixed(2)}%"></span>
          <span class="mx-x">${esc(b.label)}</span></div>`).join('')}
      </div>
      <table class="sr-only"><caption>${title}</caption><thead><tr><th scope="col">${unit === 'hour' ? 'Hour' : unit === 'week' ? 'Week' : 'Day'}</th><th scope="col">Focus</th></tr></thead>
        <tbody>${bs.map(b => `<tr><th scope="row">${esc(b.tip)}</th><td>${FK.hm(b.ms)}</td></tr>`).join('')}</tbody></table>
    </section>`;
  }

  function breakdown(title, rows, hint) {
    rows.sort((a, b) => b.ms - a.ms);
    const top = rows.slice(0, 7), rest = rows.slice(7).reduce((a, r) => a + r.ms, 0);
    if (rest) top.push({ name: `${rows.length - 7} more`, ms: rest, color: 'var(--line-2)' });
    const sum = rows.reduce((a, r) => a + r.ms, 0);
    return `<section class="card mx-break"><div class="card-head"><h3>${title}</h3>${sum ? `<span class="badge num">${FK.hm(sum)}</span>` : ''}</div>
      ${top.length ? top.map(r => FK.bar(r.name, r.ms, top[0].ms, r.color || 'var(--muted)', `${FK.hm(r.ms)}`)).join('')
        : `<p class="muted small mx-none">${hint}</p>`}</section>`;
  }
  function breakdowns(from, to) {
    const proj = new Map(), tags = new Map(), subs = new Map();
    const add = (m, key, name, color, ms) => { const r = m.get(key) || { name, color, ms: 0 }; r.ms += ms; m.set(key, r); };
    for (const s of FK.sessions()) {
      const ms = FK.overlap(s, from, to);
      if (!ms) continue;
      const t = FK.tasks.get(s.taskId), sub = FK.subject(s.subjectId);
      if (s.taskId) {
        const p = t && FK.project(t.projectId);
        add(proj, p?.id || (t ? 'inbox' : 'gone'), p?.name || (t ? 'Inbox' : 'Deleted tasks'), p?.color || '', ms);
        for (const id of t?.tagIds || []) { const g = FK.tag(id); if (g) add(tags, g.id, g.name, g.color, ms); }
      }
      if (s.subjectId) add(subs, s.subjectId, sub?.name || 'Deleted subject', sub?.color || '', ms);
    }
    return `<div class="grid cols-3 mx-breaks">
      ${breakdown('By project', [...proj.values()], 'Track time on tasks to see projects here.')}
      ${breakdown('By tag', [...tags.values()], 'Tag your tasks to see where time goes.')}
      ${breakdown('By subject', [...subs.values()], 'Study subjects you time show up here.')}</div>`;
  }

  // GitHub-style: 53 week columns ending this week, Monday-first rows.
  function heatmap(byDay) {
    const today = FK.today(), end = FK.addDays(today, 6 - (new Date().getDay() + 6) % 7);
    const start = FK.addDays(end, -53 * 7 + 1), cells = [], months = [];
    let max = 1, sum = 0, active = 0;
    for (let k = start; k <= end; k = FK.addDays(k, 1)) {
      const ms = k <= today ? byDay.get(k) || 0 : -1;
      if (ms > 0) { max = Math.max(max, ms); sum += ms; active++; }
      cells.push([k, ms]);
    }
    cells.forEach(([k], i) => { if (i % 7 === 0 && k.slice(8) <= '07') months.push([i / 7, FK.fmtDate(k, { month: 'short' })]); });
    const lvl = ms => ms < 0 ? 'fut' : ms ? `lvl${Math.min(4, Math.ceil(ms / max * 4))}` : 'lvl0';
    return `<section class="card mx-heat-card" aria-labelledby="mx-heat-h">
      <div class="card-head"><h3 id="mx-heat-h">Last 12 months</h3><span class="muted small">${plural(active, 'active day')} · ${FK.hm(sum)}</span></div>
      <div class="mx-heat-scroll"><div class="mx-heat-wrap" role="img" aria-label="Focus heatmap: ${plural(active, 'active day')} and ${FK.hm(sum)} in the last year">
        <div class="mx-months" aria-hidden="true">${months.map(([c, n]) => `<span style="grid-column:${c + 1}">${esc(n)}</span>`).join('')}</div>
        <div class="mx-dows" aria-hidden="true"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div>
        <div class="mx-heat" aria-hidden="true">${cells.map(([k, ms]) => `<i class="${lvl(ms)}"${ms >= 0 ? ` data-tip="${esc(`${FK.fmtDate(k, { month: 'short', day: 'numeric', year: 'numeric' })} · ${ms ? FK.hm(ms) : 'no focus'}`)}"` : ''}></i>`).join('')}</div>
      </div></div>
      <div class="cal-legend mx-legend" aria-hidden="true"><span class="muted small">Less</span>${[0, 1, 2, 3, 4].map(l => `<i class="lvl${l}"></i>`).join('')}<span class="muted small">More</span></div>
    </section>`;
  }

  // Day ratings as dots joined by a line, y = 1..5.
  function ratings(from) {
    const start = range === 'today' ? FK.daysAgo(6) : from, keys = [];
    for (let k = FK.dayKey(start); k <= FK.today(); k = FK.addDays(k, 1)) keys.push(k);
    const pts = keys.map((k, i) => [i, Math.round(Number(S.days?.[k]?.rating))]).filter(([, r]) => r >= 1 && r <= 5);
    const W = 600, H = 120, P = 10, x = i => P + (keys.length < 2 ? (W - 2 * P) / 2 : i / (keys.length - 1) * (W - 2 * P)), y = r => H - P - (r - 1) / 4 * (H - 2 * P);
    const avg = pts.length ? pts.reduce((a, p) => a + p[1], 0) / pts.length : 0;
    return `<section class="card mx-rate-card" aria-labelledby="mx-rate-h">
      <div class="card-head"><h3 id="mx-rate-h">Day ratings</h3>${pts.length ? `<span class="muted small"><b class="mx-avg num">★ ${avg.toFixed(1)}</b> average · ${plural(pts.length, 'rated day')}</span>` : ''}</div>
      ${pts.length ? `<div class="mx-rate"><div class="mx-rate-y" aria-hidden="true"><span>5</span><span>3</span><span>1</span></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Average rating ${avg.toFixed(1)} of 5 over ${plural(pts.length, 'rated day')}">
          ${[1, 3, 5].map(r => `<line class="mx-grid" x1="0" x2="${W}" y1="${y(r)}" y2="${y(r)}"/>`).join('')}
          <polyline class="mx-line" points="${pts.map(([i, r]) => `${x(i)},${y(r)}`).join(' ')}"/>
        </svg>
        <div class="mx-dots" aria-hidden="true">${pts.map(([i, r]) => `<i style="left:${(x(i) / W * 100).toFixed(2)}%;top:${(y(r) / H * 100).toFixed(2)}%" data-tip="${esc(`${FK.fmtDate(keys[i])} · ${r}/5`)}"></i>`).join('')}</div></div>`
        : '<p class="muted small mx-none">No rated days in this range. Rate your day to see the trend.</p>'}
    </section>`;
  }

  FK.register({
    id: 'metrics', name: 'Metrics', group: 'Track', key: 's', icon: FK.icon('metrics'),
    desc: 'Focus time, tasks done, streaks, heatmap',
    after() { const h = document.querySelector('.mx-heat-scroll'); if (h) h.scrollLeft = h.scrollWidth; },
    render() {
      const now = Date.now(), byDay = perDay(), from = shownFrom = bounds(byDay);
      const focus = FK.total(from, now), nDays = Math.max(1, Math.round((FK.daysAgo(0) - from) / 864e5) + 1);
      const done = S.tasks.filter(t => t.status === 'done' && t.doneAt >= from);
      const est = done.filter(t => t.estimate > 0), estMs = est.reduce((a, t) => a + t.estimate * 60000, 0);
      const acc = estMs ? Math.round(est.reduce((a, t) => a + FK.tasks.spent(t.id, now), 0) / estMs * 100) : null;
      const { cur, best } = streaks(new Set([...byDay].filter(([, ms]) => ms > 0).map(([k]) => k)));
      const kpi = (id, label, value, sub, ic) => `<section class="card mx-kpi"><span class="mx-kpi-ico" aria-hidden="true">${icon(ic)}</span>
        <span class="eyebrow">${label}</span><b class="num" id="${id}">${value}</b><span class="muted small">${sub}</span></section>`;
      const unit = range === 'today' ? 'hour' : nDays > 120 ? 'week' : 'day';
      return `<div class="spread mx-top">
          <div class="seg" role="group" aria-label="Range">${RANGES.map(([id, n]) =>
            `<button id="mx-${id}" data-click="metricsRange" data-id="${id}" aria-pressed="${range === id}">${n}</button>`).join('')}</div>
          <span class="muted small">${esc(range === 'today' ? FK.fmtDate(from, { weekday: 'long', month: 'long', day: 'numeric' })
            : `${FK.fmtDate(from, { month: 'short', day: 'numeric', year: 'numeric' })} – today`)}</span>
        </div>
        <div class="mx-kpis">
          ${kpi('mx-focus', 'Focus time', FK.hm(focus), range === 'today' ? `${Math.round(focus / (S.goalMin * 600))}% of daily goal` : plural(nDays, 'day'), 'clock')}
          ${kpi('mx-done', 'Tasks done', done.length, est.length ? `${est.length} with estimates` : 'completed in range', 'check')}
          ${kpi('mx-avg', 'Avg per day', FK.hm(focus / nDays), `${[...byDay].filter(([k, ms]) => ms && FK.dayStart(k) >= from).length} active`, 'target')}
          ${kpi('mx-streak', 'Current streak', plural(cur, 'day'), `Best ${plural(best, 'day')}`, 'sparkle')}
          ${kpi('mx-acc', 'Estimates', acc === null ? '—' : `${acc}%`, acc === null ? 'No estimated tasks done' : acc > 110 ? 'Took longer than estimated' : acc < 90 ? 'Faster than estimated' : 'Right on estimate', 'flag')}
        </div>
        ${chart(buckets(from, now, byDay), unit)}
        ${breakdowns(from, now)}
        <div class="mx-bottom">${heatmap(byDay)}${ratings(from)}</div>`;
    },
    tick(now) {
      const el = document.getElementById('mx-focus');
      if (el && S.running) el.textContent = FK.hm(FK.total(shownFrom, now));
    },
    actions: { metricsRange(el) { range = el.dataset.id; } },
  });
})();
