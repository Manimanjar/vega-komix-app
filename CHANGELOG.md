# Changelog

All notable changes to the **Vega Komix** app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [6.0.0] - 2026-11-15

### 🚀 Major Release: Vega Komix v6.0.0 (Master Release)
- **Version:** `6.0.0`
- **Version Code:** `300`
- **Release Date:** November 15, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Added

#### ⚡ 4-Mode Turbo Comic Reader Engine
- **Continuous Webtoon Strip Mode:**
  - Auto-height calculation based on natural image aspect ratio (`screenWidth * (naturalHeight / naturalWidth)`).
  - Full-bleed edge-to-edge rendering (`width: screenWidth`) eliminating horizontal pillarboxing and vertical image squishing.
- **Paged Reading Modes:**
  - **Manga Mode (Right-to-Left):** Standard Japanese comic page turning with smooth horizontal virtualization.
  - **Comic Mode (Left-to-Right):** Western graphic novel page turning.
  - **Double-Page Spread:** Side-by-side landscape dual-page display for tablets and foldable screens.
- **Worklet Crash Elimination:**
  - Added `.runOnJS(true)` to all Reanimated gesture callbacks.
  - Introduced native, touch-transparent `<Pressable>` edge tap zones (22% screen width left/right) for crash-free instant page navigation.
- **Reading Controls & AMOLED Canvas:**
  - True `#000000` AMOLED Black canvas option for maximum battery efficiency.
  - Auto page advance timer with customizable intervals.
  - Volume hardware button navigation.
  - Keep-screen-awake toggle.
  - Sliding 8-page turbo preloader with off-screen bitmap memory unmounting.

#### 🤖 Zero-Key AI Speech Bubble Live Translation
- **On-Device OCR:** Local, off-thread Japanese (Kanji/Kana) and Korean (Hangul) character recognition.
- **Spatial Bubble Clustering:**
  - Vertical RTL column grouping for Japanese manga dialogue.
  - Horizontal row grouping for Korean manhwa and Western comics.
- **Zero-Key Neural Translation:**
  - Direct literary translation without mandatory paid API keys or cloud configurations.
  - Support for optional custom OpenAI / Anthropic-compatible endpoints.
- **Visual Bubble Overlay:** High-contrast text overlays matching original bubble geometry.

#### 🌐 6 Production Comic Providers
- **MangaDex:** High-resolution `.512.jpg` covers and chapter streams with metadata caching.
- **8Muses:** Dedicated comic reader integration.
- **AllPornComic:** Madara engine scraper with AJAX chapter discovery and single-gallery fallback.
- **NovelCrow:** Fast manhwa & comic chapters with WAF auto-solver.
- **ComicsValley:** High-speed comic catalog with native single-file gallery scraping.
- **Hentaiser:** High-performance v1 REST API integration directly from app repository.
- **Dynamic Domain Auto-Resolver:** Automatically detects dead or ISP-blocked provider domains and hot-swaps to working mirror pools in real time.

#### 🛡️ Complete Network & Anti-Censorship Bypass Suite
- **Cloudflare WARP VPN:** Built-in WARP engine for unblocking restricted CDNs.
- **ByeDPI Engine:** Deep packet inspection evasion for ISP-level SNI blocks.
- **DNS over HTTPS (DoH):** Cloudflare 1.1.1.1, Google, AdGuard, and custom DoH resolvers.
- **Cloudflare WAF WebView Bypass:** Integrated headless browser challenge solver.
- **Cookie Manager:** Clearance cookie storage and cache manager.

#### 📥 Offline CBZ Downloader & Local Archive Reader
- Multi-chapter parallel image downloading with retry guards.
- Automatic compression into industry-standard `.cbz` comic book archives.
- Built-in Local Content manager to browse, read, and organize downloaded `.cbz` files offline.

---

### Changed
- **Rebuilt Settings Menu:** Completely removed legacy video player options (VLC/MX Player, video playback speed, subtitle styling, audio tracks, double-tap 10s seek).
- **Added Dedicated Reader & Page Settings:** Fully working MMKV-persisted controls for Reading Mode, Page Fit, AMOLED canvas, tap zones, and preloading.
- **Replaced Preferences:** Added dedicated controls for AI Live Translation, Domain Mirror Scanners, and Chapter Deduplication.
- **Replaced Data Management:** Cleaned up to focus on Comic Downloads, CBZ storage, image cache, and reading history.
- **Updated About Screen:** Displays version `v6.0.0 (Build 300)`, release date `November 15, 2026`, architecture target, and interactive in-app changelog modal.

---

### Fixed
- Fixed fatal native UI-thread crash (`Vega Komix keeps stopping`) caused by Reanimated worklet callbacks invoking JS state setters without `.runOnJS(true)`.
- Fixed ComicThumbnail fallback issue where valid MangaDex covers (`uploads.mangadex.org/covers/...`) were blocked by cross-origin `Referer` headers on initial load.
- Fixed Info screen Action Buttons (`Start Reading`, `Library`, `WebView`) having invisible/unreadable text by applying high-contrast Material 3 theming.
- Fixed chapter list row alignment with explicit `justifyContent: 'space-between'`.
- Fixed webtoon page squishing by computing height dynamically from natural dimensions instead of locking to viewport height.
