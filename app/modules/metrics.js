'use strict';
// Metrics: placeholder until the module is built. Registers so the nav, toggles and shortcuts work.
FK.register({
  id: 'metrics', name: 'Metrics', group: 'Track', key: 's', icon: FK.icon('metrics'),
  render: () => FK.empty({ icon: 'metrics', title: 'Metrics is coming soon', hint: 'Focus time, tasks done, streaks and day ratings.' }),
});
