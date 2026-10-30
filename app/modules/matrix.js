'use strict';
// Matrix: placeholder until the module is built. Registers so the nav, toggles and shortcuts work.
FK.register({
  id: 'matrix', name: 'Matrix', group: 'Plan', key: 'm', icon: FK.icon('matrix'),
  render: () => FK.empty({ icon: 'matrix', title: 'Matrix is coming soon', hint: 'Sort tasks by urgent and important, Eisenhower style.' }),
});
