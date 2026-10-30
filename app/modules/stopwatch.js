'use strict';
// Stopwatch: start/pause, laps, reset. Independent of the tracked timer; state in S.watch.
(() => {
  const { S, icon } = FK;
  const elapsed = now => S.watch.elapsed + (S.watch.start ? now - S.watch.start : 0);

  FK.register({
    id: 'stopwatch', name: 'Stopwatch', group: 'Focus', key: 'w', icon: FK.icon('stopwatch'),
    render() {
      const w = S.watch;
      const splits = w.laps.map((t, i) => t - (w.laps[i - 1] || 0));
      const best = Math.min(...splits), worst = Math.max(...splits);
      const laps = splits.map((d, i) => `<li${splits.length > 1 && d === best ? ' class="best"' : splits.length > 1 && d === worst ? ' class="worst"' : ''}>
        <span class="grow">Lap ${i + 1}</span><span class="num">${FK.hmst(d)}</span><span class="num muted">${FK.hmst(w.laps[i])}</span></li>`).reverse().join('');
      return `<section class="card watch-card${w.start ? ' live' : ''}">
          <p class="watch-time num" id="watch-time" role="timer"></p>
          <div class="row center">
            <button id="watch-reset" class="btn-lg" data-click="watchReset" ${w.start || w.elapsed ? '' : 'disabled'}>${icon('reset')}Reset</button>
            <button id="watch-go" class="btn-lg btn-primary" data-click="watchGo">${icon(w.start ? 'pause' : 'play')}${w.start ? 'Pause' : w.elapsed ? 'Resume' : 'Start'}</button>
            <button id="watch-lap" class="btn-lg" data-click="watchLap" ${w.start ? '' : 'disabled'}>${icon('flag')}Lap</button>
          </div>
        </section>
        ${laps ? `<section class="card"><div class="card-head"><h3>Laps</h3><span class="badge">${w.laps.length}</span></div>
          <ul class="list laps" aria-label="Laps">${laps}</ul></section>` : ''}`;
    },
    tick(now) {
      const el = document.getElementById('watch-time');
      if (el) el.textContent = FK.hmst(elapsed(now));
    },
    actions: {
      watchGo() {
        const w = S.watch, now = Date.now();
        if (w.start) { w.elapsed += now - w.start; w.start = null; } else w.start = now;
      },
      watchLap() { S.watch.laps.push(elapsed(Date.now())); },
      watchReset() { S.watch = { start: null, elapsed: 0, laps: [] }; },
    },
  });
})();
