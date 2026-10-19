/**
 * Runny - Content Script
 * Runs in the context of web pages and embedded iframes.
 * Intercepts media elements, detects music tracks, and enforces target playback rate.
 */

(() => {
  // Prevent duplicate execution if already injected in the same context
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
  let hudTimeout = null;

  // Safe speed clamping
  function clampSpeed(val) {
    const num = parseFloat(val);
    if (isNaN(num)) return SPEED_LIMITS.DEFAULT;
    return Math.round(Math.min(SPEED_LIMITS.MAX, Math.max(SPEED_LIMITS.MIN, num)) * 100) / 100;
  }

  // Initial configuration load from storage
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

  // Storage listener for cross-tab synchronization
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

  /**
   * Displays the on-screen display (HUD) badge
   * @param {number|string} speedText
   * @param {boolean} [isMusic=false]
   */
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
   * Analyzes page context and active media to detect music
   * @returns {boolean}
   */
  function checkIsMusic() {
    const host = window.location.hostname.toLowerCase();

    // 1. Dedicated streaming platforms
    if (MUSIC_DOMAINS.some(domain => host.includes(domain))) {
      return true;
    }

    // 2. Pure audio playback (e.g. podcast players, sound feeds)
    const audios = document.querySelectorAll('audio');
    const videos = document.querySelectorAll('video');
    const hasActiveAudio = Array.from(audios).some(a => !a.paused && a.duration > 0);
    const hasActiveVideo = Array.from(videos).some(v => !v.paused && v.duration > 0);
    if (hasActiveAudio && !hasActiveVideo) {
      return true;
    }

    // 3. YouTube specific metadata & channel verification
    if (host.includes('youtube.com')) {
      // Inline player response checks
      try {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent;
          if (text && text.includes('ytInitialPlayerResponse')) {
            if (/"category"\s*:\s*"Music"/i.test(text) || /"categoryId"\s*:\s*"10"/.test(text)) {
              return true;
            }
          }
        }
      } catch (_) {}

      // Genre metadata
      try {
        const metaGenre = document.querySelector('meta[itemprop="genre"]');
        if (metaGenre?.content?.toLowerCase().includes('music')) {
          return true;
        }
      } catch (_) {}

      // Channel identity (Topic channels / VEVO / Artist notes)
      try {
        const channelOwner = document.querySelector('#owner-name, #channel-name, ytd-channel-name');
        if (channelOwner?.textContent) {
          const name = channelOwner.textContent.trim().toLowerCase();
          if (name.endsWith('- topic') || name.includes('vevo')) {
            return true;
          }
        }

        // Official artist musical note badge
        if (document.querySelector('path[d*="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21"]')) {
          return true;
        }
      } catch (_) {}

      // Description badges
      try {
        const musicSection = document.querySelector('ytd-metadata-row-container-renderer');
        if (musicSection?.textContent?.toLowerCase().includes('music')) {
          return true;
        }

        const badges = document.querySelectorAll('ytd-badge-supported-renderer, yt-formatted-string');
        for (const badge of badges) {
          const text = badge.textContent.trim().toLowerCase();
          if (text === 'music' || text === 'official music video') {
            return true;
          }
        }
      } catch (_) {}
    }

    // 4. MediaSession metadata tags
    if ('mediaSession' in navigator && navigator.mediaSession.metadata?.album) {
      return true;
    }

    return false;
  }

  /**
   * Calculates the target speed based on bypass state and media type
   * @returns {number}
   */
  function getEffectiveSpeed() {
    if (smartMusicBypass && isCurrentMediaMusic) {
      return SPEED_LIMITS.NORMAL;
    }
    return activeSpeed || defaultSpeed || SPEED_LIMITS.NORMAL;
  }

  /**
   * Applies the speed and pitch preservation to an HTMLMediaElement
   * @param {HTMLMediaElement} media
   */
  function applySpeedToMedia(media) {
    if (!media) return;
    const target = getEffectiveSpeed();

    // Standardize pitch correction across all browser engines
    if ('preservesPitch' in media && media.preservesPitch !== true) {
      media.preservesPitch = true;
    }
    if ('webkitPreservesPitch' in media && media.webkitPreservesPitch !== true) {
      media.webkitPreservesPitch = true;
    }
    if ('mozPreservesPitch' in media && media.mozPreservesPitch !== true) {
      media.mozPreservesPitch = true;
    }

    if (media.playbackRate !== target) {
      media.playbackRate = target;
    }
  }

  /**
   * Recursively finds all media elements, including inside Shadow DOMs
   * @param {Document|ShadowRoot} root
   * @returns {HTMLMediaElement[]}
   */
  function getAllMediaElements(root = document) {
    const elements = [];
    const standardMedia = root.querySelectorAll('video, audio');
    standardMedia.forEach(el => elements.push(el));

    const allNodes = root.querySelectorAll('*');
    allNodes.forEach(node => {
      if (node.shadowRoot) {
        elements.push(...getAllMediaElements(node.shadowRoot));
      }
    });

    return elements;
  }

  /**
   * Re-evaluates media type and applies speed to all active players
   * @param {boolean} [showFeedback=false]
   */
  function evaluateAndApplySpeed(showFeedback = false) {
    const wasMusic = isCurrentMediaMusic;
    isCurrentMediaMusic = checkIsMusic();
    const mediaElements = getAllMediaElements();
    mediaElements.forEach(applySpeedToMedia);

    if (showFeedback && mediaElements.length > 0) {
      showSpeedHUD(getEffectiveSpeed(), isCurrentMediaMusic);
    } else if (isCurrentMediaMusic !== wasMusic && mediaElements.length > 0) {
      showSpeedHUD(getEffectiveSpeed(), isCurrentMediaMusic);
    }

    // Broadcast status to popup if active
    try {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STATUS_UPDATE,
        isMusic: isCurrentMediaMusic,
        effectiveSpeed: getEffectiveSpeed(),
        activeSpeed: activeSpeed,
        smartMusicBypass: smartMusicBypass,
        mediaCount: mediaElements.length
      }).catch(() => {});
    } catch (_) {}
  }

  // MutationObserver to attach to dynamically inserted video/audio tags
  const observer = new MutationObserver(() => {
    const mediaElements = getAllMediaElements();
    mediaElements.forEach(element => {
      if (!element.__runny_hooked) {
        element.__runny_hooked = true;
        element.addEventListener('play', () => evaluateAndApplySpeed());
        element.addEventListener('loadedmetadata', () => evaluateAndApplySpeed());
        element.addEventListener('ratechange', () => {
          const target = getEffectiveSpeed();
          if (element.playbackRate !== target) {
            setTimeout(() => {
              if (element.playbackRate !== target) {
                element.playbackRate = target;
              }
            }, 60);
          }
        });
      }
      applySpeedToMedia(element);
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // SPA navigation events
  ['yt-navigate-finish', 'popstate', 'hashchange', 'locationchange'].forEach(evt => {
    window.addEventListener(evt, () => {
      setTimeout(evaluateAndApplySpeed, 300);
      setTimeout(evaluateAndApplySpeed, 1200);
    });
  });

  // Message router for popup and background actions
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case MESSAGE_TYPES.GET_STATUS: {
        isCurrentMediaMusic = checkIsMusic();
        const mediaList = getAllMediaElements();
        sendResponse({
          isMusic: isCurrentMediaMusic,
          effectiveSpeed: getEffectiveSpeed(),
          activeSpeed: activeSpeed,
          smartMusicBypass: smartMusicBypass,
          mediaCount: mediaList.length
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

  // Periodic heartbeat to counter external playback rate overrides
  setInterval(() => {
    const mediaList = getAllMediaElements();
    if (mediaList.length > 0) {
      const musicCheck = checkIsMusic();
      if (musicCheck !== isCurrentMediaMusic) {
        isCurrentMediaMusic = musicCheck;
      }
      const target = getEffectiveSpeed();
      mediaList.forEach(m => {
        if (m.playbackRate !== target) {
          m.playbackRate = target;
        }
      });
    }
  }, 1500);

  // Initial pass
  setTimeout(evaluateAndApplySpeed, 500);
})();
