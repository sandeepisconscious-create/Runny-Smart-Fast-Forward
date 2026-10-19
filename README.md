<div align="center">

  <img src="icons/logo.png" alt="Runny Logo" width="128" />

  # Runny — Smart Media & Fast Forward

  **The intelligent media controller that auto-fast-forwards lectures, seamlessly manages multi-tab media & picture-in-picture, and never ruins your music.**

  <p align="center">
    <a href="https://github.com/sandeepisconscious-create/Runny-Smart-Fast-Forward/archive/refs/heads/main.zip">
      <img src="https://img.shields.io/badge/Download-Extension%20(.ZIP)-0070F3?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Download Extension" height="42" />
    </a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Manifest-V3-white?style=flat-square&color=18181b" alt="Manifest V3" />
    <img src="https://img.shields.io/badge/Platform-Universal%20HTML5-white?style=flat-square&color=18181b" alt="Universal HTML5" />
    <img src="https://img.shields.io/badge/License-MIT-white?style=flat-square&color=18181b" alt="MIT License" />
  </p>

</div>

---

## ⚡ The Problems with Modern Web Video

1. **Repetitive Speed Adjustment**: You watch educational content, tutorials, and interviews faster to save time, but have to manually adjust player speed on every single page.
2. **Music Distortion**: Generic speed tools blindly accelerate everything. When a music video or track plays, it sounds like a chipmunk and ruins the listening experience.
3. **Tab Audio Clashing**: You're watching a video on YouTube or Hotstar, open another media tab, and both media sources play audio at the same time on top of each other.
4. **Clunky Picture-in-Picture**: Switching tabs either interrupts playback or leaves disconnected, oversized floating windows lingering when new media starts.

---

## 💡 The Solution: Meet Runny

**Runny** is a lightweight, zero-bloat Chrome extension that acts as your intelligent media companion across **every video and audio player on the web**:

- **Set It Once, Accelerated Everywhere**: Choose your preferred speed (1.25×, 1.5×, 2.0×, up to 3.0×) and save it as your default. Videos automatically launch at your speed.
- **Deep Smart Music Protection**: Runny analyzes metadata, channel artist badges, record labels, and title patterns. When a song plays (across Spotify, YouTube, SoundCloud, or OTT), Runny automatically preserves it at natural 1.0×.
- **Smart Multi-Media Coordinator**: When multiple tabs play media (e.g. YouTube & JioHotstar), Runny automatically pauses previous tabs and dismisses existing floating PiP windows so two audio sources never fight.
- **DRM-Unblocked Picture-in-Picture**: Bypasses `disablePictureInPicture` locks on OTT streaming platforms (JioHotstar, Prime Video, Netflix) and pops videos in/out of PiP seamlessly.
- **Natural Pitch Preservation**: Enforces native pitch-preservation so voices stay crisp, intelligible, and authentic without robotic distortion.

---

## ✨ Features

- **Global Fast Forward Toggle**: Master switch to turn the extension ON or completely OFF browser-wide with a single click.
- **Current Website Pause / Whitelist**: Easily pause Runny on specific sites (e.g. `youtube.com`, `hotstar.com`) while keeping it active everywhere else.
- **Smart Media Coordinator**: Prevents clashing audio by automatically pausing other background video tabs when a new media source begins playing.
- **Auto Picture-in-Picture (PiP)**:
  - Automatically pops video into PiP on tab switch and seamlessly restores the player back into the page when returning.
  - Automatically closes and dismisses floating PiP windows when a new media source is played.
- **Global Keyboard Shortcuts**:
  - `Alt + Shift + Right` (or `Option + Shift + Right` on Mac): Speed up (+0.25x)
  - `Alt + Shift + Left` (or `Option + Shift + Left` on Mac): Slow down (-0.25x)
  - `Alt + Shift + Down` (or `Option + Shift + Down` on Mac): Reset to 1.0x / default
  - `Alt + P` (or `Option + P` on Mac): Instant Picture-in-Picture toggle from any tab or app
- **Monochromatic Minimal Dark UI**: Sleek, distraction-free interface (`#09090b` palette) crafted for modern dark mode aesthetics.
- **Privacy-First & 100% Free**: Zero tracking, zero analytics, zero external network requests. All logic executes locally in your browser.

---

## 🚀 How to Install (Takes 30 Seconds)

1. Click the **[Download Extension (.ZIP)](https://github.com/sandeepisconscious-create/Runny-Smart-Fast-Forward/archive/refs/heads/main.zip)** button above (or clone this repository).
2. Unzip the downloaded folder to a convenient location on your computer.
3. Open Google Chrome and go to:
   ```
   chrome://extensions
   ```
4. Enable **Developer mode** via the toggle switch in the top right corner.
5. Click the **Load unpacked** button in the top left.
6. Select the unzipped `Runny` folder.
7. Click the extension puzzle piece icon in Chrome, pin **Runny**, and you're good to go!

---

## 🛠️ Tech Stack

- **Manifest V3** (Latest Chrome Extension standard)
- **Vanilla JavaScript** (Zero dependencies, instant performance)
- **Native HTML5 Media API** (`playbackRate`, `preservesPitch`)
- **Chrome Storage API** (Instant cross-tab preference syncing)

---

## 📄 License & Credits

Created with ❤️ by **[Sandheep Rao](https://github.com/sandheeprao)**.

Licensed under the **[MIT License](LICENSE)**.
