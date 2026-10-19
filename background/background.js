// Runny Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['defaultSpeed', 'currentSpeed', 'smartMusicBypass'], (data) => {
    const defaults = {};
    if (data.defaultSpeed === undefined) defaults.defaultSpeed = 1.25;
    if (data.currentSpeed === undefined) defaults.currentSpeed = 1.25;
    if (data.smartMusicBypass === undefined) defaults.smartMusicBypass = true;
    
    if (Object.keys(defaults).length > 0) {
      chrome.storage.sync.set(defaults);
    }
  });
});

// Handle global keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  chrome.storage.sync.get(['currentSpeed', 'defaultSpeed'], (data) => {
    let speed = parseFloat(data.currentSpeed || data.defaultSpeed || 1.25);

    if (command === 'increase-speed') {
      speed = Math.min(4.0, Math.round((speed + 0.25) * 100) / 100);
    } else if (command === 'decrease-speed') {
      speed = Math.max(0.25, Math.round((speed - 0.25) * 100) / 100);
    } else if (command === 'reset-speed') {
      speed = speed === 1.0 ? parseFloat(data.defaultSpeed || 1.25) : 1.0;
    }

    chrome.storage.sync.set({ currentSpeed: speed });

    // Broadcast to active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_SPEED',
          speed: speed,
          showBadge: true
        }).catch(() => {});
      }
    });
  });
});
