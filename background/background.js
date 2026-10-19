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
