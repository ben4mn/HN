// thumbnails.js - OG image thumbnails via microlink.io, favicon fallback, lazy loading

const Thumbnails = {
  _observer: null,

  init() {
    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this._observer.unobserve(entry.target);
          this._loadThumbnail(entry.target);
        }
      });
    }, { rootMargin: '200px' });
  },

  observe(container) {
    if (this._observer && container) {
      this._observer.observe(container);
    }
  },

  async _loadThumbnail(container) {
    const url = container.dataset.url;
    if (!url) return;

    const domain = extractDomain(url);
    if (!domain) return;

    try {
      const img = await this._fetchOgImage(url, domain);
      if (img) {
        container.innerHTML = '';
        container.appendChild(img);
      }
    } catch {
      // silently fail - thumbnail is optional
    }
  },

  async _fetchOgImage(url, domain) {
    try {
      const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        const imgUrl = data?.data?.image?.url || data?.data?.logo?.url;
        if (imgUrl) {
          return this._createImg(imgUrl, domain);
        }
      }
    } catch {
      // fall through to favicon
    }
    return this._createImg(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`,
      domain,
      true
    );
  },

  _createImg(src, alt, isFavicon = false) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.loading = 'lazy';
    img.className = isFavicon
      ? 'w-6 h-6 object-contain thumbnail-fade'
      : 'w-full h-full object-cover thumbnail-fade';
    img.onerror = () => {
      if (!isFavicon) {
        img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(alt)}&sz=32`;
        img.className = 'w-6 h-6 object-contain thumbnail-fade';
      } else {
        img.remove();
      }
    };
    return img;
  }
};
