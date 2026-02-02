// app.js - Router, state, view transitions, dark mode

const App = {
  state: {
    currentTab: 'top',
    currentPage: 0,
    currentItemId: null,
    feedScrollY: 0,
    readerScrollY: 0,
    loading: false,
    initialized: false,
    view: 'feed' // 'feed' | 'comments' | 'reader'
  },

  init() {
    this.initDarkMode();
    Thumbnails.init();
    Settings.init();
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

    if (parts[0] === 'read' && parts[1]) {
      this.showReader(parseInt(parts[1]));
    } else if (parts[0] === 'item' && parts[1]) {
      this.showComments(parseInt(parts[1]));
    } else {
      const tab = ['top', 'new', 'best'].includes(parts[0]) ? parts[0] : 'top';
      if (this.state.view === 'comments') {
        this.hideComments();
      }
      if (this.state.view === 'reader') {
        this.hideReader();
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

  // --- Reader ---
  showReader(storyId) {
    this.state.currentItemId = storyId;
    if (this.state.view === 'feed') {
      this.state.feedScrollY = window.scrollY;
    }
    // Hide comments if showing (e.g. navigating from comments → reader)
    if (this.state.view === 'comments') {
      const commentsPanel = $('#view-comments');
      commentsPanel.classList.add('hidden');
      commentsPanel.classList.remove('view-enter', 'view-exit');
    }
    this.state.view = 'reader';

    const panel = $('#view-reader');
    panel.classList.remove('hidden');
    panel.classList.add('view-enter');
    panel.scrollTop = 0;

    location.hash = `#/read/${storyId}`;
    Reader.load(storyId);
  },

  hideReader() {
    const panel = $('#view-reader');
    panel.classList.remove('view-enter');
    panel.classList.add('view-exit');
    this.state.view = 'feed';

    setTimeout(() => {
      panel.classList.add('hidden');
      panel.classList.remove('view-exit');
      window.scrollTo(0, this.state.feedScrollY);
    }, 200);
  },

  // --- Comments ---
  showComments(itemId) {
    this.state.currentItemId = itemId;
    if (this.state.view === 'feed') {
      this.state.feedScrollY = window.scrollY;
    }
    this.state.view = 'comments';

    const panel = $('#view-comments');
    panel.classList.remove('hidden');
    panel.classList.add('view-enter');
    panel.scrollTop = 0;

    location.hash = `#/item/${itemId}`;
    Comments.load(itemId);
  },

  showCommentsFromReader(itemId) {
    // Hide reader first, then show comments
    const readerPanel = $('#view-reader');
    readerPanel.classList.add('hidden');
    readerPanel.classList.remove('view-enter', 'view-exit');

    this.state.currentItemId = itemId;
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
    if (this.state.view === 'reader') {
      this.hideReader();
      location.hash = `#/${this.state.currentTab}`;
    } else if (this.state.view === 'comments') {
      this.hideComments();
      location.hash = `#/${this.state.currentTab}`;
    }
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

    // Back buttons
    $('#btn-back').addEventListener('click', () => this.goBack());
    $('#btn-reader-back').addEventListener('click', () => this.goBack());

    // Handle browser back
    window.addEventListener('popstate', () => {
      const hash = location.hash || '';
      if (this.state.view === 'reader' && !hash.startsWith('#/read/')) {
        this.hideReader();
      }
      if (this.state.view === 'comments' && !hash.startsWith('#/item/')) {
        this.hideComments();
      }
    });
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
