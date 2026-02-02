// settings.js - Settings modal, API key management (localStorage)

const Settings = {
  STORAGE_KEY: 'hn_openai_key',
  ENABLED_KEY: 'hn_summaries_enabled',

  init() {
    this.bindEvents();
    this.updateSummaryVisibility();
  },

  getApiKey() {
    return localStorage.getItem(this.STORAGE_KEY) || '';
  },

  setApiKey(key) {
    if (key) {
      localStorage.setItem(this.STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
    }
    this.updateSummaryVisibility();
  },

  isEnabled() {
    return localStorage.getItem(this.ENABLED_KEY) !== 'false' && !!this.getApiKey();
  },

  setEnabled(val) {
    localStorage.setItem(this.ENABLED_KEY, val ? 'true' : 'false');
    this.updateSummaryVisibility();
  },

  updateSummaryVisibility() {
    const show = this.isEnabled();
    $$('.summarize-btn').forEach(btn => {
      btn.classList.toggle('hidden', !show);
    });
  },

  open() {
    const modal = $('#settings-modal');
    const overlay = $('#settings-overlay');
    const keyInput = $('#settings-api-key');
    const toggle = $('#settings-toggle');

    keyInput.value = this.getApiKey();
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
    const keyInput = $('#settings-api-key');
    const toggle = $('#settings-toggle');
    this.setApiKey(keyInput.value);
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
