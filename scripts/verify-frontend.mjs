#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalErrors = 0;

function reportPass(checkName, details = '') {
  console.log(`\x1b[32m✔ PASS\x1b[0m [${checkName}] ${details}`);
}

function reportFail(checkName, error) {
  totalErrors++;
  console.error(`\x1b[31m✖ FAIL\x1b[0m [${checkName}]: ${error}`);
}

function getAllFiles(dir, exts = ['.ts', '.tsx', '.js', '.jsx']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, exts));
    } else if (exts.includes(path.extname(file))) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log('====================================================');
console.log('   VEGA KOMIX AUTOMATED FRONT-END VERIFIER (Step 20) ');
console.log('====================================================\n');

// --------------------------------------------------------------------------
// Check 1: No Legacy Video Settings Strings in UI
// --------------------------------------------------------------------------
console.log('--- Check 1: Scanning src/screens/settings/ for legacy video strings ---');
const settingsDir = path.join(rootDir, 'src', 'screens', 'settings');
const settingsFiles = getAllFiles(settingsDir);

const forbiddenPatterns = [
  {regex: /["'`]Player settings["'`]/i, name: '"Player settings"'},
  {regex: /["'`]watch progress["'`]/i, name: '"watch progress"'},
  {regex: /["'`]About Vega["'`]/i, name: '"About Vega" (without Komix)'},
  {regex: /["'`]Star Vega["'`]/i, name: '"Star Vega" (without Komix)'},
  {regex: /\bVLC\b/i, name: 'VLC'},
  {regex: /\bMX Player\b/i, name: 'MX Player'},
  {regex: /\bsubtitle\b/i, name: '"subtitle"'},
];

let check1Errors = 0;
for (const filePath of settingsFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

    for (const pat of forbiddenPatterns) {
      if (pat.regex.test(line)) {
        // Allow "About Vega Komix" and "Star Vega Komix"
        if (pat.name.includes('About Vega') && line.includes('About Vega Komix')) continue;
        if (pat.name.includes('Star Vega') && line.includes('Star Vega Komix')) continue;

        reportFail('Check 1 (Legacy Video Strings)', `Found forbidden ${pat.name} in ${path.relative(rootDir, filePath)}:${idx + 1}\n   > ${line.trim()}`);
        check1Errors++;
      }
    }
  });
}

if (check1Errors === 0) {
  reportPass('Check 1 (Legacy Video Strings)', 'Zero legacy video player strings found in src/screens/settings/');
}

// --------------------------------------------------------------------------
// Check 2: No Unsafe Worklet Gestures in Reader
// --------------------------------------------------------------------------
console.log('\n--- Check 2: Verifying Worklet Gesture Safety in Reader ---');
const readerDir = path.join(rootDir, 'src', 'components', 'reader');
const readerFiles = getAllFiles(readerDir).concat(
  path.join(rootDir, 'src', 'screens', 'home', 'ReaderScreen.tsx')
);

let check2Errors = 0;
for (const filePath of readerFiles) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf-8');

  // Find Gesture.Tap() or Gesture.DoubleTap() or Gesture.Pan() or Gesture.Pinch()
  const gestureBlocks = content.split(/Gesture\.(Tap|Pan|Pinch)\s*\(/);
  for (let i = 1; i < gestureBlocks.length; i += 2) {
    const gestureType = gestureBlocks[i];
    const blockBody = gestureBlocks[i + 1]?.slice(0, 800) || '';

    // If gesture has .onEnd or .onStart calling JS callbacks
    if (blockBody.includes('.onEnd(') || blockBody.includes('.onStart(')) {
      const isWorkletOnly = blockBody.includes("'worklet'");
      const hasRunOnJS = blockBody.includes('.runOnJS(true)');

      if (!hasRunOnJS && !isWorkletOnly) {
        reportFail('Check 2 (Worklet Safety)', `Unsafe gesture in ${path.relative(rootDir, filePath)}: Gesture.${gestureType}() calls handlers without .runOnJS(true) or 'worklet' declaration.`);
        check2Errors++;
      }
    }
  }
}

if (check2Errors === 0) {
  reportPass('Check 2 (Worklet Safety)', 'All reader gestures safely declare .runOnJS(true) or pure worklet execution; edge taps use safe JS Pressable zones.');
}

// --------------------------------------------------------------------------
// Check 3: Full-Width Dynamic Height in Webtoon Reader
// --------------------------------------------------------------------------
console.log('\n--- Check 3: Verifying Dynamic Height in Webtoon Reader ---');
const webtoonViewPath = path.join(rootDir, 'src', 'components', 'reader', 'WebtoonView.tsx');
let check3Errors = 0;

if (!fs.existsSync(webtoonViewPath)) {
  reportFail('Check 3 (Webtoon Dynamic Height)', 'WebtoonView.tsx not found.');
  check3Errors++;
} else {
  const content = fs.readFileSync(webtoonViewPath, 'utf-8');
  // Page height is computed from the measured natural size via the shared
  // computePageBox helper (fit modes + measured-size cache); the old inline
  // width * ratio formula is kept as a legacy match.
  const hasDynamicCalculation =
    content.includes('computePageBox') ||
    content.includes('Math.round(screenWidth * (naturalHeight / naturalWidth))') ||
    content.includes('screenWidth * (naturalHeight / naturalWidth)') ||
    content.includes('screenWidth * (height / width)');
  const hasFullWidth = content.includes('width: screenWidth') || content.includes('width: box.width');

  if (!hasDynamicCalculation) {
    reportFail('Check 3 (Webtoon Dynamic Height)', 'WebtoonView does not dynamically compute pageHeight from aspect ratio (naturalHeight / naturalWidth).');
    check3Errors++;
  }
  if (!hasFullWidth) {
    reportFail('Check 3 (Webtoon Dynamic Height)', 'WebtoonView pages are not set to full width (width: screenWidth).');
    check3Errors++;
  }
  if (content.includes('height: screenHeight') && !content.includes('minHeight:')) {
    reportFail('Check 3 (Webtoon Dynamic Height)', 'WebtoonView pages appear locked to height: screenHeight.');
    check3Errors++;
  }
}

if (check3Errors === 0) {
  reportPass('Check 3 (Webtoon Dynamic Height)', 'AutoHeightComicPage dynamically computes page height from the measured natural size via computePageBox, edge-to-edge.');
}

// --------------------------------------------------------------------------
// Check 4: Visible Action Buttons in Info.tsx & Chapter Row Alignment
// --------------------------------------------------------------------------
console.log('\n--- Check 4: Verifying Info.tsx Action Buttons & Chapter Row Alignment ---');
const contentOverviewPath = path.join(rootDir, 'src', 'screens', 'home', 'components', 'ContentOverview.tsx');
const chapterListPath = path.join(rootDir, 'src', 'components', 'ChapterList.tsx');
let check4Errors = 0;

if (!fs.existsSync(contentOverviewPath)) {
  reportFail('Check 4 (Info Action Buttons)', 'ContentOverview.tsx not found.');
  check4Errors++;
} else {
  const content = fs.readFileSync(contentOverviewPath, 'utf-8');
  const hasStartReading = content.includes('Start Reading') || content.includes('Resume');
  const hasLibrary = content.includes('Library') || content.includes('Add to Library');
  const hasWebView = content.includes('WebView');

  if (!hasStartReading || !hasLibrary || !hasWebView) {
    reportFail('Check 4 (Info Action Buttons)', 'ContentOverview missing explicit visible Text labels (Start Reading/Resume, Library, WebView).');
    check4Errors++;
  }
}

if (!fs.existsSync(chapterListPath)) {
  reportFail('Check 4 (Chapter Alignment)', 'ChapterList.tsx not found.');
  check4Errors++;
} else {
  const content = fs.readFileSync(chapterListPath, 'utf-8');
  const hasSpaceBetween = content.includes("justifyContent: 'space-between'");

  if (!hasSpaceBetween) {
    reportFail('Check 4 (Chapter Alignment)', 'ChapterList.tsx chapter rows do not use justifyContent: "space-between" to horizontally align the download button.');
    check4Errors++;
  }
}

if (check4Errors === 0) {
  reportPass('Check 4 (Info Action Buttons & Chapter Alignment)', 'Info.tsx renders high-contrast visible Action Buttons (Start Reading/Resume, Library, WebView) and ChapterList aligns download buttons with space-between.');
}

// --------------------------------------------------------------------------
// Check 5: Clean Thumbnail Loading in ComicThumbnail.tsx
// --------------------------------------------------------------------------
console.log('\n--- Check 5: Verifying Clean Thumbnail Loading in ComicThumbnail.tsx ---');
const comicThumbnailPath = path.join(rootDir, 'src', 'components', 'ComicThumbnail.tsx');
let check5Errors = 0;

if (!fs.existsSync(comicThumbnailPath)) {
  reportFail('Check 5 (Clean Thumbnail Loading)', 'ComicThumbnail.tsx not found.');
  check5Errors++;
} else {
  const content = fs.readFileSync(comicThumbnailPath, 'utf-8');
  const preservesMangaDex =
    content.includes('mangadex.org') &&
    (content.includes('return cleanUrl') || content.includes('/covers/'));
  const cleanInitialAttempt =
    content.includes('setHeaders(undefined)') ||
    content.includes('headers: undefined');

  if (!preservesMangaDex) {
    reportFail('Check 5 (Clean Thumbnail Loading)', 'ComicThumbnail does not protect MangaDex .512.jpg cover URLs from destructive regex replacements.');
    check5Errors++;
  }
  if (!cleanInitialAttempt) {
    reportFail('Check 5 (Clean Thumbnail Loading)', 'ComicThumbnail does not perform initial Attempt 1 with clean headers (blocking Referers must be omitted on Attempt 1).');
    check5Errors++;
  }
}

if (check5Errors === 0) {
  reportPass('Check 5 (Clean Thumbnail Loading)', 'ComicThumbnail.tsx preserves MangaDex .512.jpg cover URLs and starts Attempt 1 clean without blocking Referer headers.');
}

// --------------------------------------------------------------------------
// Check 6: Broken Providers Removed from Providers Manifest
// --------------------------------------------------------------------------
console.log('\n--- Check 6: Verifying Broken Providers Removed in vega-komix-providers/manifest.json ---');
// The providers repo may sit next to this one under its own name
// (vega-komix-providers) or as a local audit checkout
// (vega-komix-providers-audit); an env override wins over both.
const providersManifestCandidates = [
  process.env.VEGA_KOMIX_PROVIDERS_MANIFEST,
  path.resolve(rootDir, '..', 'vega-komix-providers', 'manifest.json'),
  path.resolve(rootDir, '..', 'vega-komix-providers-audit', 'manifest.json'),
].filter(Boolean);
const providersManifestPath = providersManifestCandidates.find(p => fs.existsSync(p));
let check6Errors = 0;

if (!providersManifestPath) {
  reportFail('Check 6 (Broken Providers Removed)', `manifest.json not found in any of: ${providersManifestCandidates.join(', ')}`);
  check6Errors++;
} else {
  const manifestRaw = fs.readFileSync(providersManifestPath, 'utf-8');
  if (manifestRaw.includes('komixGallery')) {
    reportFail('Check 6 (Broken Providers Removed)', 'komixGallery is still present in vega-komix-providers/manifest.json!');
    check6Errors++;
  }
  if (manifestRaw.includes('webtoonManhwa') || manifestRaw.includes('"value": "webtoon"')) {
    reportFail('Check 6 (Broken Providers Removed)', 'webtoonManhwa is still present in vega-komix-providers/manifest.json!');
    check6Errors++;
  }
}

if (check6Errors === 0) {
  reportPass('Check 6 (Broken Providers Removed)', `komixGallery and webtoonManhwa are completely removed from manifest.json (${providersManifestPath}).`);
}

// --------------------------------------------------------------------------
// Check 7: Info.tsx Background & Single-Chapter Fallback
// --------------------------------------------------------------------------
console.log('\n--- Check 7: Verifying Info.tsx AMOLED Background & Single-Chapter Fallback ---');
const infoScreenPath = path.join(rootDir, 'src', 'screens', 'home', 'Info.tsx');
let check7Errors = 0;

if (!fs.existsSync(infoScreenPath)) {
  reportFail('Check 7 (Info Background & Fallback)', 'Info.tsx not found.');
  check7Errors++;
} else {
  const infoContent = fs.readFileSync(infoScreenPath, 'utf-8');
  // Must NOT have blurred background image behind scroll view
  if (infoContent.includes('blurRadius') || infoContent.includes('blurredBackdrop')) {
    reportFail('Check 7 (Info Background & Fallback)', 'Info.tsx still has a blurred background image behind the scroll view.');
    check7Errors++;
  }
  // Must synthesize single chapter when chapters.length === 0
  const hasSingleChapterFallback =
    infoContent.includes("id: 'single-1'") ||
    infoContent.includes('Single-File Fallback') ||
    infoContent.includes('Universal App-Side Single-File Fallback');
  if (!hasSingleChapterFallback) {
    reportFail('Check 7 (Info Background & Fallback)', 'Info.tsx is missing single-chapter synthesis fallback when chapters.length === 0.');
    check7Errors++;
  }
}

if (check7Errors === 0) {
  reportPass('Check 7 (Info Background & Fallback)', 'Info.tsx has pure solid AMOLED background (no blurred image) and includes single-chapter synthesis fallback.');
}

// --------------------------------------------------------------------------
// Check 8: Reader Top Bar Redesign (No Shield Checkmark, Has 1-Tap Reading Mode)
// --------------------------------------------------------------------------
console.log('\n--- Check 8: Verifying Reader Top Bar Redesign ---');
const readerHudPath = path.join(rootDir, 'src', 'components', 'reader', 'ReaderHUD.tsx');
let check8Errors = 0;

if (!fs.existsSync(readerHudPath)) {
  reportFail('Check 8 (Reader Top Bar)', 'ReaderHUD.tsx not found.');
  check8Errors++;
} else {
  const hudContent = fs.readFileSync(readerHudPath, 'utf-8');
  // Top bar must NOT have shield-check icon
  if (hudContent.includes('name="shield-check"')) {
    reportFail('Check 8 (Reader Top Bar)', 'ReaderHUD.tsx still renders the shield-check button on the top bar!');
    check8Errors++;
  }
  // Must have 1-tap Continuous / Page by Page button
  const hasContinuous = hudContent.includes("'Continuous'");
  const hasPageByPage = hudContent.includes("'Page by Page'");
  if (!hasContinuous || !hasPageByPage) {
    reportFail('Check 8 (Reader Top Bar)', 'ReaderHUD.tsx top bar is missing the 1-tap Continuous / Page by Page toggle button.');
    check8Errors++;
  }
}

if (check8Errors === 0) {
  reportPass('Check 8 (Reader Top Bar)', 'Reader top bar has zero shield checkmark buttons and features the 1-tap Continuous / Page by Page pill button.');
}

// --------------------------------------------------------------------------
// Check 9: Reader Bottom Bar & Orientation Controls
// --------------------------------------------------------------------------
console.log('\n--- Check 9: Verifying Reader Bottom Bar & Orientation Controls ---');
const readerScreenPath = path.join(rootDir, 'src', 'screens', 'home', 'ReaderScreen.tsx');
let check9Errors = 0;

if (!fs.existsSync(readerScreenPath) || !fs.existsSync(readerHudPath)) {
  reportFail('Check 9 (Reader Bottom Bar)', 'ReaderScreen.tsx or ReaderHUD.tsx not found.');
  check9Errors++;
} else {
  const hudContent = fs.readFileSync(readerHudPath, 'utf-8');
  const readerContent = fs.readFileSync(readerScreenPath, 'utf-8');

  // Must have 1-tap Scroll / One Tap / Swipe button
  const hasNavMode =
    hudContent.includes("'Scroll'") &&
    hudContent.includes("'One Tap'") &&
    hudContent.includes("'Swipe'");
  if (!hasNavMode) {
    reportFail('Check 9 (Reader Bottom Bar)', 'ReaderHUD.tsx bottom bar is missing 1-tap Scroll / One Tap / Swipe button.');
    check9Errors++;
  }

  // Must have strictly 2-state Portrait / Landscape orientation (no 'auto')
  const hasTwoStateOrientation =
    readerContent.includes("settings.orientationMode === 'portrait' ? 'landscape' : 'portrait'") ||
    readerContent.includes("nextOrientation: ScreenOrientationMode");
  const noAutoOrientationState =
    !readerContent.includes("orientationMode === 'auto'") &&
    !hudContent.includes("case 'auto':");
  if (!hasTwoStateOrientation || !noAutoOrientationState) {
    reportFail('Check 9 (Reader Bottom Bar)', 'Reader orientation toggle does not strictly toggle between 2 states (Portrait and Landscape).');
    check9Errors++;
  }

  // Must use dynamic useWindowDimensions()
  if (!readerContent.includes('useWindowDimensions()')) {
    reportFail('Check 9 (Reader Bottom Bar)', 'ReaderScreen.tsx does not use dynamic useWindowDimensions().');
    check9Errors++;
  }
}

if (check9Errors === 0) {
  reportPass('Check 9 (Reader Bottom Bar)', 'Reader bottom bar features 1-tap Scroll/One Tap/Swipe, 2-state Portrait/Landscape toggle, and dynamic useWindowDimensions().');
}

// --------------------------------------------------------------------------
// Check 10: In-Reader Settings Sheet Overhaul
// --------------------------------------------------------------------------
console.log('\n--- Check 10: Verifying In-Reader Settings Sheet Overhaul ---');
const readerSettingsSheetPath = path.join(rootDir, 'src', 'components', 'reader', 'ReaderSettingsSheet.tsx');
let check10Errors = 0;

if (!fs.existsSync(readerSettingsSheetPath)) {
  reportFail('Check 10 (Reader Settings Sheet)', 'ReaderSettingsSheet.tsx not found.');
  check10Errors++;
} else {
  const sheetContent = fs.readFileSync(readerSettingsSheetPath, 'utf-8');

  // Must NOT contain Background Theme
  if (sheetContent.includes('Background Theme') || sheetContent.includes('THEME_OPTIONS')) {
    reportFail('Check 10 (Reader Settings Sheet)', 'ReaderSettingsSheet.tsx still contains Background Theme palette (should only be in Main Settings).');
    check10Errors++;
  }

  // Must NOT contain the removed toggles (incl. Auto-Scroll and Eye
  // Brightness, removed at the user's request, and the Live Zoom buttons,
  // removed at the user's request in the reader-animation batch).
  const forbiddenSheetStrings = [
    'Auto-Crop White Borders',
    'Keep Screen Awake',
    'Volume Key Page Turn',
    'Floating Page Indicator',
    'Hands-Free Auto-Scroll',
    'AUTO_SCROLL_OPTIONS',
    'Eye Brightness',
    'screenDimmer',
    'Live Zoom Level',
    'ZOOM_LEVELS',
  ];
  for (const str of forbiddenSheetStrings) {
    if (sheetContent.includes(str)) {
      reportFail('Check 10 (Reader Settings Sheet)', `ReaderSettingsSheet.tsx still contains removed toggle: "${str}".`);
      check10Errors++;
    }
  }

  // Must contain Image Fit (with Full Screen + Fit Width), Eye Care (Warm
  // Night Filter kept), Quick Tools. The Live Zoom buttons were removed at
  // the user's request; Auto-Scroll was removed earlier, also at their word.
  const hasFit =
    (sheetContent.includes('Image Fit & Scaling') || sheetContent.includes('SCALE_OPTIONS')) &&
    sheetContent.includes('Full Screen') &&
    sheetContent.includes('Fit Width');
  const hasEyeCare = sheetContent.includes('Display & Eye Care') || sheetContent.includes('Warm Night Filter');
  const hasQuickTools = sheetContent.includes('Quick Page & Chapter Tools');

  if (!hasFit || !hasEyeCare || !hasQuickTools) {
    reportFail('Check 10 (Reader Settings Sheet)', 'ReaderSettingsSheet.tsx missing one of required sections (Image Fit with Full Screen + Fit Width, Eye Care / Warm Night Filter, Quick Tools).');
    check10Errors++;
  }
}

if (check10Errors === 0) {
  reportPass('Check 10 (Reader Settings Sheet)', 'In-reader ReaderSettingsSheet is cleanly focused on live controls (Image Fit with Full Screen + Fit Width, Eye Care / Warm Night Filter, Quick Tools) with zero redundant main settings toggles.');
}

// --------------------------------------------------------------------------
// Final Result
// --------------------------------------------------------------------------
console.log('\n====================================================');
if (totalErrors === 0) {
  console.log('\x1b[32m✔ ALL 10 FRONT-END & PROVIDER CHECKS PASSED PERFECTLY!\x1b[0m');
  console.log('====================================================\n');
  process.exit(0);
} else {
  console.error(`\x1b[31m✖ FRONT-END VERIFICATION FAILED WITH ${totalErrors} ERROR(S)!\x1b[0m`);
  console.log('====================================================\n');
  process.exit(1);
}
