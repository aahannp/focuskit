'use strict';
// Board: placeholder until the module is built. Registers so the nav, toggles and shortcuts work.
FK.register({
  id: 'board', name: 'Board', group: 'Plan', key: 'b', icon: FK.icon('board'),
  render: () => FK.empty({ icon: 'board', title: 'Board is coming soon', hint: 'Kanban columns for To do, Doing and Done, with drag and drop.' }),
});
