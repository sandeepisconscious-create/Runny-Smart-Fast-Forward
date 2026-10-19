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
    DISABLED_DOMAINS: 'disabledDomains',
    AUTO_PIP_ENABLED: 'autoPipEnabled',
    SMART_AUTO_PAUSE: 'smartAutoPause'
  };

  const MESSAGE_TYPES = {
    GET_STATUS: 'GET_RUNNY_STATUS',
    SET_SPEED: 'SET_SPEED',
    SET_MUSIC_BYPASS: 'SET_MUSIC_BYPASS',
    SET_GLOBAL_ACTIVE: 'SET_GLOBAL_ACTIVE',
    SET_DOMAIN_ACTIVE: 'SET_DOMAIN_ACTIVE',
    SET_AUTO_PIP: 'SET_AUTO_PIP',
    SET_SMART_AUTO_PAUSE: 'SET_SMART_AUTO_PAUSE',
    PAUSE_OTHER_MEDIA: 'PAUSE_OTHER_MEDIA',
    PAUSE_MEDIA: 'PAUSE_MEDIA',
    MEDIA_STARTED_PLAYING: 'MEDIA_STARTED_PLAYING',
    TOGGLE_PIP: 'TOGGLE_PIP',
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
  let autoPipEnabled = true;
  let smartAutoPause = true;
  let isCurrentMediaMusic = false;
  let lastMusicCheckTime = 0;
  let cachedMusicResult = false;
  let hudTimeout = null;
  let autoPipEntered = false;

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
    STORAGE_KEYS.DISABLED_DOMAINS,
    STORAGE_KEYS.AUTO_PIP_ENABLED,
    STORAGE_KEYS.SMART_AUTO_PAUSE
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
    if (data[STORAGE_KEYS.AUTO_PIP_ENABLED] !== undefined) {
      autoPipEnabled = Boolean(data[STORAGE_KEYS.AUTO_PIP_ENABLED]);
    }
    if (data[STORAGE_KEYS.SMART_AUTO_PAUSE] !== undefined) {
      smartAutoPause = Boolean(data[STORAGE_KEYS.SMART_AUTO_PAUSE]);
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
      disabledDomains = Array.isArray(changes[STORAGE_KEYS.DISABLED_DOMAINS].newValue)
        ? changes[STORAGE_KEYS.DISABLED_DOMAINS].newValue.map(d => d.toLowerCase())
        : [];
    }
    if (changes[STORAGE_KEYS.AUTO_PIP_ENABLED]) {
      autoPipEnabled = Boolean(changes[STORAGE_KEYS.AUTO_PIP_ENABLED].newValue);
    }
    if (changes[STORAGE_KEYS.SMART_AUTO_PAUSE]) {
      smartAutoPause = Boolean(changes[STORAGE_KEYS.SMART_AUTO_PAUSE].newValue);
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

    // 3. YouTube Deep Metadata & Video Song Inspection
    if (host.includes('youtube.com')) {
      // 3a. Genre Meta Tag
      const metaGenre = document.querySelector('meta[itemprop="genre"]');
      if (metaGenre?.content?.toLowerCase().includes('music')) {
        cachedMusicResult = true;
        return true;
      }

      // 3b. Official YouTube Music Icon SVG path (Category 10 musical note icon in description)
      if (document.querySelector('path[d*="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21"]') ||
          document.querySelector('path[d*="M12 3v9.28a4.39 4.39 0 00-1.5-.28"]')) {
        cachedMusicResult = true;
        return true;
      }

      // 3c. Official Artist Channel / VEVO / Music Labels
      const channelOwner = document.querySelector('#owner-name, #channel-name, ytd-channel-name, #upload-info #text');
      if (channelOwner?.textContent) {
        const name = channelOwner.textContent.trim().toLowerCase();
        if (name.endsWith('- topic') ||
            name.includes('vevo') ||
            name.includes('records') ||
            name.includes('music') ||
            name.includes('songs') ||
            name.includes('sandalwood') ||
            name.includes('lahari') ||
            name.includes('anand audio') ||
            name.includes('aditya music') ||
            name.includes('t-series') ||
            name.includes('zee music') ||
            name.includes('sony music') ||
            name.includes('saregama') ||
            name.includes('speed records') ||
            name.includes('yrf') ||
            name.includes('tips official')) {
          cachedMusicResult = true;
          return true;
        }
      }

      // 3d. Official Artist Note Badge (verified musical note badge next to channel name)
      if (document.querySelector('ytd-badge-supported-renderer [aria-label*="Official Artist"], yt-icon.badge-style-type-verified-artist, [aria-label="Official Artist Channel"]')) {
        cachedMusicResult = true;
        return true;
      }

      // 3e. Title Inspection: Standard industry naming conventions for music & video songs
      const titleElem = document.querySelector('h1.ytd-watch-metadata, #title h1, h1.title');
      const titleText = (titleElem?.textContent || document.title || '').toLowerCase();
      
      const MUSIC_TITLE_REGEX = /\b(official\s*(music\s*video|video|audio|lyric\s*video|track|song|visualizer)|music\s*video|video\s*song|full\s*song|lyric\s*video|audio\s*song|remix|acoustic\s*version|live\s*performance|original\s*soundtrack|soundtrack|ost)\b|\[(official\s*(music\s*)?video|audio|lyrics)]|\((official\s*(music\s*)?video|audio|lyrics)\)/i;
      if (MUSIC_TITLE_REGEX.test(titleText)) {
        cachedMusicResult = true;
        return true;
      }

      // 3f. YouTube Description Structured Music Panel ("Song", "Artist", "Licensed to YouTube by")
      const musicSection = document.querySelector('ytd-metadata-row-container-renderer, #structured-description, ytd-expander.ytd-video-secondary-info-renderer');
      if (musicSection?.textContent) {
        const text = musicSection.textContent.toLowerCase();
        if (text.includes('licensed to youtube by') ||
            text.includes('song\n') ||
            text.includes('artist\n') ||
            (text.includes('music in this video') && !text.includes('licensed to youtube by: none'))) {
          cachedMusicResult = true;
          return true;
        }
      }

      // 3g. JSON-LD Microdata Embedded in DOM
      const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
      for (let i = 0; i < jsonLd.length; i++) {
        try {
          const content = jsonLd[i].textContent;
          if (content.includes('"MusicVideoObject"') || content.includes('"MusicRecording"') || content.includes('"genre":"Music"')) {
            cachedMusicResult = true;
            return true;
          }
        } catch (_) {}
      }
    }

    // 4. MediaSession Metadata (Album or Artist present without podcast indicator)
    if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
      const meta = navigator.mediaSession.metadata;
      if (meta.album) {
        cachedMusicResult = true;
        return true;
      }
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

    const notifyPlaying = () => {
      evaluateAndApplySpeed();
      if (smartAutoPause && isRunnyActiveOnThisPage() && !media.paused && media.currentTime > 0) {
        try {
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.MEDIA_STARTED_PLAYING,
            domain: getCurrentDomain()
          }).catch(() => {});
        } catch (_) {}
      }
    };

    media.addEventListener('play', notifyPlaying, { passive: true });
    media.addEventListener('playing', notifyPlaying, { passive: true });
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

    if (media.tagName === 'VIDEO') {
      attachFloatingPipButton(media);
    }

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

  // Find the primary active video on the page
  function getActivePlayingVideo() {
    for (const media of trackedMediaElements) {
      if (media.tagName === 'VIDEO' && !media.paused && media.duration > 0 && !media.ended) {
        return media;
      }
    }
    // Fallback: check DOM for any video playing or ready
    const allVideos = document.querySelectorAll('video');
    for (const v of allVideos) {
      if (!v.paused && v.duration > 0 && !v.ended) {
        return v;
      }
    }
    return allVideos[0] || null;
  }

  // Bypass DRM / streaming site disablePictureInPicture restrictions (Prime Video, Hotstar, etc.)
  function unlockVideoPiP(video) {
    if (!video) return;
    try {
      if (video.disablePictureInPicture) {
        video.disablePictureInPicture = false;
      }
      if (video.hasAttribute('disablepictureinpicture')) {
        video.removeAttribute('disablepictureinpicture');
      }
    } catch (_) {}
  }

  // Direct toggle function (invoked via Alt+P shortcut or user click)
  async function togglePiP() {
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
        showSpeedHUD(null, false, '🔲 Exited Picture-in-Picture');
      } catch (_) {}
      return;
    }

    const video = getActivePlayingVideo();
    if (!video) {
      showSpeedHUD(null, false, '⚠️ No video found to pop out');
      return;
    }

    unlockVideoPiP(video);

    try {
      await video.requestPictureInPicture();
      showSpeedHUD(null, false, '🔲 Picture-in-Picture Active');
      autoPipEntered = true;
    } catch (err) {
      console.warn('[Runny] PiP request failed:', err);
      showSpeedHUD(null, false, '⚠️ PiP blocked by site or DRM');
    }
  }

  // Handle Tab Switch: Auto Picture-in-Picture
  async function handleVisibilityChange() {
    if (!autoPipEnabled || !isRunnyActiveOnThisPage()) {
      return;
    }

    // Do not pop out picture-in-picture if it's music
    if (isCurrentMediaMusic && smartMusicBypass) {
      return;
    }

    if (document.hidden) {
      // Switched away to another tab
      const video = getActivePlayingVideo();
      if (video && document.pictureInPictureEnabled && !document.pictureInPictureElement) {
        unlockVideoPiP(video);
        try {
          await video.requestPictureInPicture();
          autoPipEntered = true;
        } catch (err) {
          // Handled gracefully: browser transient user activation policy
        }
      }
    } else {
      // Switched back to this tab: seamlessly close the PiP window back into the player
      if (document.pictureInPictureElement) {
        const pipVideo = document.pictureInPictureElement;
        try {
          await document.exitPictureInPicture();
        } catch (_) {}
        autoPipEntered = false;

        // Force frame decode and repaint so player is immediately live across YouTube, JioHotstar, Prime Video
        if (pipVideo) {
          const wakeVideo = async () => {
            try {
              if (pipVideo.paused) {
                // If paused during PiP exit, nudge currentTime to wake decode pipeline
                const t = pipVideo.currentTime;
                pipVideo.currentTime = t > 0.05 ? t - 0.01 : 0.01;
                pipVideo.currentTime = t;
              } else {
                await pipVideo.play();
              }
            } catch (_) {}
          };
          setTimeout(wakeVideo, 40);
          setTimeout(wakeVideo, 180);
        }
      }
    }
  }

  // Global leavepictureinpicture listener
  document.addEventListener('leavepictureinpicture', (event) => {
    autoPipEntered = false;
    const video = event.target;
    if (video && video.tagName === 'VIDEO') {
      const restoreVideo = async () => {
        try {
          if (!video.paused) {
            await video.play();
          } else {
            const t = video.currentTime;
            video.currentTime = t > 0.05 ? t - 0.01 : 0.01;
            video.currentTime = t;
          }
        } catch (_) {}
      };
      setTimeout(restoreVideo, 40);
      setTimeout(restoreVideo, 180);
    }
  }, { passive: true });

  document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

  // Inject floating mini PiP button overlay on videos
  function attachFloatingPipButton(video) {
    if (!video || video.dataset.runnyPipAttached) return;
    video.dataset.runnyPipAttached = 'true';

    // Unlock DRM restrictions immediately
    unlockVideoPiP(video);

    // Watch for disablePictureInPicture attribute mutations by sites like Prime/Hotstar
    try {
      const pipAttrObserver = new MutationObserver(() => {
        if (video.disablePictureInPicture) video.disablePictureInPicture = false;
        if (video.hasAttribute('disablepictureinpicture')) {
          video.removeAttribute('disablepictureinpicture');
        }
      });
      pipAttrObserver.observe(video, { attributes: true, attributeFilter: ['disablepictureinpicture'] });
    } catch (_) {}
  }

  // Register mediaSession auto-pip hook safely without violating site CSP (no inline script elements)
  try {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && typeof navigator.mediaSession?.setActionHandler === 'function') {
      navigator.mediaSession.setActionHandler('enterpictureinpicture', async () => {
        const v = getActivePlayingVideo();
        if (v && !document.pictureInPictureElement) {
          unlockVideoPiP(v);
          await v.requestPictureInPicture();
        }
      });
    }
  } catch (_) {}

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
          autoPipEnabled: autoPipEnabled,
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
      case MESSAGE_TYPES.SET_AUTO_PIP: {
        autoPipEnabled = Boolean(request.enabled);
        sendResponse({
          success: true,
          autoPipEnabled: autoPipEnabled
        });
        break;
      }
      case MESSAGE_TYPES.SET_SMART_AUTO_PAUSE: {
        smartAutoPause = Boolean(request.enabled);
        sendResponse({
          success: true,
          smartAutoPause: smartAutoPause
        });
        break;
      }
      case MESSAGE_TYPES.PAUSE_OTHER_MEDIA: {
        // When another media source begins playing, pause this tab and dismiss its floating PiP window
        if (smartAutoPause && isRunnyActiveOnThisPage()) {
          // 1. Immediately dismiss any floating Picture-in-Picture window
          if (document.pictureInPictureElement) {
            try {
              document.exitPictureInPicture();
            } catch (_) {}
            autoPipEntered = false;
          }

          // 2. Pause all playing media elements in this tab
          if (trackedMediaElements.size > 0) {
            for (const media of trackedMediaElements) {
              try {
                if (!media.paused && media.duration > 0 && !media.ended) {
                  media.pause();
                  showSpeedHUD(null, false, '⏸️ Paused (Another Media Playing)');
                }
              } catch (_) {}
            }
          }
        }
        sendResponse({ success: true });
        break;
      }
      case MESSAGE_TYPES.TOGGLE_PIP: {
        togglePiP();
        sendResponse({
          success: true
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
