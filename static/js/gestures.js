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
    const foot = $('#feed-foot');
    const THRESHOLD = 76;   // px of eased pull that arms a refresh
    const HOLD = 58;        // resting offset while refreshing
    const MIN_SPIN = 650;   // ms, so a fast refresh still reads as one
    let startY = 0;
    let pull = 0;
    let active = false;
    let refreshing = false;
    let armed = false;      // touch began at the top of the list
    let past = false;       // pulled beyond the threshold

    const setPull = (px, { animate = false } = {}) => {
      pull = px;
      const p = clamp(px / THRESHOLD, 0, 1);
      ptr.style.setProperty('--pull', `${px}px`);
      ptr.style.setProperty('--p', p.toFixed(3));
      const t = animate ? 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
      list.style.transition = t;
      foot.style.transition = t;
      list.style.transform = px ? `translateY(${px}px)` : '';
      foot.style.transform = list.style.transform;
    };
    const ease = (dy) => {
      // Rubber band: quick to start, then progressively heavier.
      const k = 0.5;
      return Math.min(THRESHOLD * 1.6, dy * k - Math.max(0, dy - THRESHOLD / k) * 0.28);
    };

    scroll.addEventListener('touchstart', (e) => {
      if (refreshing || (App.state.detailOpen && App.state.layout === 'mobile')) { armed = false; return; }
      if (scroll.scrollTop > 0) { armed = false; return; }
      startY = e.touches[0].clientY;
      armed = true;
      active = false;
      past = false;
    }, { passive: true });

    scroll.addEventListener('touchmove', (e) => {
      if (!armed || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      if (dy < 0 || scroll.scrollTop > 0) {
        if (active) { active = false; ptr.classList.remove('active', 'armed'); setPull(0, { animate: true }); }
        return;
      }
      if (!active && dy > 10) { active = true; ptr.classList.add('active'); ptr.classList.remove('settle', 'done'); }
      if (!active) return;
      if (e.cancelable) e.preventDefault();
      setPull(ease(dy));
      const nowPast = pull >= THRESHOLD;
      if (nowPast !== past) {
        past = nowPast;
        ptr.classList.toggle('armed', nowPast);
        if (nowPast) haptic(6);
      }
    }, { passive: false });

    const finish = async () => {
      if (!active) return;
      active = false;
      if (pull >= THRESHOLD && !refreshing) {
        refreshing = true;
        ptr.classList.remove('armed');
        ptr.classList.add('refreshing');
        setPull(HOLD, { animate: true });
        haptic(10);
        const started = Date.now();
        try { await App.refresh({ silent: true }); } catch { /* feed shows its own error */ }
        const left = MIN_SPIN - (Date.now() - started);
        if (left > 0) await new Promise((r) => setTimeout(r, left));
        ptr.classList.remove('refreshing');
        ptr.classList.add('done');
        await new Promise((r) => setTimeout(r, 380));
        ptr.classList.add('settle');
        setPull(0, { animate: true });
        await new Promise((r) => setTimeout(r, 320));
        ptr.classList.remove('active', 'done', 'settle');
        refreshing = false;
        return;
      }
      ptr.classList.add('settle');
      setPull(0, { animate: true });
      setTimeout(() => ptr.classList.remove('active', 'armed', 'settle'), 320);
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
