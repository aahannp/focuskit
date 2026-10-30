'use strict';
// Projects: placeholder until the module is built. Registers so the nav, toggles and shortcuts work.
FK.register({
  id: 'projects', name: 'Projects', group: 'Plan', key: 'o', icon: FK.icon('projects'),
  render: () => FK.empty({ icon: 'projects', title: 'Projects is coming soon', hint: 'Notes and bookmarks for each project.' }),
});
