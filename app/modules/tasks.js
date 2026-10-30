'use strict';
// Tasks: placeholder until the module is built. Registers so the nav, toggles and shortcuts work.
FK.register({
  id: 'tasks', name: 'Tasks', group: 'Plan', key: 'k', icon: FK.icon('tasks'),
  render: () => FK.empty({ icon: 'tasks', title: 'Tasks is coming soon', hint: 'Projects, tags, subtasks, estimates, due dates and repeats.' }),
});
