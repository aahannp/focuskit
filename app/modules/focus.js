'use strict';
// Focus: placeholder until the module is built. Registers so the nav, toggles and shortcuts work.
FK.register({
  id: 'focus', name: 'Focus', group: 'Focus', key: 'f', icon: FK.icon('focus'),
  render: () => FK.empty({ icon: 'focus', title: 'Focus is coming soon', hint: 'Full-screen focus on one task with Pomodoro, Flowtime or Countdown.' }),
});
