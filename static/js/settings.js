// settings.js - Settings modal, summary toggle (localStorage)

const Settings = {
  ENABLED_KEY: 'hn_summaries_enabled',

  init() {
    this.bindEvents();
  },

  isEnabled() {
    return localStorage.getItem(this.ENABLED_KEY) !== 'false';
  },

  setEnabled(val) {
    localStorage.setItem(this.ENABLED_KEY, val ? 'true' : 'false');
  },

  open() {
    const modal = $('#settings-modal');
    const overlay = $('#settings-overlay');
    const toggle = $('#settings-toggle');

    toggle.checked = localStorage.getItem(this.ENABLED_KEY) !== 'false';

    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      overlay.classList.add('active');
      modal.classList.add('active');
    });
  },

  close() {
    const modal = $('#settings-modal');
    const overlay = $('#settings-overlay');

    overlay.classList.remove('active');
    modal.classList.remove('active');

    setTimeout(() => {
      overlay.classList.add('hidden');
      modal.classList.add('hidden');
    }, 200);
  },

  save() {
    const toggle = $('#settings-toggle');
    this.setEnabled(toggle.checked);
    this.close();
  },

  bindEvents() {
    $('#btn-settings').addEventListener('click', () => this.open());
    $('#settings-overlay').addEventListener('click', () => this.close());
    $('#settings-close').addEventListener('click', () => this.close());
    $('#settings-save').addEventListener('click', () => this.save());
  }
};
