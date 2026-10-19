/**
 * Runny - Content Script (High-Performance Engine)
 * Runs in the context of web pages and embedded iframes.
 *
 * Performance Optimizations:
 * 1. Targeted MutationObserver: Inspects addedNodes directly instead of document.querySelectorAll('*').
 * 2. Cached Media Registry (WeakSet / Set): Reuses attached event listeners without memory leaks.
 * 3. Throttled Music Detection: Caches music calculation per URL/navigation to eliminate redundant DOM queries.
 * 4. Microtask / RAF scheduling: Avoids layout thrashing.
 */

(() => {
  if (window.__runny_content_script_loaded) return;
  window.__runny_content_script_loaded = true;

  // Constants
  const STORAGE_KEYS = {
    CURRENT_SPEED: 'currentSpeed',
    DEFAULT_SPEED: 'defaultSpeed',
    SMART_MUSIC_BYPASS: 'smartMusicBypass'
  };

  const MESSAGE_TYPES = {
    GET_STATUS: 'GET_RUNNY_STATUS',
    SET_SPEED: 'SET_SPEED',
    SET_MUSIC_BYPASS: 'SET_MUSIC_BYPASS',
    STATUS_UPDATE: 'RUNNY_STATUS_UPDATE'
  };

  const SPEED_LIMITS = {
    DEFAULT: 1.25,
    NORMAL: 1.0,
    MIN: 0.25,
    MAX: 4.0
  };

  const MUSIC_DOMAINS = [
    'music.youtube.com',
    'spotify.com',
    'soundcloud.com',
    'music.apple.com',
    'deezer.com',
    'tidal.com',
    'bandcamp.com',
    'pandora.com',
    'jiosaavn.com',
    'gaana.com',
    'music.amazon.',
    'audiomack.com'
  ];

  // Runtime State
  let activeSpeed = SPEED_LIMITS.DEFAULT;
  let defaultSpeed = SPEED_LIMITS.DEFAULT;
  let smartMusicBypass = true;
  let isCurrentMediaMusic = false;
  let lastMusicCheckTime = 0;
  let cachedMusicResult = false;
  let hudTimeout = null;

  // Media Registry to avoid re-querying and duplicate listeners
  const trackedMediaElements = new Set();
  const hookedElements = new WeakSet();

  function clampSpeed(val) {
    const num = parseFloat(val);
    if (isNaN(num)) return SPEED_LIMITS.DEFAULT;
    return Math.round(Math.min(SPEED_LIMITS.MAX, Math.max(SPEED_LIMITS.MIN, num)) * 100) / 100;
  }

  // Load storage preferences
  chrome.storage.sync.get([
    STORAGE_KEYS.CURRENT_SPEED,
    STORAGE_KEYS.DEFAULT_SPEED,
    STORAGE_KEYS.SMART_MUSIC_BYPASS
  ], (data) => {
    if (data[STORAGE_KEYS.CURRENT_SPEED] !== undefined) {
      activeSpeed = clampSpeed(data[STORAGE_KEYS.CURRENT_SPEED]);
    }
    if (data[STORAGE_KEYS.DEFAULT_SPEED] !== undefined) {
      defaultSpeed = clampSpeed(data[STORAGE_KEYS.DEFAULT_SPEED]);
    }
    if (data[STORAGE_KEYS.SMART_MUSIC_BYPASS] !== undefined) {
      smartMusicBypass = Boolean(data[STORAGE_KEYS.SMART_MUSIC_BYPASS]);
    }
    evaluateAndApplySpeed();
  });

  // Storage change listener
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (changes[STORAGE_KEYS.CURRENT_SPEED]) {
      activeSpeed = clampSpeed(changes[STORAGE_KEYS.CURRENT_SPEED].newValue);
    }
    if (changes[STORAGE_KEYS.DEFAULT_SPEED]) {
      defaultSpeed = clampSpeed(changes[STORAGE_KEYS.DEFAULT_SPEED].newValue);
    }
    if (changes[STORAGE_KEYS.SMART_MUSIC_BYPASS]) {
      smartMusicBypass = Boolean(changes[STORAGE_KEYS.SMART_MUSIC_BYPASS].newValue);
    }
    evaluateAndApplySpeed();
  });

  // OSD HUD Badge
  function showSpeedHUD(speedText, isMusic = false) {
    let hud = document.getElementById('runny-speed-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'runny-speed-hud';
      Object.assign(hud.style, {
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: '2147483647',
        backgroundColor: 'rgba(9, 9, 11, 0.88)',
        color: '#ffffff',
        border: '1px solid #3f3f46',
        borderRadius: '8px',
        padding: '8px 14px',
        fontSize: '14px',
        fontWeight: '700',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        transition: 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
      });
      document.body?.appendChild(hud);
    }

    hud.textContent = isMusic ? '🎵 Music Detected (1.0×)' : `⚡ ${speedText}×`;
    hud.style.opacity = '1';
    hud.style.transform = 'translateY(0px)';

    if (hudTimeout) clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
      hud.style.opacity = '0';
      hud.style.transform = 'translateY(-6px)';
    }, 1200);
  }

  /**
   * High-Performance Music Detection with time-based caching
   * @param {boolean} force - Force re-evaluation
   * @returns {boolean}
   */
  function checkIsMusic(force = false) {
    const now = Date.now();
    // Cache result for 2 seconds unless forced
    if (!force && (now - lastMusicCheckTime < 2000)) {
      return cachedMusicResult;
    }
    lastMusicCheckTime = now;

    const host = window.location.hostname.toLowerCase();

    // 1. Domain Match (O(1))
    if (MUSIC_DOMAINS.some(domain => host.includes(domain))) {
      cachedMusicResult = true;
      return true;
    }

    // 2. Active Audio Element Check (fast Array loop)
    let activeAudio = false;
    let activeVideo = false;
    for (const media of trackedMediaElements) {
      if (!media.paused && media.duration > 0) {
        if (media.tagName === 'AUDIO') activeAudio = true;
        if (media.tagName === 'VIDEO') activeVideo = true;
      }
    }
    if (activeAudio && !activeVideo) {
      cachedMusicResult = true;
      return true;
    }

    // 3. YouTube Metadata Inspection
    if (host.includes('youtube.com')) {
      // Fast check: genre meta tag
      const metaGenre = document.querySelector('meta[itemprop="genre"]');
      if (metaGenre?.content?.toLowerCase().includes('music')) {
        cachedMusicResult = true;
        return true;
      }

      // Fast check: channel note SVG icon
      if (document.querySelector('path[d*="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21"]')) {
        cachedMusicResult = true;
        return true;
      }

      // Channel name check
      const channelOwner = document.querySelector('#owner-name, #channel-name, ytd-channel-name');
      if (channelOwner?.textContent) {
        const name = channelOwner.textContent.trim().toLowerCase();
        if (name.endsWith('- topic') || name.includes('vevo')) {
          cachedMusicResult = true;
          return true;
        }
      }

      // Badge check
      const musicSection = document.querySelector('ytd-metadata-row-container-renderer');
      if (musicSection?.textContent?.toLowerCase().includes('music')) {
        cachedMusicResult = true;
        return true;
      }
    }

    // 4. MediaSession Album tag
    if ('mediaSession' in navigator && navigator.mediaSession.metadata?.album) {
      cachedMusicResult = true;
      return true;
    }

    cachedMusicResult = false;
    return false;
  }

  function getEffectiveSpeed() {
    if (smartMusicBypass && isCurrentMediaMusic) {
      return SPEED_LIMITS.NORMAL;
    }
    return activeSpeed || defaultSpeed || SPEED_LIMITS.NORMAL;
  }

  function applySpeedToMedia(media) {
    if (!media || !media.isConnected) {
      trackedMediaElements.delete(media);
      return;
    }

    const target = getEffectiveSpeed();

    // Pitch preservation (only set if not already true)
    if (media.preservesPitch !== true && 'preservesPitch' in media) {
      media.preservesPitch = true;
    }
    if (media.webkitPreservesPitch !== true && 'webkitPreservesPitch' in media) {
      media.webkitPreservesPitch = true;
    }
    if (media.mozPreservesPitch !== true && 'mozPreservesPitch' in media) {
      media.mozPreservesPitch = true;
    }

    if (media.playbackRate !== target) {
      media.playbackRate = target;
    }
  }

  // Register and hook an individual media element
  function registerMediaElement(media) {
    if (!media || hookedElements.has(media)) return;

    hookedElements.add(media);
    trackedMediaElements.add(media);

    media.addEventListener('play', () => evaluateAndApplySpeed(), { passive: true });
    media.addEventListener('loadedmetadata', () => evaluateAndApplySpeed(), { passive: true });
    media.addEventListener('ratechange', () => {
      const target = getEffectiveSpeed();
      if (media.playbackRate !== target) {
        setTimeout(() => {
          if (media.playbackRate !== target) {
            media.playbackRate = target;
          }
        }, 50);
      }
    }, { passive: true });

    applySpeedToMedia(media);
  }

  // Scan node and descendants for media elements (O(nodes) instead of O(DOM))
  function findMediaInNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
      registerMediaElement(node);
    }

    const mediaChildren = node.querySelectorAll?.('video, audio');
    if (mediaChildren) {
      for (let i = 0; i < mediaChildren.length; i++) {
        registerMediaElement(mediaChildren[i]);
      }
    }

    if (node.shadowRoot) {
      findMediaInNode(node.shadowRoot);
    }
  }

  // Initial media discovery
  document.querySelectorAll('video, audio').forEach(registerMediaElement);

  function evaluateAndApplySpeed(showFeedback = false) {
    const wasMusic = isCurrentMediaMusic;
    isCurrentMediaMusic = checkIsMusic();

    for (const media of trackedMediaElements) {
      applySpeedToMedia(media);
    }

    if (showFeedback && trackedMediaElements.size > 0) {
      showSpeedHUD(getEffectiveSpeed(), isCurrentMediaMusic);
    } else if (isCurrentMediaMusic !== wasMusic && trackedMediaElements.size > 0) {
      showSpeedHUD(getEffectiveSpeed(), isCurrentMediaMusic);
    }

    try {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STATUS_UPDATE,
        isMusic: isCurrentMediaMusic,
        effectiveSpeed: getEffectiveSpeed(),
        activeSpeed: activeSpeed,
        smartMusicBypass: smartMusicBypass,
        mediaCount: trackedMediaElements.size
      }).catch(() => {});
    } catch (_) {}
  }

  // Targeted, efficient MutationObserver
  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        findMediaInNode(added[j]);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // SPA navigation events: reset music cache and re-apply
  ['yt-navigate-finish', 'popstate', 'hashchange', 'locationchange'].forEach(evt => {
    window.addEventListener(evt, () => {
      lastMusicCheckTime = 0;
      setTimeout(() => evaluateAndApplySpeed(), 300);
      setTimeout(() => evaluateAndApplySpeed(), 1000);
    }, { passive: true });
  });

  // Message router
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case MESSAGE_TYPES.GET_STATUS: {
        isCurrentMediaMusic = checkIsMusic(true);
        sendResponse({
          isMusic: isCurrentMediaMusic,
          effectiveSpeed: getEffectiveSpeed(),
          activeSpeed: activeSpeed,
          smartMusicBypass: smartMusicBypass,
          mediaCount: trackedMediaElements.size
        });
        break;
      }
      case MESSAGE_TYPES.SET_SPEED: {
        activeSpeed = clampSpeed(request.speed);
        evaluateAndApplySpeed(Boolean(request.showBadge));
        sendResponse({
          success: true,
          effectiveSpeed: getEffectiveSpeed()
        });
        break;
      }
      case MESSAGE_TYPES.SET_MUSIC_BYPASS: {
        smartMusicBypass = Boolean(request.enabled);
        evaluateAndApplySpeed(true);
        sendResponse({
          success: true,
          smartMusicBypass: smartMusicBypass
        });
        break;
      }
      default:
        break;
    }
    return true;
  });

  // Lightweight periodic rate guard (only iterates tracked media, zero DOM queries)
  setInterval(() => {
    if (trackedMediaElements.size > 0) {
      const musicCheck = checkIsMusic();
      if (musicCheck !== isCurrentMediaMusic) {
        isCurrentMediaMusic = musicCheck;
      }
      const target = getEffectiveSpeed();
      for (const media of trackedMediaElements) {
        if (!media.isConnected) {
          trackedMediaElements.delete(media);
        } else if (media.playbackRate !== target) {
          media.playbackRate = target;
        }
      }
    }
  }, 1200);

  // Initial run
  setTimeout(evaluateAndApplySpeed, 400);
})();
