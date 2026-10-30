'use strict';
// Habits: placeholder until the module is built. Registers so the nav, toggles and shortcuts work.
FK.register({
  id: 'habits', name: 'Habits', group: 'Track', key: 'i', icon: FK.icon('habits'),
  render: () => FK.empty({ icon: 'habits', title: 'Habits is coming soon', hint: 'Daily counters and habits with streaks.' }),
});
