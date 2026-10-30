'use strict';
// Study: YPT-style subject timers. Each subject has a play button; time comes from S.sessions.
(() => {
  const { S, esc, icon } = FK;

  // Sum of the gaps between today's sessions (YPT "rest time").
  function restToday() {
    const from = FK.daysAgo(0);
    let rest = 0, end = null;
    for (const s of FK.sessions().filter(s => s.end > from).sort((a, b) => a.start - b.start)) {
      if (end !== null) rest += Math.max(0, s.start - end);
      end = Math.max(end ?? from, s.end);
    }
    return rest;
  }

  FK.register({
    id: 'study', name: 'Study', group: 'Focus', key: 'y', icon: FK.icon('study'),
    render() {
      const rows = S.subjects.map(s => {
        const on = FK.isRunning({ subjectId: s.id }), id = esc(s.id);
        return `<li class="subject${on ? ' on' : ''}" style="--c:${esc(s.color)}">
          <button class="subject-play" id="run-${id}" data-click="fkToggle" data-subject-id="${id}" aria-label="${on ? 'Stop' : 'Start'} ${esc(s.name)}">${icon(on ? 'pause' : 'play')}</button>
          <span class="grow subject-name">${esc(s.name)}</span>
          <span class="num subject-time" data-sub="${id}"></span>
          <button class="btn-icon btn-ghost btn-sm" id="del-${id}" data-click="studyDel" data-id="${id}" aria-label="Delete ${esc(s.name)}">${icon('trash')}</button></li>`;
      }).join('');
      const next = FK.PALETTE[S.subjects.length % FK.PALETTE.length];
      return `<section class="card study-hero${S.running ? ' live' : ''}">
          <span class="eyebrow">Studied today</span>
          <p class="study-total num" id="study-total" role="timer"></p>
          <div class="study-stats">
            <div><span class="muted small">Rest today</span><b class="num" id="study-rest"></b></div>
            <div><span class="muted small">Now</span><b id="study-now">${S.running ? esc(FK.label()) : 'Resting'}</b></div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h3>Subjects</h3><span class="badge">${S.subjects.length}</span></div>
          ${rows ? `<ul class="list subjects">${rows}</ul>` : FK.empty({ icon: 'study', title: 'No subjects yet', hint: 'Add a subject, then press play to start timing it.' })}
          <form class="row add-row" data-submit="studyAdd">
            <input type="color" id="sub-color" name="color" value="${next}" aria-label="Subject colour" class="color-dot">
            <input type="text" id="sub-name" name="name" placeholder="New subject, e.g. Maths" aria-label="Subject name" class="grow" required>
            <button id="sub-add" class="btn-primary">${icon('plus')}Add</button>
          </form>
        </section>`;
    },
    tick(now) {
      const total = document.getElementById('study-total');
      if (!total) return;
      const today = FK.daysAgo(0);
      total.textContent = FK.hms(FK.total(today, now));
      document.getElementById('study-rest').textContent = FK.hm(restToday());
      document.querySelectorAll('[data-sub]').forEach(el => {
        el.textContent = FK.hms(FK.total(today, now, s => s.subjectId === el.dataset.sub));
      });
    },
    actions: {
      studyDel(el) {
        const s = FK.subject(el.dataset.id);
        if (!confirm(`Delete subject "${s.name}"? Its past time stays in your stats.`)) return false;
        if (S.running?.subjectId === s.id) FK.stop();
        S.subjects = S.subjects.filter(x => x !== s);
      },
      studyAdd(form) {
        const f = form.elements;
        S.subjects.push({ id: FK.uid(), name: f.name.value.trim() || 'Subject', color: FK.color(f.color.value) });
      },
    },
  });
})();
