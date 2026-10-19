(() => {
  let activeSpeed = 1.25;
  let defaultSpeed = 1.25;
  let smartMusicBypass = true;
  let isCurrentMediaMusic = false;

  // Load initial settings
  chrome.storage.sync.get(['currentSpeed', 'defaultSpeed', 'smartMusicBypass'], (data) => {
    if (data.currentSpeed !== undefined) activeSpeed = parseFloat(data.currentSpeed);
    if (data.defaultSpeed !== undefined) defaultSpeed = parseFloat(data.defaultSpeed);
    if (data.smartMusicBypass !== undefined) smartMusicBypass = data.smartMusicBypass;
    evaluateAndApplySpeed();
  });

  // Listen for storage changes across tabs
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (changes.currentSpeed) {
      activeSpeed = parseFloat(changes.currentSpeed.newValue);
    }
    if (changes.defaultSpeed) {
      defaultSpeed = parseFloat(changes.defaultSpeed.newValue);
    }
    if (changes.smartMusicBypass) {
      smartMusicBypass = changes.smartMusicBypass.newValue;
    }
    evaluateAndApplySpeed();
  });

  /**
   * Universal Music Detection:
   * 1. Music streaming domains (Spotify, SoundCloud, Apple Music, YouTube Music, Deezer, Tidal, Bandcamp, Pandora, Gaana, JioSaavn, etc.)
   * 2. Standalone <audio> elements (audio podcasts, music tracks)
   * 3. YouTube specific metadata & categories
   * 4. MediaSession metadata title/artist cues
   */
  function checkIsMusic() {
    const host = window.location.hostname.toLowerCase();

    // 1. Known music/audio platform domains
    const musicDomains = [
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
    if (musicDomains.some(d => host.includes(d))) {
      return true;
    }

    // 2. Pure <audio> playback detection (only audio elements playing, no visible video)
    const audios = document.querySelectorAll('audio');
    const videos = document.querySelectorAll('video');
    const hasActiveAudio = Array.from(audios).some(a => !a.paused && a.duration > 0);
    const hasActiveVideo = Array.from(videos).some(v => !v.paused && v.duration > 0);

    if (hasActiveAudio && !hasActiveVideo) {
      return true;
    }

    // 3. YouTube specific checks
    if (host.includes('youtube.com')) {
      // Script payload checks
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

      // Meta schema tag
      try {
        const metaGenre = document.querySelector('meta[itemprop="genre"]');
        if (metaGenre && metaGenre.content && metaGenre.content.toLowerCase().includes('music')) {
          return true;
        }
      } catch (_) {}

      // Description badges
      try {
        const musicSection = document.querySelector('ytd-metadata-row-container-renderer');
        if (musicSection && musicSection.textContent.toLowerCase().includes('music')) {
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

    // 4. Navigator MediaSession API (if page populates album / artist metadata)
    if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
      const meta = navigator.mediaSession.metadata;
      if (meta.album && meta.album.trim().length > 0) {
        return true;
      }
    }

    return false;
  }

  function getEffectiveSpeed() {
    if (smartMusicBypass && isCurrentMediaMusic) {
      return 1.0;
    }
    return activeSpeed || defaultSpeed || 1.0;
  }

  function applySpeedToMedia(element) {
    if (!element) return;
    const target = getEffectiveSpeed();

    // YouTube pitch preservation standard (prevents chipmunk distortion and maintains natural voice pitch)
    if ('preservesPitch' in element && element.preservesPitch !== true) {
      element.preservesPitch = true;
    }
    if ('webkitPreservesPitch' in element && element.webkitPreservesPitch !== true) {
      element.webkitPreservesPitch = true;
    }
    if ('mozPreservesPitch' in element && element.mozPreservesPitch !== true) {
      element.mozPreservesPitch = true;
    }

    if (element.playbackRate !== target) {
      element.playbackRate = target;
    }
  }

  // Get all media elements in the current frame / document (including shadow roots)
  function getAllMediaElements(root = document) {
    const elements = [];

    // Query standard video and audio elements
    const standardMedia = root.querySelectorAll('video, audio');
    standardMedia.forEach(el => elements.push(el));

    // Traverse shadow roots if present (e.g. custom video players like Vimeo, Netflix, VideoJS)
    const allNodes = root.querySelectorAll('*');
    allNodes.forEach(node => {
      if (node.shadowRoot) {
        elements.push(...getAllMediaElements(node.shadowRoot));
      }
    });

    return elements;
  }

  function evaluateAndApplySpeed() {
    isCurrentMediaMusic = checkIsMusic();
    const mediaElements = getAllMediaElements();
    mediaElements.forEach(applySpeedToMedia);

    // Send status back if popup is querying
    try {
      chrome.runtime.sendMessage({
        type: 'RUNNY_STATUS_UPDATE',
        isMusic: isCurrentMediaMusic,
        effectiveSpeed: getEffectiveSpeed(),
        activeSpeed: activeSpeed,
        mediaCount: mediaElements.length
      }).catch(() => {});
    } catch (_) {}
  }

  // Observer to catch dynamically created players / shadow DOMs
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

  // SPA navigation events (YouTube, Twitter/X, Reddit, Vimeo, Netflix, etc.)
  ['yt-navigate-finish', 'popstate', 'hashchange', 'locationchange'].forEach(evt => {
    window.addEventListener(evt, () => {
      setTimeout(evaluateAndApplySpeed, 300);
      setTimeout(evaluateAndApplySpeed, 1200);
    });
  });

  // Handle queries and speed change messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_RUNNY_STATUS') {
      isCurrentMediaMusic = checkIsMusic();
      const mediaList = getAllMediaElements();
      sendResponse({
        isMusic: isCurrentMediaMusic,
        effectiveSpeed: getEffectiveSpeed(),
        activeSpeed: activeSpeed,
        mediaCount: mediaList.length
      });
    } else if (request.type === 'SET_SPEED') {
      activeSpeed = parseFloat(request.speed);
      evaluateAndApplySpeed();
      sendResponse({
        success: true,
        effectiveSpeed: getEffectiveSpeed()
      });
    }
    return true;
  });

  // Periodic heartbeat to maintain correct rate and state
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
