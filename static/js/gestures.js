// gestures.js - Touch: pull-to-refresh on the feed, edge-swipe back on the detail overlay

const Gestures = {
  init() {
    this._pullToRefresh();
    this._edgeSwipeBack();
  },

  // ---- Pull to refresh ----
  _pullToRefresh() {
    const scroll = $('#feed-scroll');
    const ptr = $('#ptr');
    const list = $('#story-list');
    const THRESHOLD = 72;
    const MAX = 110;
    let startY = 0;
    let pull = 0;
    let active = false;
    let refreshing = false;
    let armed = false;

    const setPull = (px) => {
      pull = px;
      const p = clamp(px / THRESHOLD, 0, 1);
      ptr.style.setProperty('--pull', `${px}px`);
      ptr.style.setProperty('--p', p.toFixed(3));
      ptr.classList.toggle('armed', p >= 1);
      list.style.transform = px ? `translateY(${px}px)` : '';
      $('#feed-foot').style.transform = list.style.transform;
    };

    scroll.addEventListener('touchstart', (e) => {
      if (refreshing || App.state.detailOpen && App.state.layout === 'mobile') return;
      if (scroll.scrollTop > 0) { armed = false; return; }
      startY = e.touches[0].clientY;
      armed = true;
      active = false;
    }, { passive: true });

    scroll.addEventListener('touchmove', (e) => {
      if (!armed || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      if (dy < 0 || scroll.scrollTop > 0) {
        if (active) { active = false; setPull(0); ptr.classList.remove('active'); }
        return;
      }
      if (!active && dy > 12) { active = true; ptr.classList.add('active'); list.style.transition = 'none'; }
      if (!active) return;
      if (e.cancelable) e.preventDefault();
      // Rubber band
      const eased = Math.min(MAX, dy * 0.45 + Math.max(0, dy - 160) * 0.1);
      setPull(eased);
    }, { passive: false });

    const finish = async () => {
      if (!active) return;
      active = false;
      list.style.transition = '';
      if (pull >= THRESHOLD && !refreshing) {
        refreshing = true;
        ptr.classList.add('refreshing');
        setPull(56);
        haptic(10);
        try { await App.refresh({ silent: true }); } catch { /* handled */ }
        ptr.classList.remove('refreshing', 'armed');
      }
      setPull(0);
      ptr.classList.remove('active', 'armed');
      refreshing = false;
    };
    scroll.addEventListener('touchend', finish, { passive: true });
    scroll.addEventListener('touchcancel', finish, { passive: true });
  },

  // ---- Edge swipe back (mobile overlay) ----
  _edgeSwipeBack() {
    const detail = $('#detail');
    const EDGE = 28;
    let tracking = false;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let decided = false;

    detail.addEventListener('touchstart', (e) => {
      if (App.state.layout !== 'mobile' || !App.state.detailOpen) return;
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      tracking = true;
      decided = false;
      startX = t.clientX;
      startY = t.clientY;
      dx = 0;
      detail.classList.add('dragging');
    }, { passive: true });

    detail.addEventListener('touchmove', (e) => {
      if (!tracking) return;
      const t = e.touches[0];
      dx = Math.max(0, t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      if (!decided) {
        if (dy > 12 && dy > dx) { tracking = false; detail.classList.remove('dragging'); detail.style.transform = ''; return; }
        if (dx > 8) decided = true; else return;
      }
      if (e.cancelable) e.preventDefault();
      detail.style.transform = `translateX(${dx}px)`;
    }, { passive: false });

    const end = () => {
      if (!tracking) return;
      tracking = false;
      detail.classList.remove('dragging');
      const commit = dx > Math.min(120, window.innerWidth * 0.3);
      detail.style.transform = '';
      if (commit) {
        haptic(8);
        App.goBack();
      }
    };
    detail.addEventListener('touchend', end, { passive: true });
    detail.addEventListener('touchcancel', end, { passive: true });
  }
};
