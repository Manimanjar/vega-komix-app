# Changelog

All notable changes to the **Vega Komix** app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [6.2.4] - 2026-11-26

### 🛠️ Reader HUD Stability, Auto-Hiding Page Pill, Slider Jump Fix & Edge-to-Edge Polish
- **Version:** `6.2.4`
- **Version Code:** `324`
- **Release Date:** November 26, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

### Fixed & Enhanced

#### 🎯 Fullscreen Reader HUD & Status Bar Stability
- **Eliminated Status Bar Jump & Top Bar Flicker:** Kept the Android system `StatusBar` consistently hidden inside `ReaderScreen` instead of toggling it on HUD taps under `Theme.EdgeToEdge`, preventing the mobile notification/status bar from popping in and shifting `topHud` safe-area insets mid-animation.
- **Clean HUD Fade-In:** Reset `hudAnim` to `0` before mounting `ReaderHUD` so the top and bottom bars always fade in smoothly without a 1-frame flash.

#### 📄 Bottom-Left Auto-Hiding Page Counter Pill
- **Bottom-Left Placement & Clean Format:** Moved the floating page counter pill to the bottom-left (`left: 20`) and removed the `"Page "` prefix across both the floating pill and the HUD scrubber slider (`current/total`).
- **Auto-Hide on Same Page:** The pill now appears smoothly for `1.8s` whenever you scroll/swipe to a new page or dismiss the HUD, then auto-hides while reading on the same page.

#### 🎚️ Page Slider Jump-Back Fix & Continuous Scroll Smoothing
- **Single-Consume Slider Jump:** Added `lastSliderTimestampRef` in both `WebtoonView` and `PagedView` so re-memoizing layout offsets as new pages load never re-triggers the slider jump and snaps you back. Also cleared the jump lock immediately on `onScrollBeginDrag`.
- **Viewport Scroll-Delta Anchoring & Smart Height Estimation:** Added running-average aspect ratio fallback for unmeasured pages and automatic scroll-offset delta anchoring when pages above the current viewport finish measuring, keeping your active page pinned even in chapters with varied page sizes.
- **Paged One-Tap & Rotation Fixes:** Fixed `one_tap` edge navigation in `PagedView` to update `onPageChange` and saved progress, and removed a rotation timer race condition.

#### 🎨 Global Edge-to-Edge StatusBar Consistency
- **Unified Light StatusBar:** Standardized `StatusBar` styling across `Library`, `Downloads`, and `Extensions` for consistent translucent light icons under `Theme.EdgeToEdge`.

---

## [6.2.3] - 2026-11-18

### 🚀 Orientation Scroll Stabilization, PDF-Style Document Zoom & Superimposition Elimination
- **Version:** `6.2.3`
- **Version Code:** `323`
- **Release Date:** November 18, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Fixed & Enhanced

#### 🔄 Orientation Switch Scroll Freeze Elimination
- **Permanent Native Scroll Freedom:** Completely solved the recurring bug where switching between portrait and landscape in Continuous (Webtoon) mode caused the list to freeze indefinitely until toggling to page-by-page and back. Removed brittle `scrollEnabled` toggling on native FlatList, eliminated cascading dependency timer cancellations during re-render, and stabilized re-anchoring to the current page.

#### 📄 PDF-Style Continuous Full-Document Zoom & Strict 2-Finger / 1-Finger Gesture Separation
- **Uniform Smooth Document Zoom:** Pinching to zoom in Continuous mode now scales the entire continuous comic canvas uniformly in real-time (identical to an Acrobat/Drive PDF reader), rather than zooming only a single image and jarringly snapping the rest on release.
- **2-Finger Pan Across Borders:** Dedicated 2-finger horizontal drag allows exploring wide or zoomed pages from border to border with smooth boundary resistance.
- **1-Finger Uninhibited Vertical Scroll:** Reserving two fingers for zoom and horizontal pan ensures that standard 1-finger vertical dragging always scrolls natively and smoothly through the chapter without gesture contention or lockups.
- **Double-Tap 1.0x <-> 2.0x Toggle:** Double-tapping anywhere on the continuous comic smoothly toggles between normal (1.0x) and magnified (2.0x) zoom.

#### 🛡️ Page-by-Page Superimposition Elimination
- **Strict Viewport Clipping:** Fixed layout container dimensions in horizontal paged mode (`PagedView`) and added strict `overflow: 'hidden'` clipping so magnified images never bleed or superimpose across previous/next pages.
- **Consistent Zoom Ratio:** Zoom ratio adjustments carry forward and backward seamlessly across all pages without visual overlap.
- **Phone Gallery Border Swiping:** Magnified pages pan cleanly with 2 fingers to inspect every corner, with swipe-past-border advancing or retreating pages like a native photo gallery app.

#### 🪟 Floating Page Indicator Pill Smart HUD Visibility
- **Automatic Occlusion:** The floating page indicator pill automatically fades out whenever the reader HUD function bars (top/bottom) or settings drawer appear, preventing it from floating over or obscuring controls.
- **Immersive Reading Transition:** As soon as the function bars hide into immersive reading, the pill smoothly transitions in and stays visible as an unobtrusive reading progress indicator.

---

## [6.2.2] - 2026-11-18

### 🚀 Reader Ergonomics, Unified Western Reading Flow & UI Polish
- **Version:** `6.2.2`
- **Version Code:** `322`
- **Release Date:** November 18, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Fixed & Enhanced

#### 📖 Streamlined 2-State Reading Mode (Continuous <-> Page by Page)
- **Unified Western Reading Flow:** Standardized all comics, manhwas, and mangas to follow the familiar Western reading direction: right-to-left swipe (drag finger left) or tap right edge to turn to the next page; left-to-right swipe (drag finger right) or tap left edge to turn to the previous page.
- **Removed Redundant Manga Mode:** Replaced the 3-mode cycle with an intuitive 2-state toggle between **Continuous** (vertical scroll up-to-down) and **Page by Page** (horizontal swipe).
- **Settings Screen Alignment:** Cleaned up Reader Settings dropdown to offer **Continuous (Vertical Scroll)** and **Page by Page (Standard Swipe)**.

#### 🪟 Floating Page Number Pill Overlap Fix
- **Drawer Occlusion:** Automatically hide the floating page indicator pill whenever the Reader Settings sheet or bottom drawer is opened, preventing the pill from floating over or obscuring settings controls while scrolling.

#### 🔍 Global PDF-Style Zoom & Gallery-Style Border Swipe Navigation
- **Uniform Continuous Zoom:** Pinch-to-zoom in Continuous mode scales all chapter pages simultaneously (PDF-reader style) with horizontal panning across wide pages.
- **Persistent Page-by-Page Zoom:** Pinch-to-zoom on any page automatically carries forward and backward across all pages in the chapter.
- **Phone Gallery Border Swiping:** When zoomed in, users can pan to inspect all corners; continuing a swipe past the image border smoothly navigates to the next or previous page.
- **Direct Manual Zoom Buttons:** Added `[-] [ 100% ] [+]` zoom controls directly in the bottom HUD and in Quick Settings under *Image Fit & Scaling*.

---

## [6.2.1] - 2026-11-16

### 🛠️ Version Synchronization & In-App Updater Hotfix: Vega Komix v6.2.1
- **Version:** `6.2.1`
- **Version Code:** `321`
- **Release Date:** November 16, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Fixed

#### 📱 Native Android Version Synchronization
- **Dynamic Gradle Versioning:** Configured `android/app/build.gradle` to resolve `versionName` and `versionCode` directly from `package.json` and `app.json` at build time, preventing native version stagnation.
- **Update Dialog Stutter Fix:** Resolved the false in-app update prompt (`Update v6.1.1 -> v6.2.0`) occurring on freshly installed releases by synchronizing native metadata with runtime bundle version.

#### 🔄 In-App Update Engine Hardening
- **Semver Sanitization:** Enhanced `compareVersions` in `About.tsx` with prefix-tolerant numeric component parsing, preventing spurious update notifications when the app is up to date.
- **Definitive Version Resolution:** Ensured `About.tsx` version displays and checks evaluate against package release metadata, guaranteeing accurate future update prompts when new releases land.

---

## [6.2.0] - 2026-11-16

### 🌟 Major Release: Search Engine Overhaul, 15-Genre Exploration & Complete Reading Suite
- **Version:** `6.2.0`
- **Version Code:** `320`
- **Release Date:** November 16, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Added

#### 🔍 Search Engine Overhaul & 15 Curated Genre Tags
- **15 Curated Comic Genres:** Direct 1-tap discovery for Action, Romance, Isekai, Fantasy, Slice of Life, Sci-Fi, Martial Arts, Comedy, Drama, Horror, Mystery, Psychological, Supernatural, Historical, and Sports.
- **Search History Chips & 1-Tap Recall:** Fast chip-based history recall with instant search execution and 1-tap clear all option.
- **Unified Series Room Clustering:** Automatically detects and clusters multiple provider editions and scattered chapter uploads under a unified series card with clear edition badges.

#### 🛡️ Privacy & Security Suite
- **Biometric App Lock:** Hardware-backed biometric authentication (Fingerprint, Face Unlock, or PIN fallback) on app launch and resume with configurable timeouts (`Immediately`, `1min`, `5min`).
- **Android `FLAG_SECURE` App Masking:** Blank task switcher previews in recent apps and screenshot protection during sensitive reading.
- **Ghost / Incognito Mode:** 1-tap toggle completely isolates reading sessions without writing to history or progress storage.

#### 🟢 Dynamic Library Live Update Tracker & Green Badges
- **Unread Chapter Tracking:** Real-time diff calculation (`totalReleasedChapters - lastReadChapterIndex`) with emerald green `+X` pill badges.
- **Fresh Bookmarks:** `"NEW"` badge for newly added comics with 0 read progress.
- **Non-Blocking Background Refresh:** Scraper queries batched in groups of 3 and scheduled via `scheduleWhenIdle`.

#### 📖 Reader Experience & Physics Optimization
- **Double-Spread Auto-Splitter:** Automatic portrait splitting for wide landscape scans (RTL for Manga, LTR for Comics).
- **Zero-Lag Virtualization:** Calibrated FlatList windowing for fluid 60/120fps scrolling on 100+ page vertical manhwas.
- **True-Color ARGB_8888 Quality Guarantee:** Original uncompressed resolution preserved across continuous and paged modes.
- **Story-Chronological Navigation:** Smooth forward chapter advancement regardless of raw scraper ordering.

---

## [6.1.7] - 2026-11-16

### 🚀 Privacy & Security Suite: Vega Komix v6.1.7
- **Version:** `6.1.7`
- **Version Code:** `317`
- **Release Date:** November 16, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Added

#### 🛡️ Hardware Biometric & Device PIN App Lock
- **Biometric Security Engine:** Enforces hardware-backed biometric verification (Fingerprint, Face Unlock, or system PIN/password fallback) on app launch and resume via `expo-local-authentication`.
- **Customizable Inactivity Timeouts:** Supports lock timing preferences (`Immediately`, `1 minute`, `5 minutes`) managed in `SecuritySettings.tsx` and `securityService.ts`.
- **BiometricLockOverlay:** Non-intrusive full-screen privacy shield at root application level blocks content access until authenticated.

#### 🔒 Android FLAG_SECURE Task Switcher App Masking
- **Task Switcher Content Protection:** Utilizes `expo-screen-capture` (`FLAG_SECURE`) to mask comic preview thumbnails in the Android Recent Apps / task switcher.
- **In-Reader Automatic Shielding:** Automatically activates window protection while reading sensitive content and when Incognito mode is engaged, protecting user privacy in public environments.

#### 👻 1-Tap Ghost / Incognito Reading Mode
- **Zero-Footprint Reading Sessions:** 1-tap Ghost mode toggle in Reader HUD and Settings Sheet completely bypasses reading history logging, progress persistence, and unread chapter diff updates.
- **Privacy Toast Feedback:** Displays instant confirmation feedback when entering or exiting Ghost reading mode.

---

## [6.1.6] - 2026-11-16

### 🚀 Library Live Update Tracker & Green +X Badges: Vega Komix v6.1.6
- **Version:** `6.1.6`
- **Version Code:** `316`
- **Release Date:** November 16, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Added

#### 🟢 Dynamic Green +X Unread Chapter Badges
- **Real-Time Unread Chapter Diff Calculation:** Directly computes unread chapter count using `totalReleasedChapters - lastReadChapterIndex` across all bookmarked titles in `Library.tsx` / `LibraryScreen.tsx`.
- **Vibrant Green Pill Badge (`+X`):** Renders a high-contrast emerald green pill badge (`#10B981`) on the top-right corner of the comic poster whenever unread chapters > 0, complete with subtle elevation and soft glow.
- **`"NEW"` Badge for Fresh Titles:** Automatically tags newly bookmarked comics having 0 read progress with a vibrant `"NEW"` pill badge until the user begins reading or acknowledges the title.

#### 🔄 Library Pull-to-Refresh & Background Update Checker
- **Zero UI-Thread Interruption:** Background update checks on screen focus are automatically scheduled via `scheduleWhenIdle`, ensuring zero frame drops or gesture lag during navigation transitions.
- **Micro-Batched Online Scraper Queries:** `LibraryUpdateChecker` queries providers in parallel micro-batches of 3, fetching fresh metadata, updating baseline chapter counts, and persisting fresh unread diffs to MMKV.
- **Force Pull-to-Refresh:** Pulling down on any library category or empty collection immediately triggers a live online check across all saved comics and syncs the library store state upon completion.

---

## [6.1.5] - 2026-11-16

### 🚀 Manga Double-Spread Auto-Splitter & Orientation Lock: Vega Komix v6.1.5
- **Version:** `6.1.5`
- **Version Code:** `315`
- **Release Date:** November 16, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Added

#### 📖 Landscape Double-Spread Auto-Splitter
- **Dynamic Landscape Scan Detection:** Scans with aspect ratio `width > height * 1.2` viewed in portrait mode automatically split into two portrait sub-pages with individual focus, eliminating tiny unreadable text.
- **Direction-Aware Split Reading:**
  - **Manga Mode (RTL):** Right half displays first (`Spread 1/2`), followed by left half (`Spread 2/2`) matching traditional Japanese publication reading order.
  - **Western Comic Mode (LTR):** Left half displays first (`Spread 1/2`), followed by right half (`Spread 2/2`).
- **Consecutive Page Pairing in Landscape:** When the device is held horizontally in `double_spread` mode, consecutive single portrait scans are paired side-by-side with cover page isolation.

#### 🔄 Rigid Screen Orientation Engine
- **Strict 2-State Locking:** Bottom HUD button alternates strictly between PORTRAIT and LANDSCAPE locking via `react-native-orientation-locker`.
- **Rogue Sensor Re-locking:** Orientation listener actively corrects unwanted sensor drift, keeping the user's manual choice locked while reading.

---

## [6.1.4] - 2026-11-16

### 🚀 Large Webtoon Zero-Lag Virtualization & Momentum Physics: Vega Komix v6.1.4
- **Version:** `6.1.4`
- **Version Code:** `314`
- **Release Date:** November 16, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Added

#### ⚡ Massive Webtoon Zero-Lag Scroll Virtualization
- **Calibrated FlatList Windowing:** Calibrated `windowSize` (5 in HQ, 3 in Eco mode), `maxToRenderPerBatch` (3 in HQ, 2 in Eco mode), and `removeClippedSubviews={true}` to achieve fluid 60/120fps momentum flings across 100+ page vertical manhwas and webtoons without UI stutter or memory bloat.
- **Aggressive Offscreen Recycling:** Unmounts distant offscreen page tiles while pre-caching incoming viewable tiles with zero blank screen flicker.

#### 💎 100% Original Uncompressed Image Quality Guarantee
- **32-Bit ARGB Pipeline Preserved:** Retained true-color `ARGB_8888` decode across both modes (`decodeFormat="argb"`).
- **Zero Downscaling:** Fixed `allowDownscaling={false}` universally across both continuous webtoon and paged reading modes, guaranteeing that full raw source pixel clarity from CDNs is always displayed.
- **Dynamic GPU Rasterization Allocation:** `highQualityRendering` toggle in Reader Settings optimizes image priority (`priority="high"` vs `"normal"`) and pre-caching window without sacrificing source resolution.

#### ⏱️ 400ms Debounced MMKV Progress Persistence
- **Zero-Stutter Flings:** Debounces disk I/O progress writes by 400ms during rapid momentum flings so background storage writes never interrupt the 120Hz gesture interaction thread.

---

## [6.1.3] - 2026-11-16

### 🚀 Chapter Chronology & Seamless Transition Flow: Vega Komix v6.1.3
- **Version:** `6.1.3`
- **Version Code:** `313`
- **Release Date:** November 16, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Added

#### 🧭 Story-Chronological Forward Chapter Navigation
- **Ascending Reading Advance:** "Next Chapter" navigation now strictly proceeds forward in story chronology (e.g. Chapter 1 → Chapter 2 → Chapter 3) regardless of whether the scraper provider lists chapters in descending order (latest at top) or ascending order (first at top).
- **Automated Chronology Detection:** In-depth chapter number extraction from metadata, title regexes, and endpoint URI slugs eliminates reverse reading bugs across all 20+ comic scrapers.

#### 🏁 Seamless End-of-Chapter Transition Cards
- **Webtoon & Paged Transition Cards:** Rendered dynamically at the end of both continuous vertical Webtoon (`WebtoonView`) and horizontal page-by-page (`PagedView`) reader modes.
- **Dynamic Action Button:** When a subsequent chapter exists in the series, displays a high-contrast 1-tap `"Read Next Chapter"` action button and pull-up / swipe-advance helper text.
- **Caught-Up Status:** When reading the latest released chapter, shows an affirmative `"You've caught up!"` badge to let readers know no further chapters are available yet.
- **Theme-Synchronized Styling:** Background, cards, and text automatically adapt to AMOLED Black (`#000000`), Dark Gray (`#121212`), Sepia (`#FBF0D9`), or Clean White (`#FFFFFF`).

#### 🏷️ HUD Chapter Switcher Reading Position Indicator
- **Live Reading Badge:** Highlights the currently active chapter in the HUD dropdown modal with a purple accent border and distinct `READING` tag for instant visual location among long chapter lists.

#### 📌 Per-Comic Reader Preferences & Zoom Memory
- **Comic-Specific Persistence:** In addition to reading mode (Webtoon vs Manga RTL vs Comic LTR), orientation, and page fit, custom pinch-to-zoom scaling levels are saved per comic ID and automatically restored on return.

---

## [6.1.2] - 2026-11-16

### 🚀 Reader Experience & Full-Stack Hardening: Vega Komix v6.1.2
- **Version:** `6.1.2`
- **Version Code:** `312`
- **Release Date:** November 16, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Added

#### 🔍 Website-Grade Pinch-to-Zoom & Pan Engine
- **Fluid Two-Finger Pinch Zoom:** Seamless 0.75x to 4.5x continuous scaling across both Paged (`PagedView`) and Continuous Webtoon (`WebtoonView`) reader modes.
- **Dynamic Touch Routing:** When unzoomed (1.0x), 1-finger vertical FlatList scrolling and horizontal page swiping remain 100% free with zero touch interception, matching the fluid behavior of modern web browsers.
- **Zoom-Locked Pan Navigation:** When scaled past 1.05x, 1-finger pan gesture activates, allowing smooth fluid movement across magnified panels bounded by page margins.
- **Smooth Spring-Back:** Releasing below 1.05x smoothly springs back to 1.0x and centers the frame.
- **Double-Tap Quick Zoom:** 1-tap/2-tap gesture differentiation cleanly switches between 1.0x and 2.5x anchored at the tap coordinates.
- **Worklet Safety Compliance:** Declared `.runOnJS(true)` across all gesture callbacks to guarantee zero native thread crashes on Android.

#### ⏱️ Floating Page Indicator Auto-Fade Pill
- **Smooth 2-Second Inactivity Fade:** Floating page indicator pill (`Page X / Y`) stays visible during reading/scrolling/swiping and smoothly fades out to `0` opacity after 2 seconds of inactivity.
- **Active Motion Reappearance:** Any active scrolling, swiping, edge tap, volume button navigation, or programmatic page change immediately restores opacity to `1`.
- **HUD Synchronization:** When the HUD is toggled ON, the indicator locks to visible (`opacity = 1`) alongside top and bottom HUD controls.
- **Touch-Transparent (`pointerEvents="none"`):** Eliminates touch interception over reading material.

#### 🎨 Dynamic Reader Theme Canvas Backgrounds
- **Verified 4 Reader Themes:**
  - **AMOLED Black:** `#000000` (true pitch black for OLED battery efficiency)
  - **Dark Gray:** `#121212` (comfortable dark background with `#F4F4F5` text)
  - **Sepia:** `#FBF0D9` (warm paper-like background with `#433422` reading text)
  - **Clean White:** `#FFFFFF` (crisp white reading background)
- **Real-Time Canvas Propagation:** Background color propagates across container, list, and image wrapper styles in both Paged and Continuous modes.

### Changed & Verified
- **Complete 8-Channel System Audit:**
  - Channel 1: Backend Scrapers & Image URL Cleaners verified with uncompressed CDN resolution.
  - Channel 2: Webtoon 0-gap continuous subpixel stitching (`-0.5px`) & 32-bit `ARGB_8888` decode.
  - Channel 3: Manga double-spread auto-splitter with direction-aware RTL/LTR scan splitting.
  - Channel 4: Reader momentum physics & 400ms debounced MMKV persistence.
  - Channel 5: Chapter story chronology inversion bug fix & per-comic reader preferences.
  - Channel 6: Green `+X` chapter badges & background library update checker.
  - Channel 7: Privacy & Security Suite (Biometric lock, `FLAG_SECURE` app switcher mask, Incognito mode).
  - Channel 8: Search engine overhaul & complete purge of legacy video streaming code.
- **100% Test Suite Verification:** All 151 test suites and 1,048 unit tests passing without errors.
- **Automated Frontend Verifier:** 10/10 front-end and provider checks passed.

---

## [6.1.1] - 2026-11-15

### 🚀 Major Feature & Optimization Update: Vega Komix v6.1.1
- **Version:** `6.1.1`
- **Version Code:** `311`
- **Release Date:** November 15, 2026
- **Target OS:** Android 6.0+ (ARM64 / ARMv8.0-A+ & Universal)
- **Application ID:** `com.vegakomix.app`

---

### Added

#### 📖 Subpixel 0-Gap Webtoon Stitching & Manga Double-Spread Splitter
- **Webtoon 0-Gap Continuous Stitching:**
  - Applied subpixel rounding compensation (`marginTop: -0.5px`) between consecutive vertical tiles, completely eliminating hairline white/black separator lines.
  - Pure `#000000` AMOLED container and FlatList background framing for seamless black-level integration.
  - Dynamically computes integer-rounded heights (`Math.ceil`) to prevent fractional pixel discrepancies.
- **Manga Double-Spread Auto-Splitter:**
  - Automatically identifies wide two-page scan spreads (aspect ratio > 1.25) in portrait reading mode.
  - Direction-aware split: splits scans into 2 virtual portrait pages (Right-to-Left for Manga; Left-to-Right for Western comics).
  - Renders each half edge-to-edge in full portrait height with subtle `Spread 1/2` and `Spread 2/2` status pills.
  - Added a "Split Double-Page Spreads" toggle in the Reader Settings Sheet.

#### 🔒 Privacy & Security Suite
- **Biometric App Lock:** Optional biometric/PIN authentication on app resume with configurable auto-lock timeout (Immediately, 1 Minute, 5 Minutes).
- **App Switcher Privacy Mask:** Android `FLAG_SECURE` privacy protection to blank app previews in Recent Apps switcher and prevent sensitive screen captures.
- **Incognito / Ghost Reading Mode:** One-tap ghost reading toggle in the reader top bar that temporarily disables reading history logging, progress tracking, and recent activity recording.

#### 🏷️ Green `+X` Chapter Badges & Library Update Checker
- **Automated Update Checker:** Background verification on library opening/refresh comparing provider chapter count with `lastKnownChapterCount`.
- **Visual Badges:** Prominent neon-green `+X` pill badge on comic cards with newly detected chapters, plus `NEW` badge for newly added bookmarked items.

#### 🔍 Search Overhaul & Quick Genre Discovery
- **Local Search History:** MMKV-backed search queries displayed as dismissible chips with 1-tap reuse and a "Clear History" button.
- **15 One-Tap Genre Suggestions:** Instant access tags (Action, Romance, Isekai, Fantasy, Manhwa, Manga, Comedy, Sci-Fi, Drama, Mystery, Supernatural, Slice of Life, Adventure, Horror, Martial Arts).

#### ⚙️ Per-Comic Reader Preferences
- Remembers reading mode (Continuous / Manga / Comic / Double Spread), orientation lock, image fit, and zoom settings independently for each comic series.

### Changed & Performance
- **Original Quality (32-bit ARGB) Preservation & Large Comic Scroll Optimization:**
  - **100% Original Quality Maintained by Default:** By default, images render at their complete uncompressed source resolution (`allowDownscaling=false`) and full 32-bit `ARGB_8888` color depth, eliminating compression artifacts and color banding in dark gradients.
  - **Original Quality Toggle:** Added a dedicated switch in Reader Settings Sheet and Settings -> Reader ("Original Quality (32-bit ARGB)"). Users on ultra low-end devices can toggle this to enable display-adapted downsampling if desired.
  - **Eliminated Scroll-Fighting Stutter:** Guarded programmatic `jumpToPage` with an internal scroll flag (`isInternalPageChange`) and momentum scroll listeners (`onMomentumScrollBegin`/`onMomentumScrollEnd`), ensuring continuous scrolling and momentum flings are never interrupted or rubberbanded.
  - **Re-render Elimination:** Removed `currentPageIndex` from FlatList `extraData` and stabilized retry callbacks, eliminating full list re-evaluations on every scrolled page.
  - **Debounced Progress Persistence:** Debounced chapter progress and watchlist MMKV storage writes by 400ms to eliminate synchronous disk I/O during fast scrolling.
  - **Tuned FlatList Windowing & Memory Guard:** Configured `windowSize={4}`, `maxToRenderPerBatch={2}`, and `scrollEventThrottle={32}`, with TurboPreloader lookahead caching to disk (`cachePolicy='disk'`) to prevent heap exhaustion.
- **Full Resolution Source Scrapers:** Stripped CDN downscaling suffixes (`-350x476`, `-scaled`, `?resize=`, `?w=`) across all provider scrapers to load 100% original uncompressed images.
- **Instant Chapter Opening (< 300ms):** Progressive chunking streams initial pages immediately without blocking on large 1000-page metadata arrays.
- **8-Page Lookahead Preloader:** Sliding memory-safe preloader pre-caches upcoming images on disk and unloads distant bitmaps to maintain 60fps scrolling without OOM.
- **Purged Legacy Video Subsystems:** Deleted obsolete video players, HLS downloaders, torrent engines, and subtitle caches.

### Fixed
- **Large Comic Scrolling Lag & Freezes:** Resolved multi-frame GC stutter and scroll fights on long webtoon strips.
- **Reader Slider Direct Jump:** Decoupled 60fps slider dragging UI feedback from scroll execution; commits jump once on finger release.
- **Center-Tap HUD & Orientation Persistence:** Center tap strictly toggles HUD visibility without causing orientation resets or layout remounts; 3.5s and scroll auto-hiding HUD.
- **Chronological Chapter Navigation:** Corrected navigation inversion where descending chapter lists caused "Next Chapter" to navigate backwards in the story.

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
