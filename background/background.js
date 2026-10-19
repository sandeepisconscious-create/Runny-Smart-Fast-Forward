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
    STORAGE_KEYS.SMART_MUSIC_BYPASS
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

    if (Object.keys(defaults).length > 0) {
      chrome.storage.sync.set(defaults);
    }
  });
});

// Handle registered keyboard commands
chrome.commands.onCommand.addListener((command) => {
  chrome.storage.sync.get([STORAGE_KEYS.CURRENT_SPEED, STORAGE_KEYS.DEFAULT_SPEED], (data) => {
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
