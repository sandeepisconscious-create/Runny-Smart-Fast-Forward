/**
 * Runny - Background Service Worker
 * Handles installation defaults, cross-tab syncing, and global keyboard shortcuts.
 */

// Use importScripts for standard, reliable ServiceWorker compatibility
importScripts('../shared/constants.js');

const { STORAGE_KEYS, SPEED_LIMITS, MESSAGE_TYPES, clampSpeed } = self.RunnyShared;

// Initialize defaults on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get([
    STORAGE_KEYS.DEFAULT_SPEED,
    STORAGE_KEYS.CURRENT_SPEED,
    STORAGE_KEYS.SMART_MUSIC_BYPASS,
    STORAGE_KEYS.IS_GLOBALLY_ENABLED,
    STORAGE_KEYS.DISABLED_DOMAINS
  ], (data) => {
    const defaults = {};
    if (data[STORAGE_KEYS.DEFAULT_SPEED] === undefined) {
      defaults[STORAGE_KEYS.DEFAULT_SPEED] = SPEED_LIMITS.DEFAULT;
    }
    if (data[STORAGE_KEYS.CURRENT_SPEED] === undefined) {
      defaults[STORAGE_KEYS.CURRENT_SPEED] = SPEED_LIMITS.DEFAULT;
    }
    if (data[STORAGE_KEYS.SMART_MUSIC_BYPASS] === undefined) {
      defaults[STORAGE_KEYS.SMART_MUSIC_BYPASS] = true;
    }
    if (data[STORAGE_KEYS.IS_GLOBALLY_ENABLED] === undefined) {
      defaults[STORAGE_KEYS.IS_GLOBALLY_ENABLED] = true;
    }
    if (!Array.isArray(data[STORAGE_KEYS.DISABLED_DOMAINS])) {
      defaults[STORAGE_KEYS.DISABLED_DOMAINS] = [];
    }
    if (data[STORAGE_KEYS.AUTO_PIP_ENABLED] === undefined) {
      defaults[STORAGE_KEYS.AUTO_PIP_ENABLED] = true;
    }

    if (Object.keys(defaults).length > 0) {
      chrome.storage.sync.set(defaults);
    }
  });
});

// Handle registered keyboard commands
chrome.commands.onCommand.addListener((command) => {
  chrome.storage.sync.get([
    STORAGE_KEYS.CURRENT_SPEED,
    STORAGE_KEYS.DEFAULT_SPEED,
    STORAGE_KEYS.IS_GLOBALLY_ENABLED
  ], (data) => {
    // If globally disabled, do not process shortcut speed changes
    if (data[STORAGE_KEYS.IS_GLOBALLY_ENABLED] === false) {
      return;
    }

    const fallbackSpeed = data[STORAGE_KEYS.DEFAULT_SPEED] ?? SPEED_LIMITS.DEFAULT;
    let speed = parseFloat(data[STORAGE_KEYS.CURRENT_SPEED] ?? fallbackSpeed);

    switch (command) {
      case 'increase-speed':
        speed = clampSpeed(speed + SPEED_LIMITS.STEP_LARGE);
        break;
      case 'decrease-speed':
        speed = clampSpeed(speed - SPEED_LIMITS.STEP_LARGE);
        break;
      case 'reset-speed':
        speed = (speed === SPEED_LIMITS.NORMAL) ? parseFloat(fallbackSpeed) : SPEED_LIMITS.NORMAL;
        break;
      case 'toggle-pip':
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (activeTab?.id) {
            chrome.tabs.sendMessage(activeTab.id, {
              type: MESSAGE_TYPES.TOGGLE_PIP
            }).catch(() => {});
          }
        });
        return;
      default:
        return;
    }

    chrome.storage.sync.set({ [STORAGE_KEYS.CURRENT_SPEED]: speed });

    // Notify the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: MESSAGE_TYPES.SET_SPEED,
          speed: speed,
          showBadge: true
        }).catch(() => {});
      }
    });
  });
});
