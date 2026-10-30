'use strict';
// History: worklog per day (newest first, a month per page), session edit/delete, manual entries,
// and a timesheet export (CSV + plain-text summary) for a chosen range.
(() => {
  const { S, esc, icon } = FK;
  let month = 0;                       // offset from the current month
  const open = new Set();              // expanded day keys
  const ts = { range: 'week', from: FK.addDays(FK.today(), -6), to: FK.today() };
  const RANGES = [['week', 'This week'], ['last', 'Last week'], ['month', 'This month'], ['custom', 'Custom']];
  const longDay = k => FK.fmtDate(k, { weekday: 'long', month: 'short', day: 'numeric' });

  // Every session (running one up to now, index -1) cut into per-day pieces inside [from, to).
  function pieces(from, to) {
    const out = [], live = S.running && { ...S.running, end: Date.now() };
    (live ? [...S.sessions, live] : S.sessions).forEach((s, i) => {
      const end = Math.min(s.end, to);
      for (let t = Math.max(s.start, from); t < end;) {
        const n = Math.min(FK.nextDay(t), end);
        out.push({ s, i: s === live ? -1 : i, day: FK.dayKey(t), ms: n - t });
        t = n;
      }
    });
    return out;
  }

  // What a session was spent on: task (with its project), subject, or neither.
  function who(s) {
    const t = FK.tasks.get(s.taskId), sub = FK.subject(s.subjectId);
    return {
      key: s.taskId ? `t:${s.taskId}` : s.subjectId ? `s:${s.subjectId}` : '-',
      title: s.taskId ? t?.title || 'Deleted task' : s.subjectId ? sub?.name || 'Deleted subject' : 'Focus session',
      gone: s.taskId ? !t : s.subjectId ? !sub : false,
      task: t, sub, project: t && (FK.project(t.projectId) || { name: 'Inbox', color: '' }),
    };
  }
  const chips = w => [
    w.task && w.project && `<span class="tag" style="--c:${esc(w.project.color || 'var(--muted)')}">${esc(w.project.name)}</span>`,
    w.task && w.sub && `<span class="tag" style="--c:${esc(w.sub.color)}">${esc(w.sub.name)}</span>`,
  ].filter(Boolean).join('');

  function groups(list) {
    const by = new Map();
    for (const p of list) {
      const w = who(p.s), g = by.get(w.key) || { w, ms: 0 };
      g.ms += p.ms;
      by.set(w.key, g);
    }
    return [...by.values()].sort((a, b) => b.ms - a.ms);
  }

  function stars(k) {
    const d = S.days?.[k], r = Math.round(Number(d?.rating));
    if (!(r >= 1 && r <= 5)) return '';
    return `<span class="hist-rating" role="img" aria-label="Day rated ${r} of 5" title="${esc(d.note || `Rated ${r}/5`)}">${'★'.repeat(r)}<span>${'★'.repeat(5 - r)}</span></span>`;
  }

  function day(k, list) {
    const total = list.reduce((a, p) => a + p.ms, 0), gs = groups(list), isOpen = open.has(k);
    const note = S.days?.[k]?.note;
    const rows = gs.map(({ w, ms }) => `<li${w.gone ? ' class="gone"' : ''}>
        <span class="dot" style="--c:${esc(w.sub?.color || w.project?.color || 'var(--line-2)')}"></span>
        <span class="grow hist-what"><span class="title">${esc(w.title)}</span>${chips(w)}</span>
        <span class="hist-share" aria-hidden="true"><span style="width:${(ms / total * 100).toFixed(1)}%"></span></span>
        <span class="num hist-ms">${FK.hm(ms)}</span></li>`).join('');
    const sess = isOpen ? `<ul class="list divided hist-sessions" id="hs-${k}" aria-label="Sessions on ${esc(longDay(k))}">${
      [...list].sort((a, b) => a.s.start - b.s.start).map(({ s, i, ms }) => {
        const w = who(s), live = i < 0;
        return `<li${live ? ' class="on"' : ''}>
          <span class="num hist-span">${FK.clock(s.start)} – ${live ? 'now' : FK.clock(s.end)}</span>
          <span class="grow hist-what"><span class="title">${esc(w.title)}</span>${chips(w)}</span>
          <span class="num muted">${FK.hm(ms)}</span>
          ${live ? '<span class="tag tag-ok">Running</span>' : `<span class="row tight">
            <button class="btn-icon btn-ghost btn-sm" id="he-${i}-${k}" data-click="histEdit" data-id="${i}" aria-label="Edit session ${FK.clock(s.start)} ${esc(w.title)}">${icon('edit')}</button>
            <button class="btn-icon btn-ghost btn-sm" id="hx-${i}-${k}" data-click="histDel" data-id="${i}" aria-label="Delete session ${FK.clock(s.start)} ${esc(w.title)}">${icon('trash')}</button></span>`}
        </li>`;
      }).join('')}</ul>` : '';
    return `<section class="card hist-day${isOpen ? ' open' : ''}" aria-label="${esc(longDay(k))}">
      <div class="hist-day-head">
        <button class="hist-toggle" id="hd-${k}" data-click="histToggle" data-id="${k}" aria-expanded="${isOpen}"${list.length ? ` aria-controls="hs-${k}"` : ' disabled'}>
          ${icon('right', 'hist-chev')}<span class="hist-date"><b>${esc(FK.fmtDate(k, { weekday: 'long' }))}</b> ${esc(FK.fmtDate(k, { month: 'short', day: 'numeric' }))}</span>
        </button>
        ${stars(k)}<span class="grow"></span>
        ${list.length ? `<span class="muted small">${list.length} session${list.length === 1 ? '' : 's'}</span>` : ''}
        <b class="num hist-total">${FK.hm(total)}</b>
      </div>
      ${note ? `<p class="hist-note muted small">${esc(note)}</p>` : ''}
      ${rows ? `<ul class="list hist-rows">${rows}</ul>` : ''}${sess}
    </section>`;
  }

  // ---------- timesheet ----------
  function tsKeys() {
    const t = FK.today(), mon = FK.addDays(t, -((new Date().getDay() + 6) % 7));
    if (ts.range === 'week') return [mon, t];
    if (ts.range === 'last') return [FK.addDays(mon, -7), FK.addDays(mon, -1)];
    if (ts.range === 'month') return [`${t.slice(0, 8)}01`, t];
    return [ts.from, ts.to].sort();
  }
  // One row per day + task/subject, oldest first.
  function tsRows() {
    const [a, b] = tsKeys(), by = new Map();
    for (const p of pieces(FK.dayStart(a), FK.nextDay(FK.dayStart(b)))) {
      const w = who(p.s), key = `${p.day}|${w.key}|${p.s.subjectId || ''}`;
      const r = by.get(key) || { date: p.day, project: w.task ? w.project.name : '', task: p.s.taskId ? w.title : '',
        subject: w.sub?.name || (p.s.subjectId ? 'Deleted subject' : ''), ms: 0 };
      r.ms += p.ms;
      by.set(key, r);
    }
    return [...by.values()].sort((x, y) => x.date.localeCompare(y.date) || x.project.localeCompare(y.project) || x.task.localeCompare(y.task));
  }
  // Quote every field; a leading = + - @ (or tab/CR) gets a ' so spreadsheets never run it as a formula.
  const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  function csv(rows) {
    const lines = [['Date', 'Project', 'Task', 'Subject', 'Minutes', 'Hours'],
      ...rows.map(r => [r.date, r.project, r.task, r.subject, Math.round(r.ms / 60000), (r.ms / 3600000).toFixed(2)])];
    return lines.map(l => l.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  function summary(rows) {
    const [a, b] = tsKeys(), total = rows.reduce((s, r) => s + r.ms, 0), out = [];
    out.push(`Timesheet ${FK.fmtDate(a, { day: 'numeric', month: 'short', year: 'numeric' })} – ${FK.fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`, `Total: ${FK.hm(total)}`);
    let last = '';
    for (const r of rows) {
      if (r.date !== last) {
        last = r.date;
        out.push('', `${FK.fmtDate(r.date)} · ${FK.hm(rows.filter(x => x.date === r.date).reduce((s, x) => s + x.ms, 0))}`);
      }
      out.push(`  - ${[r.project, r.task, r.subject].filter(Boolean).join(' · ') || 'Focus session'}: ${FK.hm(r.ms)}`);
    }
    return out.join('\n');
  }

  function timesheet() {
    const rows = tsRows(), total = rows.reduce((s, r) => s + r.ms, 0), days = new Set(rows.map(r => r.date)).size;
    const [a, b] = tsKeys();
    return `<section class="card hist-ts" aria-labelledby="ts-h">
      <div class="card-head"><h3 id="ts-h">Timesheet</h3>${icon('download', 'faint')}</div>
      <div class="seg hist-seg" role="group" aria-label="Timesheet range">${RANGES.map(([id, n]) =>
        `<button id="ts-${id}" data-click="histRange" data-id="${id}" aria-pressed="${ts.range === id}">${n}</button>`).join('')}</div>
      ${ts.range === 'custom' ? `<div class="hist-custom">
        <label>From<input type="date" id="ts-from" value="${esc(ts.from)}" max="${FK.today()}" data-change="histTsDate" data-id="from"></label>
        <label>To<input type="date" id="ts-to" value="${esc(ts.to)}" max="${FK.today()}" data-change="histTsDate" data-id="to"></label></div>` : ''}
      <div class="hist-ts-sum">
        <span class="muted small">${esc(FK.fmtDate(a, { month: 'short', day: 'numeric' }))} – ${esc(FK.fmtDate(b, { month: 'short', day: 'numeric' }))}</span>
        <b class="num">${FK.hm(total)}</b>
        <span class="muted small">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} · ${days} day${days === 1 ? '' : 's'}</span>
      </div>
      <div class="stack hist-ts-btns">
        <button class="btn-primary" id="ts-csv" data-click="histCsv" ${rows.length ? '' : 'disabled'}>${icon('download')}Export CSV</button>
        <button id="ts-copy" data-click="histCopy" ${rows.length ? '' : 'disabled'}>${icon('notes')}Copy summary</button>
      </div></section>`;
  }

  // ---------- modals ----------
  const local = t => `${FK.dayKey(t)}T${FK.pad(new Date(t).getHours())}:${FK.pad(new Date(t).getMinutes())}`;
  function entryForm() {
    const ts2 = [...S.tasks].sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.title.localeCompare(b.title));
    const now = new Date(), start = `${FK.pad(Math.max(0, now.getHours() - 1))}:${FK.pad(now.getMinutes())}`;
    FK.modal('Add time entry', `<form class="hist-form" data-submit="histAdd">
      <label>Worked on<select name="what" id="hm-what">
        <option value="">Focus session (no task)</option>
        ${ts2.length ? `<optgroup label="Tasks">${ts2.map(t => `<option value="t:${esc(t.id)}">${esc(t.title)}${t.status === 'done' ? ' (done)' : ''}</option>`).join('')}</optgroup>` : ''}
        ${S.subjects.length ? `<optgroup label="Subjects">${S.subjects.map(s => `<option value="s:${esc(s.id)}">${esc(s.name)}</option>`).join('')}</optgroup>` : ''}
      </select></label>
      <div class="hist-form-row">
        <label>Date<input type="date" name="date" value="${FK.today()}" max="${FK.today()}" required></label>
        <label>Start<input type="time" name="start" value="${start}" required></label>
        <label>Minutes<input type="number" name="min" min="1" max="1440" value="30" required></label>
      </div>
      <div class="row hist-form-foot"><span class="grow"></span><button type="button" class="btn-ghost" data-click="fkCloseModal">Cancel</button>
        <button class="btn-primary" id="hm-save">${icon('plus')}Add entry</button></div></form>`);
  }
  // Parses and checks a [start, end) pair; toasts and returns null when it can't be saved.
  function valid(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return FK.toast('Enter a valid date and time.'), null;
    if (end <= start) return FK.toast('The end must be after the start.'), null;
    if (end > Date.now() + 60000) return FK.toast("That entry ends in the future."), null;
    return [start, end];
  }

  function exportCsv() {
    const [from, to] = tsKeys(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`\ufeff${csv(tsRows())}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `focuskit-timesheet-${from}-to-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  FK.register({
    id: 'history', name: 'History', group: 'Track', key: 'h', icon: FK.icon('history'),
    desc: 'Worklog per day, timesheet CSV export',
    render() {
      const now = new Date(), first = new Date(now.getFullYear(), now.getMonth() + month, 1).getTime();
      const end = Math.min(new Date(now.getFullYear(), now.getMonth() + month + 1, 1).getTime(), FK.nextDay(Date.now()));
      const ps = pieces(first, end), byDay = new Map();
      for (const p of ps) (byDay.get(p.day) || byDay.set(p.day, []).get(p.day)).push(p);
      for (const k of Object.keys(S.days || {})) if (k >= FK.dayKey(first) && k < FK.dayKey(end) && S.days[k]?.rating && !byDay.has(k)) byDay.set(k, []);
      const keys = [...byDay.keys()].sort().reverse(), total = ps.reduce((a, p) => a + p.ms, 0);
      const active = keys.filter(k => byDay.get(k).length).length;
      return `<div class="hist-grid">
        <div class="stack hist-main">
          <section class="card hist-head">
            <div class="grow"><h3>${esc(new Date(first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</h3>
              <p class="muted small"><b class="num">${FK.hm(total)}</b> tracked over ${active} day${active === 1 ? '' : 's'}${active ? ` · ${FK.hm(total / active)} per active day` : ''}</p></div>
            <div class="row tight">
              <button class="btn-icon btn-ghost" id="hist-prev" data-click="histMonth" data-id="-1" aria-label="Previous month">${icon('left')}</button>
              <button class="btn-sm btn-ghost" id="hist-now" data-click="histMonth" data-id="0" ${month ? '' : 'disabled'}>This month</button>
              <button class="btn-icon btn-ghost" id="hist-next" data-click="histMonth" data-id="1" aria-label="Next month" ${month ? '' : 'disabled'}>${icon('right')}</button>
            </div>
            <button class="btn-primary" id="hist-add" data-click="histNew">${icon('plus')}Add time</button>
          </section>
          ${keys.length ? keys.map(k => day(k, byDay.get(k))).join('')
            : `<section class="card">${FK.empty({ icon: 'history', title: 'Nothing tracked this month', hint: 'Start a timer on a task or subject, or add time by hand.' })}</section>`}
        </div>
        <aside class="stack hist-side">${timesheet()}</aside>
      </div>`;
    },
    actions: {
      histMonth(el) { const n = Number(el.dataset.id); month = n ? Math.min(0, month + n) : 0; },
      histToggle(el) { const k = el.dataset.id; open.has(k) ? open.delete(k) : open.add(k); },
      histRange(el) { ts.range = el.dataset.id; },
      histTsDate(el) { if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) ts[el.dataset.id] = el.value; },
      histNew() { entryForm(); return false; },
      histEdit(el) {
        const i = Number(el.dataset.id), s = S.sessions[i];
        if (!s) return;
        FK.modal('Edit session', `<form class="hist-form" data-submit="histSave" data-id="${i}">
          <p class="muted">${esc(who(s).title)} · ${FK.hm(s.end - s.start)}</p>
          <div class="hist-form-row">
            <label>Start<input type="datetime-local" name="start" id="hm-start" value="${local(s.start)}" required></label>
            <label>End<input type="datetime-local" name="end" id="hm-end" value="${local(s.end)}" required></label>
          </div>
          <div class="row hist-form-foot"><span class="grow"></span><button type="button" class="btn-ghost" data-click="fkCloseModal">Cancel</button>
            <button class="btn-primary" id="hm-save">${icon('check')}Save</button></div></form>`);
        return false;
      },
      histSave(form) {
        const s = S.sessions[Number(form.dataset.id)], f = form.elements;
        const v = s && valid(new Date(f.start.value).getTime(), new Date(f.end.value).getTime());
        if (!v) return false;
        [s.start, s.end] = v;
        open.add(FK.dayKey(s.start));
        FK.closeModal();
        FK.toast('Session updated.');
      },
      histDel(el) {
        const i = Number(el.dataset.id), s = S.sessions[i];
        if (!s || !confirm(`Delete this ${FK.hm(s.end - s.start)} session (${FK.clock(s.start)} – ${FK.clock(s.end)}, ${who(s).title})?`)) return false;
        S.sessions.splice(i, 1);
        FK.toast('Session deleted.');
      },
      histAdd(form) {
        const f = form.elements, [kind, id] = f.what.value.split(':'), min = Math.round(Number(f.min.value));
        const start = new Date(`${f.date.value}T${f.start.value}`).getTime();
        if (!(min >= 1 && min <= 1440)) { FK.toast('Minutes must be between 1 and 1440.'); return false; }
        const v = valid(start, start + min * 60000);
        if (!v) return false;
        S.sessions.push({ taskId: kind === 't' ? id : null, subjectId: kind === 's' ? id : FK.tasks.get(id)?.subjectId || null, start: v[0], end: v[1] });
        S.sessions.sort((a, b) => a.start - b.start);
        const now = new Date(), d = new Date(v[0]);
        month = (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
        open.add(FK.dayKey(v[0]));
        FK.closeModal();
        FK.toast(`Added ${FK.hm(min * 60000)}.`);
      },
      histCsv() { exportCsv(); return false; },
      histCopy() {
        const text = summary(tsRows());
        const fallback = () => FK.modal('Timesheet summary', `<textarea class="hist-copy" readonly rows="14" aria-label="Timesheet summary">${esc(text)}</textarea>
          <p class="muted small">Copying is blocked here. Select the text and press ${/Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl'} C.</p>`);
        try { navigator.clipboard.writeText(text).then(() => FK.toast('Timesheet summary copied.'), fallback); } catch { fallback(); }
        return false;
      },
    },
    commands: [
      { label: 'Add time entry', hint: 'History', run() { FK.go('history'); setTimeout(entryForm); } },
      { label: 'Export timesheet (this week)', hint: 'History', run() { ts.range = 'week'; exportCsv(); } },
    ],
  });
})();
