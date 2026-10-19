/**
 * Runny - Popup Controller
 * Manages speed selection, fine-tuning, settings persistence, and tab synchronization.
 */

import {
  STORAGE_KEYS,
  MESSAGE_TYPES,
  SPEED_LIMITS,
  clampSpeed,
  formatSpeedDisplay
} from '../shared/constants.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const speedButtons = document.querySelectorAll('.speed-btn');
  const speedSlider = document.getElementById('speedSlider');
  const customSpeedVal = document.getElementById('customSpeedVal');
  const stepUpBtn = document.getElementById('stepUpBtn');
  const stepDownBtn = document.getElementById('stepDownBtn');
  const makeDefaultBtn = document.getElementById('makeDefaultBtn');
  const defaultSpeedHint = document.getElementById('defaultSpeedHint');
  const musicBypassToggle = document.getElementById('musicBypassToggle');
  const statusLabel = document.getElementById('statusLabel');
  const statusBadge = document.getElementById('statusBadge');
  const musicNotice = document.getElementById('musicNotice');
  const infoTitle = document.getElementById('infoTitle');
  const infoDesc = document.getElementById('infoDesc');

  // State
  let currentSpeed = SPEED_LIMITS.DEFAULT;
  let defaultSpeed = SPEED_LIMITS.DEFAULT;
  let smartMusicBypass = true;

  /**
   * Updates visual states of buttons, slider, and default pips
   * @param {number} speed
   */
  function updateSpeedUI(speed) {
    speedButtons.forEach((btn) => {
      const btnSpeed = parseFloat(btn.dataset.speed);
      const isSelected = Math.abs(btnSpeed - speed) < 0.01;
      const isCurrentDefault = Math.abs(btnSpeed - defaultSpeed) < 0.01;

      btn.classList.toggle('active', isSelected);
      btn.classList.toggle('is-default', isCurrentDefault);
    });

    if (speedSlider) {
      speedSlider.value = speed;
    }
    if (customSpeedVal) {
      customSpeedVal.textContent = formatSpeedDisplay(speed);
    }
  }

  /**
   * Updates the default speed hint message
   * @param {number} speed
   */
  function updateDefaultHint(speed) {
    if (defaultSpeedHint) {
      defaultSpeedHint.textContent = `Current default: ${formatSpeedDisplay(speed)}`;
    }
  }

  /**
   * Updates music card and status badge based on tab response
   * @param {{ isMusic?: boolean, effectiveSpeed?: number }} response
   */
  function handleStatusResponse(response) {
    if (!response) return;

    if (response.isMusic && smartMusicBypass) {
      statusLabel.textContent = 'Music (1.0×)';
      musicNotice.classList.add('music-active');
      infoTitle.textContent = 'Music Playing';
      infoDesc.textContent = 'Speed is locked to 1.0× for optimal listening.';
    } else {
      const activeDisplay = response.effectiveSpeed ?? currentSpeed;
      statusLabel.textContent = `${formatSpeedDisplay(activeDisplay)} Active`;
      musicNotice.classList.remove('music-active');
      infoTitle.textContent = 'Smart Music Protection';
      infoDesc.textContent = smartMusicBypass
        ? 'Speed resets to 1.0× automatically when music is playing.'
        : 'Music protection is currently disabled.';
    }
  }

  /**
   * Dispatches a message to the active tab
   * @param {object} message
   * @param {(response: any) => void} [callback]
   */
  function sendToActiveTab(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id || activeTab.url?.startsWith('chrome://')) {
        return;
      }
      chrome.tabs.sendMessage(activeTab.id, message, (res) => {
        if (!chrome.runtime.lastError && callback) {
          callback(res);
        }
      });
    });
  }

  /**
   * Applies and saves a new playback speed
   * @param {number} rawSpeed
   * @param {boolean} [showBadge=true]
   */
  function applySpeed(rawSpeed, showBadge = true) {
    currentSpeed = clampSpeed(rawSpeed);
    updateSpeedUI(currentSpeed);

    chrome.storage.sync.set({ [STORAGE_KEYS.CURRENT_SPEED]: currentSpeed });

    sendToActiveTab({
      type: MESSAGE_TYPES.SET_SPEED,
      speed: currentSpeed,
      showBadge: showBadge
    }, (res) => {
      if (res?.effectiveSpeed) {
        statusLabel.textContent = `${formatSpeedDisplay(res.effectiveSpeed)} Active`;
      }
    });
  }

  // 1. Initialize from storage
  chrome.storage.sync.get([
    STORAGE_KEYS.CURRENT_SPEED,
    STORAGE_KEYS.DEFAULT_SPEED,
    STORAGE_KEYS.SMART_MUSIC_BYPASS
  ], (data) => {
    if (data[STORAGE_KEYS.CURRENT_SPEED] !== undefined) {
      currentSpeed = parseFloat(data[STORAGE_KEYS.CURRENT_SPEED]);
    }
    if (data[STORAGE_KEYS.DEFAULT_SPEED] !== undefined) {
      defaultSpeed = parseFloat(data[STORAGE_KEYS.DEFAULT_SPEED]);
    }
    if (data[STORAGE_KEYS.SMART_MUSIC_BYPASS] !== undefined) {
      smartMusicBypass = Boolean(data[STORAGE_KEYS.SMART_MUSIC_BYPASS]);
      if (musicBypassToggle) musicBypassToggle.checked = smartMusicBypass;
    }

    updateSpeedUI(currentSpeed);
    updateDefaultHint(defaultSpeed);
  });

  // 2. Query initial active tab status
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.url || activeTab.url.startsWith('chrome://')) {
      statusLabel.textContent = 'Standby';
      statusBadge.style.opacity = '0.6';
      return;
    }

    chrome.tabs.sendMessage(activeTab.id, { type: MESSAGE_TYPES.GET_STATUS }, (response) => {
      if (chrome.runtime.lastError || !response) {
        statusLabel.textContent = `${formatSpeedDisplay(currentSpeed)} Ready`;
        return;
      }
      handleStatusResponse(response);
    });
  });

  // 3. Preset button events
  speedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      applySpeed(parseFloat(btn.dataset.speed));
    });
  });

  // 4. Custom slider events
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (customSpeedVal) customSpeedVal.textContent = formatSpeedDisplay(val);
    });

    speedSlider.addEventListener('change', (e) => {
      applySpeed(parseFloat(e.target.value));
    });
  }

  // 5. Stepper events
  if (stepUpBtn) {
    stepUpBtn.addEventListener('click', () => {
      applySpeed(currentSpeed + SPEED_LIMITS.STEP_FINE);
    });
  }

  if (stepDownBtn) {
    stepDownBtn.addEventListener('click', () => {
      applySpeed(currentSpeed - SPEED_LIMITS.STEP_FINE);
    });
  }

  // 6. Music bypass toggle event
  if (musicBypassToggle) {
    musicBypassToggle.addEventListener('change', (e) => {
      smartMusicBypass = e.target.checked;
      chrome.storage.sync.set({ [STORAGE_KEYS.SMART_MUSIC_BYPASS]: smartMusicBypass });

      sendToActiveTab({
        type: MESSAGE_TYPES.SET_MUSIC_BYPASS,
        enabled: smartMusicBypass
      }, () => {
        sendToActiveTab({ type: MESSAGE_TYPES.GET_STATUS }, handleStatusResponse);
      });
    });
  }

  // 7. Save as default button event
  if (makeDefaultBtn) {
    makeDefaultBtn.addEventListener('click', () => {
      defaultSpeed = currentSpeed;
      chrome.storage.sync.set({ [STORAGE_KEYS.DEFAULT_SPEED]: defaultSpeed }, () => {
        updateDefaultHint(defaultSpeed);
        updateSpeedUI(currentSpeed);
        makeDefaultBtn.classList.add('saved');
        makeDefaultBtn.textContent = 'Saved!';
        setTimeout(() => {
          makeDefaultBtn.classList.remove('saved');
          makeDefaultBtn.textContent = 'Save Default';
        }, 1500);
      });
    });
  }
});
