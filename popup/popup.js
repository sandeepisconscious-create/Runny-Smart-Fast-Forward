document.addEventListener('DOMContentLoaded', () => {
  const speedButtons = document.querySelectorAll('.speed-btn');
  const makeDefaultBtn = document.getElementById('makeDefaultBtn');
  const defaultSpeedHint = document.getElementById('defaultSpeedHint');
  const statusLabel = document.getElementById('statusLabel');
  const statusBadge = document.getElementById('statusBadge');
  const musicNotice = document.getElementById('musicNotice');
  const infoTitle = document.getElementById('infoTitle');
  const infoDesc = document.getElementById('infoDesc');

  let currentSpeed = 1.25;
  let defaultSpeed = 1.25;

  // Update UI active buttons
  function updateSpeedButtonsUI(speed) {
    speedButtons.forEach((btn) => {
      const btnSpeed = parseFloat(btn.dataset.speed);
      if (Math.abs(btnSpeed - speed) < 0.01) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function updateDefaultHint(speed) {
    defaultSpeedHint.textContent = `Current default: ${speed}×`;
  }

  // Load stored settings
  chrome.storage.sync.get(['currentSpeed', 'defaultSpeed'], (data) => {
    if (data.currentSpeed !== undefined) {
      currentSpeed = parseFloat(data.currentSpeed);
    }
    if (data.defaultSpeed !== undefined) {
      defaultSpeed = parseFloat(data.defaultSpeed);
    }
    updateSpeedButtonsUI(currentSpeed);
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
    if (response.isMusic) {
      statusLabel.textContent = 'Music (1.0×)';
      musicNotice.classList.add('music-active');
      infoTitle.textContent = 'Music Playing';
      infoDesc.textContent = 'Speed is locked to 1.0× for optimal listening.';
    } else {
      statusLabel.textContent = `${response.effectiveSpeed || currentSpeed}× Active`;
      musicNotice.classList.remove('music-active');
      infoTitle.textContent = 'Smart Music Protection';
      infoDesc.textContent = 'Speed resets to 1.0× automatically when music is playing.';
    }
  }

  // Handle clicking speed buttons
  speedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const selected = parseFloat(btn.dataset.speed);
      currentSpeed = selected;
      updateSpeedButtonsUI(selected);

      // Save to storage
      chrome.storage.sync.set({ currentSpeed: selected });

      // Notify active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_SPEED', speed: selected }, (res) => {
            if (res && res.effectiveSpeed) {
              statusLabel.textContent = `${res.effectiveSpeed}× Active`;
            }
          });
        }
      });
    });
  });

  // Handle setting current selection as default
  makeDefaultBtn.addEventListener('click', () => {
    defaultSpeed = currentSpeed;
    chrome.storage.sync.set({ defaultSpeed: defaultSpeed }, () => {
      updateDefaultHint(defaultSpeed);
      makeDefaultBtn.classList.add('saved');
      makeDefaultBtn.textContent = 'Saved!';
      setTimeout(() => {
        makeDefaultBtn.classList.remove('saved');
        makeDefaultBtn.textContent = 'Save Default';
      }, 1500);
    });
  });
});
