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
    SMART_MUSIC_BYPASS: 'smartMusicBypass',
    IS_GLOBALLY_ENABLED: 'isGloballyEnabled',
    DISABLED_DOMAINS: 'disabledDomains'
  };

  const MESSAGE_TYPES = {
    GET_STATUS: 'GET_RUNNY_STATUS',
    SET_SPEED: 'SET_SPEED',
    SET_MUSIC_BYPASS: 'SET_MUSIC_BYPASS',
    SET_GLOBAL_ACTIVE: 'SET_GLOBAL_ACTIVE',
    SET_DOMAIN_ACTIVE: 'SET_DOMAIN_ACTIVE',
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
  let isGloballyEnabled = true;
  let disabledDomains = [];
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

  function getCurrentDomain() {
    try {
      return window.location.hostname.toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function isDomainDisabled() {
    const host = getCurrentDomain();
    if (!host) return false;
    return disabledDomains.some(d => host === d || host.endsWith('.' + d));
  }

  function isRunnyActiveOnThisPage() {
    return isGloballyEnabled && !isDomainDisabled();
  }

  // Load storage preferences
  chrome.storage.sync.get([
    STORAGE_KEYS.CURRENT_SPEED,
    STORAGE_KEYS.DEFAULT_SPEED,
    STORAGE_KEYS.SMART_MUSIC_BYPASS,
    STORAGE_KEYS.IS_GLOBALLY_ENABLED,
    STORAGE_KEYS.DISABLED_DOMAINS
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
    if (data[STORAGE_KEYS.IS_GLOBALLY_ENABLED] !== undefined) {
      isGloballyEnabled = Boolean(data[STORAGE_KEYS.IS_GLOBALLY_ENABLED]);
    }
    if (Array.isArray(data[STORAGE_KEYS.DISABLED_DOMAINS])) {
      disabledDomains = data[STORAGE_KEYS.DISABLED_DOMAINS].map(d => d.toLowerCase());
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
    if (changes[STORAGE_KEYS.IS_GLOBALLY_ENABLED]) {
      isGloballyEnabled = Boolean(changes[STORAGE_KEYS.IS_GLOBALLY_ENABLED].newValue);
    }
    if (changes[STORAGE_KEYS.DISABLED_DOMAINS]) {
      disabledDomains = (changes[STORAGE_KEYS.DISABLED_DOMAINS].newValue || []).map(d => d.toLowerCase());
    }
    evaluateAndApplySpeed();
  });

  // OSD HUD Badge
  function showSpeedHUD(speedText, isMusic = false, customMessage = null) {
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

    if (customMessage) {
      hud.textContent = customMessage;
    } else {
      hud.textContent = isMusic ? '🎵 Music Detected (1.0×)' : `⚡ ${speedText}×`;
    }
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
    if (!force && (now - lastMusicCheckTime < 2000)) {
      return cachedMusicResult;
    }
    lastMusicCheckTime = now;

    const host = getCurrentDomain();

    // 1. Domain Match
    if (MUSIC_DOMAINS.some(domain => host.includes(domain))) {
      cachedMusicResult = true;
      return true;
    }

    // 2. Active Audio Element Check
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
      const metaGenre = document.querySelector('meta[itemprop="genre"]');
      if (metaGenre?.content?.toLowerCase().includes('music')) {
        cachedMusicResult = true;
        return true;
      }

      if (document.querySelector('path[d*="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21"]')) {
        cachedMusicResult = true;
        return true;
      }

      const channelOwner = document.querySelector('#owner-name, #channel-name, ytd-channel-name');
      if (channelOwner?.textContent) {
        const name = channelOwner.textContent.trim().toLowerCase();
        if (name.endsWith('- topic') || name.includes('vevo')) {
          cachedMusicResult = true;
          return true;
        }
      }

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
    // If globally disabled or paused on this website, remain at 1.0x normal
    if (!isGloballyEnabled || isDomainDisabled()) {
      return SPEED_LIMITS.NORMAL;
    }

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

    // Pitch preservation
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

  // Scan node and descendants for media elements
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

  function evaluateAndApplySpeed(showFeedback = false, customHud = null) {
    const wasMusic = isCurrentMediaMusic;
    isCurrentMediaMusic = checkIsMusic();

    for (const media of trackedMediaElements) {
      applySpeedToMedia(media);
    }

    if (customHud) {
      showSpeedHUD(null, false, customHud);
    } else if (showFeedback && trackedMediaElements.size > 0) {
      showSpeedHUD(getEffectiveSpeed(), isCurrentMediaMusic);
    } else if (isCurrentMediaMusic !== wasMusic && trackedMediaElements.size > 0 && isRunnyActiveOnThisPage()) {
      showSpeedHUD(getEffectiveSpeed(), isCurrentMediaMusic);
    }

    try {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STATUS_UPDATE,
        isMusic: isCurrentMediaMusic,
        effectiveSpeed: getEffectiveSpeed(),
        activeSpeed: activeSpeed,
        smartMusicBypass: smartMusicBypass,
        isGloballyEnabled: isGloballyEnabled,
        isDomainDisabled: isDomainDisabled(),
        currentDomain: getCurrentDomain(),
        mediaCount: trackedMediaElements.size
      }).catch(() => {});
    } catch (_) {}
  }

  // Targeted MutationObserver
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

  // SPA navigation events
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
          isGloballyEnabled: isGloballyEnabled,
          isDomainDisabled: isDomainDisabled(),
          currentDomain: getCurrentDomain(),
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
      case MESSAGE_TYPES.SET_GLOBAL_ACTIVE: {
        isGloballyEnabled = Boolean(request.enabled);
        evaluateAndApplySpeed(true, isGloballyEnabled ? `⚡ Runny Active (${activeSpeed}×)` : '⏸️ Runny Disabled (1.0×)');
        sendResponse({
          success: true,
          isGloballyEnabled: isGloballyEnabled,
          effectiveSpeed: getEffectiveSpeed()
        });
        break;
      }
      case MESSAGE_TYPES.SET_DOMAIN_ACTIVE: {
        if (Array.isArray(request.disabledDomains)) {
          disabledDomains = request.disabledDomains.map(d => d.toLowerCase());
        }
        const paused = isDomainDisabled();
        evaluateAndApplySpeed(true, paused ? `⏸️ Paused on ${getCurrentDomain()}` : `⚡ Active on ${getCurrentDomain()} (${activeSpeed}×)`);
        sendResponse({
          success: true,
          isDomainDisabled: paused,
          effectiveSpeed: getEffectiveSpeed()
        });
        break;
      }
      default:
        break;
    }
    return true;
  });

  // Lightweight periodic rate guard
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
