'use strict';
// Planner: placeholder until the module is built. Registers so the nav, toggles and shortcuts work.
FK.register({
  id: 'planner', name: 'Planner', group: 'Plan', key: 'p', icon: FK.icon('planner'),
  render: () => FK.empty({ icon: 'planner', title: 'Planner is coming soon', hint: "Drag tasks onto today's hour grid to timebox your day." }),
});
