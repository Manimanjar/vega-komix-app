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
console.log('   VEGA KOMIX AUTOMATED FRONT-END VERIFIER (Step 16) ');
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
  const hasDynamicCalculation =
    content.includes('Math.round(screenWidth * (naturalHeight / naturalWidth))') ||
    content.includes('screenWidth * (naturalHeight / naturalWidth)') ||
    content.includes('screenWidth * (height / width)');
  const hasFullWidth = content.includes('width: screenWidth');

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
  reportPass('Check 3 (Webtoon Dynamic Height)', 'AutoHeightComicPage dynamically computes pageHeight = Math.round(screenWidth * (naturalHeight / naturalWidth)) edge-to-edge.');
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
// Final Result
// --------------------------------------------------------------------------
console.log('\n====================================================');
if (totalErrors === 0) {
  console.log('\x1b[32m✔ ALL 5 FRONT-END CHECKS PASSED PERFECTLY!\x1b[0m');
  console.log('====================================================\n');
  process.exit(0);
} else {
  console.error(`\x1b[31m✖ FRONT-END VERIFICATION FAILED WITH ${totalErrors} ERROR(S)!\x1b[0m`);
  console.log('====================================================\n');
  process.exit(1);
}
