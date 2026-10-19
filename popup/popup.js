/**
 * Runny - Popup Controller
 * Manages master global & per-site activation, speed selection, settings persistence, and tab synchronization.
 */

document.addEventListener('DOMContentLoaded', () => {
  const {
    STORAGE_KEYS,
    MESSAGE_TYPES,
    SPEED_LIMITS,
    clampSpeed,
    formatSpeedDisplay
  } = window.RunnyShared;

  // Header & Status Indicators
  const statusBadge = document.getElementById('statusBadge');
  const statusLabel = document.getElementById('statusLabel');

  // Master Control DOM Elements
  const globalPowerBtn = document.getElementById('globalPowerBtn');
  const globalStateText = document.getElementById('globalStateText');
  const globalSubText = document.getElementById('globalSubText');
  const domainNameText = document.getElementById('domainNameText');
  const domainToggle = document.getElementById('domainToggle');
  const domainStateText = document.getElementById('domainStateText');
  const speedControlsContainer = document.getElementById('speedControlsContainer');

  // Speed Controls DOM Elements
  const speedButtons = document.querySelectorAll('.speed-btn');
  const speedSlider = document.getElementById('speedSlider');
  const customSpeedVal = document.getElementById('customSpeedVal');
  const stepUpBtn = document.getElementById('stepUpBtn');
  const stepDownBtn = document.getElementById('stepDownBtn');
  const makeDefaultBtn = document.getElementById('makeDefaultBtn');
  const defaultSpeedHint = document.getElementById('defaultSpeedHint');
  const musicBypassToggle = document.getElementById('musicBypassToggle');
  const autoPipToggle = document.getElementById('autoPipToggle');
  const smartAutoPauseToggle = document.getElementById('smartAutoPauseToggle');
  const musicNotice = document.getElementById('musicNotice');

  // State
  let currentSpeed = SPEED_LIMITS.DEFAULT;
  let defaultSpeed = SPEED_LIMITS.DEFAULT;
  let smartMusicBypass = true;
  let isGloballyEnabled = true;
  let disabledDomains = [];
  let autoPipEnabled = true;
  let smartAutoPause = true;
  let currentTabDomain = '';
  let activeTabMediaCount = 0;
  let activeTabIsMusic = false;

  function extractDomain(url) {
    if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) {
      return '';
    }
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function isDomainDisabled(domain) {
    if (!domain) return false;
    return disabledDomains.some(d => domain === d || domain.endsWith('.' + d));
  }

  /**
   * Updates the visual status badge (Active vs Paused vs Disabled)
   */
  function updateStatusIndicator() {
    statusBadge.className = 'status-indicator';

    if (!isGloballyEnabled) {
      statusBadge.classList.add('state-off');
      statusLabel.textContent = 'Disabled';
      return;
    }

    if (!currentTabDomain) {
      statusBadge.classList.add('state-off');
      statusLabel.textContent = 'Standby';
      return;
    }

    if (isDomainDisabled(currentTabDomain)) {
      statusBadge.classList.add('state-paused');
      statusLabel.textContent = 'Paused';
      return;
    }

    if (activeTabIsMusic && smartMusicBypass) {
      statusBadge.classList.add('state-music');
      statusLabel.textContent = 'Music (1.0×)';
      return;
    }

    statusBadge.classList.add('state-active');
    statusLabel.textContent = `${formatSpeedDisplay(currentSpeed)} Active`;
  }

  /**
   * Syncs master switch UI states
   */
  function updateMasterControlsUI() {
    // Global Power Switch
    globalPowerBtn.classList.toggle('active', isGloballyEnabled);
    globalStateText.textContent = isGloballyEnabled ? 'ON' : 'OFF';
    globalStateText.classList.toggle('is-off', !isGloballyEnabled);
    globalSubText.textContent = isGloballyEnabled
      ? 'Active across all web players'
      : 'Extension is completely paused globally';

    // Domain Switch
    const siteAllowed = isGloballyEnabled && !isDomainDisabled(currentTabDomain);
    const domainIsConfiguredActive = !isDomainDisabled(currentTabDomain);

    if (currentTabDomain) {
      domainNameText.textContent = currentTabDomain;
      domainToggle.disabled = !isGloballyEnabled;
      domainToggle.checked = domainIsConfiguredActive;
      domainStateText.textContent = domainIsConfiguredActive ? 'ON' : 'PAUSED';
      domainStateText.classList.toggle('is-off', !domainIsConfiguredActive);
    } else {
      domainNameText.textContent = 'No active webpage';
      domainToggle.disabled = true;
      domainToggle.checked = false;
      domainStateText.textContent = 'OFF';
      domainStateText.classList.add('is-off');
    }

    // Dim speed adjustments if paused or disabled
    const canControlSpeed = isGloballyEnabled && !isDomainDisabled(currentTabDomain);
    speedControlsContainer.classList.toggle('is-disabled', !canControlSpeed);

    updateStatusIndicator();
  }

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

  function updateDefaultHint(speed) {
    if (defaultSpeedHint) {
      defaultSpeedHint.textContent = `Current default: ${formatSpeedDisplay(speed)}`;
    }
  }

  function handleStatusResponse(response) {
    if (!response) return;

    activeTabIsMusic = Boolean(response.isMusic);
    activeTabMediaCount = response.mediaCount || 0;

    if (response.currentDomain) {
      currentTabDomain = response.currentDomain;
    }

    if (activeTabIsMusic && smartMusicBypass && isGloballyEnabled && !isDomainDisabled(currentTabDomain)) {
      if (musicNotice) {
        musicNotice.style.display = 'flex';
        musicNotice.classList.add('music-active');
      }
    } else {
      if (musicNotice) {
        musicNotice.style.display = 'none';
        musicNotice.classList.remove('music-active');
      }
    }

    updateMasterControlsUI();
  }

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
        updateStatusIndicator();
      }
    });
  }

  // 1. Initialize from Storage
  chrome.storage.sync.get([
    STORAGE_KEYS.CURRENT_SPEED,
    STORAGE_KEYS.DEFAULT_SPEED,
    STORAGE_KEYS.SMART_MUSIC_BYPASS,
    STORAGE_KEYS.IS_GLOBALLY_ENABLED,
    STORAGE_KEYS.DISABLED_DOMAINS,
    STORAGE_KEYS.AUTO_PIP_ENABLED
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
    if (data[STORAGE_KEYS.IS_GLOBALLY_ENABLED] !== undefined) {
      isGloballyEnabled = Boolean(data[STORAGE_KEYS.IS_GLOBALLY_ENABLED]);
    }
    if (Array.isArray(data[STORAGE_KEYS.DISABLED_DOMAINS])) {
      disabledDomains = data[STORAGE_KEYS.DISABLED_DOMAINS].map(d => d.toLowerCase());
    }
    if (data[STORAGE_KEYS.AUTO_PIP_ENABLED] !== undefined) {
      autoPipEnabled = Boolean(data[STORAGE_KEYS.AUTO_PIP_ENABLED]);
      if (autoPipToggle) autoPipToggle.checked = autoPipEnabled;
    }
    if (data[STORAGE_KEYS.SMART_AUTO_PAUSE] !== undefined) {
      smartAutoPause = Boolean(data[STORAGE_KEYS.SMART_AUTO_PAUSE]);
      if (smartAutoPauseToggle) smartAutoPauseToggle.checked = smartAutoPause;
    }

    updateSpeedUI(currentSpeed);
    updateDefaultHint(defaultSpeed);
    updateMasterControlsUI();
  });

  // 2. Query Active Tab for Domain & Tab State
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab?.url) {
      currentTabDomain = extractDomain(activeTab.url);
    }

    updateMasterControlsUI();

    if (!activeTab?.id || !currentTabDomain) {
      return;
    }

    chrome.tabs.sendMessage(activeTab.id, { type: MESSAGE_TYPES.GET_STATUS }, (response) => {
      if (chrome.runtime.lastError || !response) {
        updateStatusIndicator();
        return;
      }
      handleStatusResponse(response);
    });
  });

  // 3. Global Master Switch Event
  globalPowerBtn.addEventListener('click', () => {
    isGloballyEnabled = !isGloballyEnabled;
    chrome.storage.sync.set({ [STORAGE_KEYS.IS_GLOBALLY_ENABLED]: isGloballyEnabled });

    updateMasterControlsUI();

    // Broadcast change to active tab
    sendToActiveTab({
      type: MESSAGE_TYPES.SET_GLOBAL_ACTIVE,
      enabled: isGloballyEnabled
    }, handleStatusResponse);
  });

  // 4. Current Domain Switch Event
  domainToggle.addEventListener('change', (e) => {
    if (!currentTabDomain) return;

    const shouldEnable = e.target.checked;
    if (shouldEnable) {
      // Remove from disabled list
      disabledDomains = disabledDomains.filter(d => d !== currentTabDomain);
    } else {
      // Add to disabled list
      if (!disabledDomains.includes(currentTabDomain)) {
        disabledDomains.push(currentTabDomain);
      }
    }

    chrome.storage.sync.set({ [STORAGE_KEYS.DISABLED_DOMAINS]: disabledDomains });
    updateMasterControlsUI();

    sendToActiveTab({
      type: MESSAGE_TYPES.SET_DOMAIN_ACTIVE,
      disabledDomains: disabledDomains
    }, handleStatusResponse);
  });

  // 5. Preset Button Events
  speedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      applySpeed(parseFloat(btn.dataset.speed));
    });
  });

  // 6. Custom Slider Events
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (customSpeedVal) customSpeedVal.textContent = formatSpeedDisplay(val);
    });

    speedSlider.addEventListener('change', (e) => {
      applySpeed(parseFloat(e.target.value));
    });
  }

  // 7. Stepper Events
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

  // 8. Music Bypass Toggle Event
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

  // 9. Auto Picture-in-Picture Toggle Event
  if (autoPipToggle) {
    autoPipToggle.addEventListener('change', (e) => {
      autoPipEnabled = e.target.checked;
      chrome.storage.sync.set({ [STORAGE_KEYS.AUTO_PIP_ENABLED]: autoPipEnabled });

      sendToActiveTab({
        type: MESSAGE_TYPES.SET_AUTO_PIP,
        enabled: autoPipEnabled
      });
    });
  }

  // 10. Smart Auto-Pause Toggle Event (Media Coordinator)
  if (smartAutoPauseToggle) {
    smartAutoPauseToggle.addEventListener('change', (e) => {
      smartAutoPause = e.target.checked;
      chrome.storage.sync.set({ [STORAGE_KEYS.SMART_AUTO_PAUSE]: smartAutoPause });

      sendToActiveTab({
        type: MESSAGE_TYPES.SET_SMART_AUTO_PAUSE,
        enabled: smartAutoPause
      });
    });
  }

  // 11. Save Default Button Event
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
