'use strict';
// Notes: one scratchpad, saved as you type.
(() => {
  const { S, esc } = FK;
  const words = s => (s.match(/\S+/g) || []).length;

  FK.register({
    id: 'notes', name: 'Notes', group: 'Other', key: 'n', icon: FK.icon('notes'),
    render() {
      return `<section class="card notes-card">
        <label for="notes" class="sr-only">Notes</label>
        <textarea id="notes" data-input="notesInput" placeholder="Scratchpad. Anything you type is saved on this device." spellcheck="true">${esc(S.notes)}</textarea>
        <p class="muted small notes-foot"><span id="notes-words">${words(S.notes)}</span> words · saved locally</p>
      </section>`;
    },
    actions: {
      notesInput(el) {
        S.notes = el.value;
        FK.save();
        document.getElementById('notes-words').textContent = words(el.value);
        return false;
      },
    },
  });
})();
