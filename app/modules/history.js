'use strict';
// History: placeholder until the module is built. Registers so the nav, toggles and shortcuts work.
FK.register({
  id: 'history', name: 'History', group: 'Track', key: 'h', icon: FK.icon('history'),
  render: () => FK.empty({ icon: 'history', title: 'History is coming soon', hint: 'A worklog per day, with timesheet CSV export.' }),
});
