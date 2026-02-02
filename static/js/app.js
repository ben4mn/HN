// app.js - Router, state, view transitions, dark mode

const App = {
  state: {
    currentTab: 'top',
    currentPage: 0,
    currentItemId: null,
    feedScrollY: 0,
    loading: false,
    initialized: false,
    view: 'feed' // 'feed' | 'comments'
  },

  init() {
    this.initDarkMode();
    this.bindEvents();
    this.handleRoute();
    window.addEventListener('hashchange', () => this.handleRoute());
  },

  // --- Dark Mode ---
  initDarkMode() {
    const stored = localStorage.getItem('hn_dark');
    if (stored === 'true' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  },

  toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('hn_dark', isDark);
  },

  // --- Routing ---
  handleRoute() {
    const hash = location.hash || '#/top';
    const parts = hash.slice(2).split('/'); // remove '#/'

    if (parts[0] === 'item' && parts[1]) {
      this.showComments(parseInt(parts[1]));
    } else {
      const tab = ['top', 'new', 'best'].includes(parts[0]) ? parts[0] : 'top';
      if (this.state.view === 'comments') {
        this.hideComments();
      }
      if (!this.state.initialized || tab !== this.state.currentTab || this.state.view !== 'feed') {
        this.state.initialized = true;
        this.state.currentTab = tab;
        this.state.currentPage = 0;
        this.updateTabs();
        this.loadFeed();
      }
    }
  },

  updateTabs() {
    $$('.tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === this.state.currentTab;
      btn.classList.toggle('bg-white', isActive);
      btn.classList.toggle('dark:bg-gray-700', isActive);
      btn.classList.toggle('shadow-sm', isActive);
      btn.classList.toggle('text-gray-900', isActive);
      btn.classList.toggle('dark:text-white', isActive);
      btn.classList.toggle('text-gray-500', !isActive);
      btn.classList.toggle('dark:text-gray-400', !isActive);
    });
  },

  // --- Feed ---
  async loadFeed(append = false) {
    if (this.state.loading) return;
    this.state.loading = true;

    if (!append) {
      Stories.renderSkeleton();
    }

    try {
      const result = await HNApi.getStories(this.state.currentTab, this.state.currentPage);
      if (!append) Stories.clear();

      if (result.stories.length === 0 && !append) {
        Stories.renderEmpty();
      } else {
        const startRank = this.state.currentPage * 30 + 1;
        Stories.renderStories(result.stories, startRank);
      }

      Stories.showLoadMore(result.hasMore);
    } catch (err) {
      if (!append) Stories.clear();
      this.showError('Failed to load stories', () => this.loadFeed(append));
    } finally {
      this.state.loading = false;
    }
  },

  async loadMore() {
    this.state.currentPage++;
    await this.loadFeed(true);
  },

  refresh() {
    HNApi.clearCache();
    this.state.currentPage = 0;
    this.loadFeed();
  },

  // --- Comments ---
  showComments(itemId) {
    this.state.currentItemId = itemId;
    this.state.feedScrollY = window.scrollY;
    this.state.view = 'comments';

    const panel = $('#view-comments');
    panel.classList.remove('hidden');
    panel.classList.add('view-enter');
    panel.scrollTop = 0;

    location.hash = `#/item/${itemId}`;
    Comments.load(itemId);
  },

  hideComments() {
    const panel = $('#view-comments');
    panel.classList.remove('view-enter');
    panel.classList.add('view-exit');
    this.state.view = 'feed';

    setTimeout(() => {
      panel.classList.add('hidden');
      panel.classList.remove('view-exit');
      window.scrollTo(0, this.state.feedScrollY);
    }, 200);
  },

  goBack() {
    this.hideComments();
    location.hash = `#/${this.state.currentTab}`;
  },

  // --- Error handling ---
  showError(msg, retryFn) {
    const toast = $('#error-toast');
    $('#error-msg').textContent = msg;
    toast.classList.remove('hidden');

    const retryBtn = $('#btn-retry');
    const handler = () => {
      toast.classList.add('hidden');
      retryBtn.removeEventListener('click', handler);
      if (retryFn) retryFn();
    };
    retryBtn.addEventListener('click', handler);

    setTimeout(() => toast.classList.add('hidden'), 5000);
  },

  // --- Events ---
  bindEvents() {
    // Tab switching
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        location.hash = `#/${btn.dataset.tab}`;
      });
    });

    // Refresh
    $('#btn-refresh').addEventListener('click', () => this.refresh());

    // Dark mode
    $('#btn-darkmode').addEventListener('click', () => this.toggleDarkMode());

    // Load more
    $('#btn-load-more').addEventListener('click', () => this.loadMore());

    // Back button
    $('#btn-back').addEventListener('click', () => this.goBack());

    // Handle browser back
    window.addEventListener('popstate', () => {
      if (this.state.view === 'comments' && !location.hash.startsWith('#/item/')) {
        this.hideComments();
      }
    });
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
