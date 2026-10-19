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
   * On-Screen Display (OSD) HUD Badge
   */
  let hudTimeout = null;
  function showSpeedHUD(speedText, isMusic = false) {
    let hud = document.getElementById('runny-speed-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'runny-speed-hud';
      hud.style.position = 'fixed';
      hud.style.top = '24px';
      hud.style.right = '24px';
      hud.style.zIndex = '2147483647';
      hud.style.backgroundColor = 'rgba(9, 9, 11, 0.88)';
      hud.style.color = '#ffffff';
      hud.style.border = '1px solid #3f3f46';
      hud.style.borderRadius = '8px';
      hud.style.padding = '8px 14px';
      hud.style.fontSize = '14px';
      hud.style.fontWeight = '700';
      hud.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      hud.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
      hud.style.backdropFilter = 'blur(8px)';
      hud.style.pointerEvents = 'none';
      hud.style.transition = 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
      document.body.appendChild(hud);
    }

    hud.textContent = isMusic ? `🎵 Music Detected (1.0×)` : `⚡ ${speedText}×`;
    hud.style.opacity = '1';
    hud.style.transform = 'translateY(0px)';

    if (hudTimeout) clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
      hud.style.opacity = '0';
      hud.style.transform = 'translateY(-6px)';
    }, 1200);
  }

  /**
   * Universal Music Detection:
   * 1. Music streaming domains
   * 2. Standalone <audio> playback
   * 3. YouTube specific metadata, categories, Topic channels, and artist badges
   * 4. MediaSession metadata
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

    // 2. Pure <audio> playback detection (audio playing, no video)
    const audios = document.querySelectorAll('audio');
    const videos = document.querySelectorAll('video');
    const hasActiveAudio = Array.from(audios).some(a => !a.paused && a.duration > 0);
    const hasActiveVideo = Array.from(videos).some(v => !v.paused && v.duration > 0);

    if (hasActiveAudio && !hasActiveVideo) {
      return true;
    }

    // 3. YouTube-specific deep checks
    if (host.includes('youtube.com')) {
      // Script payload checks (categoryId 10 / category: "Music")
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

      // Topic channel detection (e.g. "Artist Name - Topic") & Official Artist badges
      try {
        const channelOwner = document.querySelector('#owner-name, #channel-name, ytd-channel-name');
        if (channelOwner && channelOwner.textContent) {
          const channelText = channelOwner.textContent.trim().toLowerCase();
          if (channelText.endsWith('- topic') || channelText.includes('vevo')) {
            return true;
          }
        }

        // Official artist channel badge (music note icon on YouTube)
        const artistBadges = document.querySelectorAll('path[d*="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21"]');
        if (artistBadges.length > 0) {
          return true;
        }
      } catch (_) {}

      // Description badges & "Music in this video" sections
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

    // 4. Navigator MediaSession API (album tag presence)
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

    // YouTube-standard pitch preservation (keeps voices natural, prevents chipmunk distortion)
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

  // Get all media elements in the document including shadow roots
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

    // Broadcast status to popup
    try {
      chrome.runtime.sendMessage({
        type: 'RUNNY_STATUS_UPDATE',
        isMusic: isCurrentMediaMusic,
        effectiveSpeed: getEffectiveSpeed(),
        activeSpeed: activeSpeed,
        smartMusicBypass: smartMusicBypass,
        mediaCount: mediaElements.length
      }).catch(() => {});
    } catch (_) {}
  }

  // Observe dynamic additions & shadow DOM players
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

  // SPA navigation handling
  ['yt-navigate-finish', 'popstate', 'hashchange', 'locationchange'].forEach(evt => {
    window.addEventListener(evt, () => {
      setTimeout(evaluateAndApplySpeed, 300);
      setTimeout(evaluateAndApplySpeed, 1200);
    });
  });

  // Handle messages from popup & background keyboard shortcuts
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_RUNNY_STATUS') {
      isCurrentMediaMusic = checkIsMusic();
      const mediaList = getAllMediaElements();
      sendResponse({
        isMusic: isCurrentMediaMusic,
        effectiveSpeed: getEffectiveSpeed(),
        activeSpeed: activeSpeed,
        smartMusicBypass: smartMusicBypass,
        mediaCount: mediaList.length
      });
    } else if (request.type === 'SET_SPEED') {
      activeSpeed = parseFloat(request.speed);
      evaluateAndApplySpeed(request.showBadge || false);
      sendResponse({
        success: true,
        effectiveSpeed: getEffectiveSpeed()
      });
    } else if (request.type === 'SET_MUSIC_BYPASS') {
      smartMusicBypass = Boolean(request.enabled);
      evaluateAndApplySpeed(true);
      sendResponse({
        success: true,
        smartMusicBypass: smartMusicBypass
      });
    }
    return true;
  });

  // Periodic rate guard
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

  // Initial scan
  setTimeout(evaluateAndApplySpeed, 500);
})();
