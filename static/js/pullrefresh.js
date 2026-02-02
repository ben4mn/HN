// pullrefresh.js - Apple-style pull-to-refresh gesture

const PullRefresh = {
  THRESHOLD: 110,    // px to pull before triggering
  MAX_PULL: 160,     // max visual pull distance
  RESISTANCE: 0.4,   // rubber-band resistance

  _startY: 0,
  _pulling: false,
  _refreshing: false,
  _currentPull: 0,

  init() {
    const feed = $('#view-feed');
    feed.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
    feed.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    feed.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });
  },

  _onTouchStart(e) {
    if (this._refreshing) return;
    if (App.state.view !== 'feed') return;
    this._startY = e.touches[0].clientY;
    this._pulling = false;
    this._currentPull = 0;
  },

  _onTouchMove(e) {
    if (this._refreshing) return;
    if (App.state.view !== 'feed') return;

    // Only activate when scrolled to top
    if (window.scrollY > 0) return;

    const dy = e.touches[0].clientY - this._startY;
    if (dy < 0) return;

    // Require deliberate downward pull before activating
    if (dy > 30) {
      this._pulling = true;
    }
    if (!this._pulling) return;

    e.preventDefault();

    // Apply rubber-band resistance
    this._currentPull = Math.min(dy * this.RESISTANCE, this.MAX_PULL);

    this._updateVisuals();
  },

  _onTouchEnd() {
    if (!this._pulling || this._refreshing) return;

    if (this._currentPull >= this.THRESHOLD * this.RESISTANCE) {
      this._triggerRefresh();
    } else {
      this._reset();
    }

    this._pulling = false;
  },

  _updateVisuals() {
    const container = $('#ptr-container');
    const spinner = container.querySelector('.ptr-spinner');
    const progress = Math.min(this._currentPull / (this.THRESHOLD * this.RESISTANCE), 1);
    const pastThreshold = progress >= 1;

    // Position the spinner
    const offset = this._currentPull;
    spinner.style.top = `${offset - 48}px`;

    // Scale & opacity based on progress
    const scale = 0.3 + progress * 0.7;
    spinner.style.transform = `scale(${scale})`;
    spinner.style.opacity = Math.min(progress * 1.5, 1);

    // Glow intensity
    const glow = container.querySelector('.ptr-glow');
    glow.style.opacity = progress * 0.8;
    glow.style.top = `${offset - 40}px`;

    // Arrow rotation when past threshold
    container.classList.toggle('ptr-active', progress > 0.05);
    container.classList.toggle('ptr-threshold', pastThreshold);

    // Push feed down
    $('#view-feed').style.transform = `translateY(${offset}px)`;
  },

  async _triggerRefresh() {
    const container = $('#ptr-container');
    const spinner = container.querySelector('.ptr-spinner');
    const glow = container.querySelector('.ptr-glow');

    // Snap to resting refresh position
    const restY = 52;
    spinner.style.transition = 'top 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.3s ease';
    spinner.style.top = `${restY - 48}px`;
    spinner.style.transform = 'scale(1)';
    spinner.style.opacity = '1';
    glow.style.transition = 'top 0.3s ease';
    glow.style.top = `${restY - 40}px`;
    $('#view-feed').style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    $('#view-feed').style.transform = `translateY(${restY}px)`;

    container.classList.remove('ptr-active', 'ptr-threshold');
    container.classList.add('ptr-refreshing');
    this._refreshing = true;

    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(10);

    // Do the refresh
    try {
      HNApi.clearCache();
      App.state.currentPage = 0;
      await App.loadFeed();
    } catch {
      // loadFeed handles its own errors
    }

    // Done animation
    container.classList.remove('ptr-refreshing');
    container.classList.add('ptr-done');

    // Slide feed back
    $('#view-feed').style.transition = 'transform 0.3s ease';
    $('#view-feed').style.transform = 'translateY(0)';

    setTimeout(() => {
      this._cleanup();
      this._refreshing = false;
    }, 350);
  },

  _reset() {
    const container = $('#ptr-container');
    const spinner = container.querySelector('.ptr-spinner');
    const glow = container.querySelector('.ptr-glow');

    // Animate back
    spinner.style.transition = 'top 0.25s ease, transform 0.25s ease, opacity 0.2s ease';
    spinner.style.top = '-48px';
    spinner.style.transform = 'scale(0.3)';
    spinner.style.opacity = '0';
    glow.style.transition = 'top 0.25s ease, opacity 0.2s ease';
    glow.style.top = '-40px';
    glow.style.opacity = '0';
    $('#view-feed').style.transition = 'transform 0.25s ease';
    $('#view-feed').style.transform = 'translateY(0)';

    container.classList.remove('ptr-active', 'ptr-threshold');

    setTimeout(() => this._cleanup(), 300);
  },

  _cleanup() {
    const container = $('#ptr-container');
    const spinner = container.querySelector('.ptr-spinner');
    const glow = container.querySelector('.ptr-glow');

    container.classList.remove('ptr-active', 'ptr-threshold', 'ptr-refreshing', 'ptr-done');
    spinner.style.transition = '';
    spinner.style.top = '';
    spinner.style.transform = '';
    spinner.style.opacity = '';
    glow.style.transition = '';
    glow.style.top = '';
    glow.style.opacity = '';
    $('#view-feed').style.transition = '';
    $('#view-feed').style.transform = '';
  }
};
