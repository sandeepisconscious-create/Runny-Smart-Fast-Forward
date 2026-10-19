<div align="center">

  <img src="icons/logo.png" alt="Runny Logo" width="128" />

  # Runny — Smart Fast Forward

  **The intelligent video accelerator that auto-fast-forwards your lectures, podcasts, and videos — but never ruins your music.**

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

## ⚡ The Problem: Video Speed Is Broken

We all watch content faster to save hours of time. But current solutions have two annoying problems:

1. **You have to manually adjust speed every single time.** You open a tutorial, an interview, or a lecture, click through settings, and toggle the speed. Close the tab, open another, repeat.
2. **Music gets ruined.** If you keep a generic speed controller on or change global speed, you suddenly click a song, an album, or a music video, and it plays at chipmunk speed, ruining the track.

## 💡 The Solution: Meet Runny

**Runny** is a lightweight, zero-bloat Chrome extension that sets your preferred playback speed across **every media player on the web**—and automatically drops down to standard 1.0× the second music starts playing.

- **Set it once, forget it**: Choose your sweet spot (1.25×, 1.5×, 1.75×, or 2.0×) and make it your default. Videos will automatically start at that speed.
- **Smart Music Protection**: Runny analyzes metadata, tags, audio channels, and streaming platforms (YouTube Music, Spotify, SoundCloud, Apple Music, and YouTube music categories). When music plays, Runny preserves the intended listening experience at 1.0×.
- **Zero Pitch Distortion**: Enforces native pitch-preservation algorithms so voices sound natural, crystal-clear, and intelligible—no unnatural pitch shifts or robotic artifacts.
- **Works Everywhere**: Not just YouTube. Works across Vimeo, Netflix, Twitter/X, Reddit, Coursera, Loom, embedded iframes, and custom HTML5 video players.

---

## ✨ Features

- **Global Fast Forward Toggle**: Master switch to turn the extension ON or completely OFF across your entire browser with a single click.
- **Current Website Pause**: Easily pause or whitelist specific sites (e.g. `youtube.com`, `coursera.org`) while keeping fast-forward active everywhere else.
- **Auto Picture-in-Picture**: Seamlessly pops active videos into a floating Picture-in-Picture window when switching away to another tab (e.g., ChatGPT, docs) and snaps back when returning. Includes a dedicated on/off toggle.
- **Dynamic Status Indicators**: Header indicator clearly displays whether Runny is **ACTIVE** (green dot), **PAUSED** on the current website (yellow dot), or **DISABLED** globally.
- **YouTube-Inspired Speeds**: Quick preset buttons for **1.0×**, **1.25×**, **1.5×**, **2.0×**, and **3.0×**.
- **Fine-Tune Custom Slider & Steppers**: Need **2.25×**, **2.5×**, or **0.85×**? Use the slider or `+` / `−` steppers to dial in custom speeds.
- **On-Screen Display (OSD HUD)**: A subtle, translucent badge displays on-screen whenever speed changes or music is detected so you never have to leave full-screen.
- **Global Keyboard Shortcuts**:
  - `Alt + Shift + Right` (or `Option + Shift + Right` on Mac): Speed up (+0.25x)
  - `Alt + Shift + Left` (or `Option + Shift + Left` on Mac): Slow down (-0.25x)
  - `Alt + Shift + Down` (or `Option + Shift + Down` on Mac): Reset to 1.0x / default
- **Visual Default Indicator**: A minimalist pip highlights your current default preset at a glance.
- **Music Protection Toggle**: Turn auto-music protection on or off with a switch.
- **Universal Player Compatibility**: Supports Shadow DOM players, embedded video iframes, and modern single-page apps (SPAs).
- **Monochromatic Minimal Dark UI**: Built with a sleek, distraction-free aesthetic that looks right at home in modern browsers.
- **Privacy-First & 100% Free**: No tracking, no external server calls, no telemetry. Everything runs locally in your browser.

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
