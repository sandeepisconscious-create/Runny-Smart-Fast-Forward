document.addEventListener('DOMContentLoaded', () => {
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

  let currentSpeed = 1.25;
  let defaultSpeed = 1.25;
  let smartMusicBypass = true;

  // Format number cleanly
  function formatSpeed(val) {
    return parseFloat(val).toFixed(val % 1 === 0 ? 1 : 2).replace(/\.?0+$/, '') + '×';
  }

  // Update UI active buttons & default pip
  function updateSpeedUI(speed) {
    speedButtons.forEach((btn) => {
      const btnSpeed = parseFloat(btn.dataset.speed);
      if (Math.abs(btnSpeed - speed) < 0.01) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      if (Math.abs(btnSpeed - defaultSpeed) < 0.01) {
        btn.classList.add('is-default');
      } else {
        btn.classList.remove('is-default');
      }
    });

    speedSlider.value = speed;
    customSpeedVal.textContent = `${speed}×`;
  }

  function updateDefaultHint(speed) {
    defaultSpeedHint.textContent = `Current default: ${speed}×`;
  }

  // Load stored settings
  chrome.storage.sync.get(['currentSpeed', 'defaultSpeed', 'smartMusicBypass'], (data) => {
    if (data.currentSpeed !== undefined) {
      currentSpeed = parseFloat(data.currentSpeed);
    }
    if (data.defaultSpeed !== undefined) {
      defaultSpeed = parseFloat(data.defaultSpeed);
    }
    if (data.smartMusicBypass !== undefined) {
      smartMusicBypass = data.smartMusicBypass;
      musicBypassToggle.checked = smartMusicBypass;
    }
    updateSpeedUI(currentSpeed);
    updateDefaultHint(defaultSpeed);
  });

  // Query active tab state
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0 || !tabs[0].url || tabs[0].url.startsWith('chrome://')) {
      statusLabel.textContent = 'Standby';
      statusBadge.style.opacity = '0.6';
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_RUNNY_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        statusLabel.textContent = `${currentSpeed}× Ready`;
        return;
      }
      handleStatusResponse(response);
    });
  });

  function handleStatusResponse(response) {
    if (response.isMusic && smartMusicBypass) {
      statusLabel.textContent = 'Music (1.0×)';
      musicNotice.classList.add('music-active');
      infoTitle.textContent = 'Music Playing';
      infoDesc.textContent = 'Speed is locked to 1.0× for optimal listening.';
    } else {
      statusLabel.textContent = `${response.effectiveSpeed || currentSpeed}× Active`;
      musicNotice.classList.remove('music-active');
      infoTitle.textContent = 'Smart Music Protection';
      infoDesc.textContent = smartMusicBypass 
        ? 'Speed resets to 1.0× automatically when music is playing.' 
        : 'Music protection is currently disabled.';
    }
  }

  function applySpeed(newSpeed, showBadge = true) {
    currentSpeed = Math.round(newSpeed * 100) / 100;
    updateSpeedUI(currentSpeed);

    chrome.storage.sync.set({ currentSpeed: currentSpeed });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_SPEED',
          speed: currentSpeed,
          showBadge: showBadge
        }, (res) => {
          if (res && res.effectiveSpeed) {
            statusLabel.textContent = `${res.effectiveSpeed}× Active`;
          }
        });
      }
    });
  }

  // Handle preset speed button clicks
  speedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      applySpeed(parseFloat(btn.dataset.speed));
    });
  });

  // Handle fine-tune slider
  speedSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    customSpeedVal.textContent = `${val}×`;
  });

  speedSlider.addEventListener('change', (e) => {
    applySpeed(parseFloat(e.target.value));
  });

  // Handle +/- steppers (0.1x steps)
  stepUpBtn.addEventListener('click', () => {
    applySpeed(Math.min(3.0, currentSpeed + 0.1));
  });

  stepDownBtn.addEventListener('click', () => {
    applySpeed(Math.max(0.5, currentSpeed - 0.1));
  });

  // Handle Music Bypass Toggle
  musicBypassToggle.addEventListener('change', (e) => {
    smartMusicBypass = e.target.checked;
    chrome.storage.sync.set({ smartMusicBypass: smartMusicBypass });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_MUSIC_BYPASS',
          enabled: smartMusicBypass
        }, () => {
          // Re-fetch status
          chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_RUNNY_STATUS' }, handleStatusResponse);
        });
      }
    });
  });

  // Handle setting current selection as default
  makeDefaultBtn.addEventListener('click', () => {
    defaultSpeed = currentSpeed;
    chrome.storage.sync.set({ defaultSpeed: defaultSpeed }, () => {
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
});
