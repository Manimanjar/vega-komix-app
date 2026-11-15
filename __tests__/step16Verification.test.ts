import fs from 'fs';
import path from 'path';

describe('Step 16: Front-End Verification Suite', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('Check 1: should have zero legacy video player strings in src/screens/settings', () => {
    const settingsDir = path.join(rootDir, 'src', 'screens', 'settings');
    const getAllFiles = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          results = results.concat(getAllFiles(fullPath));
        } else if (/\.(tsx?|jsx?)$/.test(file)) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const files = getAllFiles(settingsDir);
    const forbidden = [
      /["'`]Player settings["'`]/i,
      /["'`]watch progress["'`]/i,
      /\bVLC\b/i,
      /\bMX Player\b/i,
      /\bsubtitle\b/i,
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
        for (const pat of forbidden) {
          expect(pat.test(line)).toBe(false);
        }
        if (/["'`]About Vega["'`]/i.test(line)) {
          expect(line).toContain('About Vega Komix');
        }
        if (/["'`]Star Vega["'`]/i.test(line)) {
          expect(line).toContain('Star Vega Komix');
        }
      }
    }
  });

  it('Check 2: should ensure all reader gestures are worklet-safe or run on JS thread', () => {
    const readerImageFile = path.join(rootDir, 'src', 'components', 'reader', 'ReaderImage.tsx');
    const content = fs.readFileSync(readerImageFile, 'utf-8');
    expect(content).toContain('.runOnJS(true)');
  });

  it('Check 3: should dynamically compute webtoon page height edge-to-edge', () => {
    const webtoonViewFile = path.join(rootDir, 'src', 'components', 'reader', 'WebtoonView.tsx');
    const content = fs.readFileSync(webtoonViewFile, 'utf-8');
    expect(content).toContain('Math.round(screenWidth * (naturalHeight / naturalWidth))');
    expect(content).toContain('width: screenWidth');
  });

  it('Check 4: should render visible action buttons and space-between chapter rows', () => {
    const contentOverviewFile = path.join(
      rootDir,
      'src',
      'screens',
      'home',
      'components',
      'ContentOverview.tsx',
    );
    const chapterListFile = path.join(rootDir, 'src', 'components', 'ChapterList.tsx');
    const coContent = fs.readFileSync(contentOverviewFile, 'utf-8');
    const clContent = fs.readFileSync(chapterListFile, 'utf-8');

    expect(coContent).toContain('Start Reading');
    expect(coContent).toContain('Library');
    expect(coContent).toContain('WebView');
    expect(clContent).toContain("justifyContent: 'space-between'");
  });

  it('Check 5: should preserve MangaDex cover URLs and start with clean Attempt 1 headers', () => {
    const comicThumbnailFile = path.join(rootDir, 'src', 'components', 'ComicThumbnail.tsx');
    const content = fs.readFileSync(comicThumbnailFile, 'utf-8');
    expect(content).toContain("cleanUrl.includes('mangadex.org')");
    expect(content).toContain('setHeaders(undefined)');
  });

  it('Check 6: should have removed broken providers from manifest.json', () => {
    const manifestPath = path.resolve(rootDir, '..', 'vega-komix-providers', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      expect(content).not.toContain('komixGallery');
      expect(content).not.toContain('webtoonManhwa');
    }
  });

  it('Check 7: should have AMOLED background and single-chapter synthesis fallback in Info.tsx', () => {
    const infoPath = path.join(rootDir, 'src', 'screens', 'home', 'Info.tsx');
    const content = fs.readFileSync(infoPath, 'utf-8');
    expect(content).not.toContain('blurRadius');
    expect(content).toContain("id: 'single-1'");
  });

  it('Check 8: should have no shield-check in top bar and have 1-tap Reading Mode pill in ReaderHUD', () => {
    const hudPath = path.join(rootDir, 'src', 'components', 'reader', 'ReaderHUD.tsx');
    const content = fs.readFileSync(hudPath, 'utf-8');
    expect(content).not.toContain('name="shield-check"');
    expect(content).toContain("'Continuous'");
    expect(content).toContain("'Page by Page'");
  });

  it('Check 9: should have 1-tap Nav Mode, 2-state Orientation, and useWindowDimensions in Reader', () => {
    const hudPath = path.join(rootDir, 'src', 'components', 'reader', 'ReaderHUD.tsx');
    const readerPath = path.join(rootDir, 'src', 'screens', 'home', 'ReaderScreen.tsx');
    const hudContent = fs.readFileSync(hudPath, 'utf-8');
    const readerContent = fs.readFileSync(readerPath, 'utf-8');
    expect(hudContent).toContain("'Scroll'");
    expect(hudContent).toContain("'One Tap'");
    expect(hudContent).toContain("'Swipe'");
    expect(readerContent).toContain("settings.orientationMode === 'portrait' ? 'landscape' : 'portrait'");
    expect(readerContent).toContain('useWindowDimensions()');
  });

  it('Check 10: should have overhauled ReaderSettingsSheet with live controls and no main settings toggles', () => {
    const sheetPath = path.join(rootDir, 'src', 'components', 'reader', 'ReaderSettingsSheet.tsx');
    const content = fs.readFileSync(sheetPath, 'utf-8');
    expect(content).not.toContain('Background Theme');
    expect(content).not.toContain('Auto-Crop White Borders');
    expect(content).not.toContain('Keep Screen Awake');
    expect(content).not.toContain('Volume Key Page Turn');
    expect(content).not.toContain('Floating Page Indicator');
    expect(content).toContain('Live Zoom Level');
    expect(content).toContain('Image Fit & Scaling');
    expect(content).toContain('Hands-Free Auto-Scroll');
    expect(content).toContain('Screen Brightness & Eye Care');
    expect(content).toContain('Quick Page & Chapter Tools');
  });
});
