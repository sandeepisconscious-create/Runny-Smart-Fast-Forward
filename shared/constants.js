/**
 * Runny - Shared Constants & Configuration
 * Provides centralized message keys, storage keys, and speed constraints.
 */

export const STORAGE_KEYS = {
  CURRENT_SPEED: 'currentSpeed',
  DEFAULT_SPEED: 'defaultSpeed',
  SMART_MUSIC_BYPASS: 'smartMusicBypass'
};

export const MESSAGE_TYPES = {
  GET_STATUS: 'GET_RUNNY_STATUS',
  SET_SPEED: 'SET_SPEED',
  SET_MUSIC_BYPASS: 'SET_MUSIC_BYPASS',
  STATUS_UPDATE: 'RUNNY_STATUS_UPDATE'
};

export const SPEED_LIMITS = {
  MIN: 0.25,
  MAX: 4.0,
  SLIDER_MIN: 0.5,
  SLIDER_MAX: 3.0,
  STEP_LARGE: 0.25,
  STEP_FINE: 0.1,
  DEFAULT: 1.25,
  NORMAL: 1.0
};

export const STANDARD_SPEED_PRESETS = [1.0, 1.25, 1.5, 1.75, 2.0];

export const MUSIC_DOMAINS = [
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

/**
 * Cleanly clamps and rounds a playback rate
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampSpeed(value, min = SPEED_LIMITS.MIN, max = SPEED_LIMITS.MAX) {
  const num = parseFloat(value);
  if (isNaN(num)) return SPEED_LIMITS.DEFAULT;
  const clamped = Math.min(max, Math.max(min, num));
  return Math.round(clamped * 100) / 100;
}

/**
 * Formats a speed number for presentation (e.g., 1 -> "1.0×", 1.25 -> "1.25×")
 * @param {number} speed
 * @returns {string}
 */
export function formatSpeedDisplay(speed) {
  const num = parseFloat(speed);
  if (isNaN(num)) return '1.0×';
  return `${num.toFixed(num % 1 === 0 ? 1 : 2).replace(/\.?0+$/, '')}×`;
}
