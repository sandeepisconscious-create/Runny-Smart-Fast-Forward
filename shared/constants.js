/**
 * Runny - Shared Constants & Configuration
 * Attached to self / global scope for 100% Chrome extension service worker & content script compatibility.
 */

(function (root) {
  const STORAGE_KEYS = {
    CURRENT_SPEED: 'currentSpeed',
    DEFAULT_SPEED: 'defaultSpeed',
    SMART_MUSIC_BYPASS: 'smartMusicBypass',
    IS_GLOBALLY_ENABLED: 'isGloballyEnabled',
    DISABLED_DOMAINS: 'disabledDomains',
    AUTO_PIP_ENABLED: 'autoPipEnabled'
  };

  const MESSAGE_TYPES = {
    GET_STATUS: 'GET_RUNNY_STATUS',
    SET_SPEED: 'SET_SPEED',
    SET_MUSIC_BYPASS: 'SET_MUSIC_BYPASS',
    SET_GLOBAL_ACTIVE: 'SET_GLOBAL_ACTIVE',
    SET_DOMAIN_ACTIVE: 'SET_DOMAIN_ACTIVE',
    SET_AUTO_PIP: 'SET_AUTO_PIP',
    TOGGLE_PIP: 'TOGGLE_PIP',
    STATUS_UPDATE: 'RUNNY_STATUS_UPDATE'
  };

  const SPEED_LIMITS = {
    MIN: 0.25,
    MAX: 4.0,
    SLIDER_MIN: 0.5,
    SLIDER_MAX: 3.0,
    STEP_LARGE: 0.25,
    STEP_FINE: 0.1,
    DEFAULT: 1.25,
    NORMAL: 1.0
  };

  const STANDARD_SPEED_PRESETS = [1.0, 1.25, 1.5, 2.0, 3.0];

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

  function clampSpeed(value, min = SPEED_LIMITS.MIN, max = SPEED_LIMITS.MAX) {
    const num = parseFloat(value);
    if (isNaN(num)) return SPEED_LIMITS.DEFAULT;
    const clamped = Math.min(max, Math.max(min, num));
    return Math.round(clamped * 100) / 100;
  }

  function formatSpeedDisplay(speed) {
    const num = parseFloat(speed);
    if (isNaN(num)) return '1.0×';
    return `${num.toFixed(num % 1 === 0 ? 1 : 2).replace(/\.?0+$/, '')}×`;
  }

  const RunnyShared = {
    STORAGE_KEYS,
    MESSAGE_TYPES,
    SPEED_LIMITS,
    STANDARD_SPEED_PRESETS,
    MUSIC_DOMAINS,
    clampSpeed,
    formatSpeedDisplay
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RunnyShared;
  } else {
    root.RunnyShared = RunnyShared;
  }
})(typeof self !== 'undefined' ? self : this);
