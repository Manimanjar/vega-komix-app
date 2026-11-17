jest.mock('../src/lib/storage', () => ({
  mainStorage: {
    getObject: (key: string) => (global as any).__testReaderSettings?.[key],
    setObject: (key: string, value: any) => {
      (global as any).__testReaderSettings =
        (global as any).__testReaderSettings || {};
      (global as any).__testReaderSettings[key] = value;
    },
  },
  settingsStorage: {
    getReaderBgColor: () => 'amoled',
    getDefaultReadingMode: () => 'webtoon',
    getPageFit: () => (global as any).__testPageFit ?? 'fit_screen',
    isAutoCropMargins: () => false,
    isKeepAwakeEnabled: () => true,
    isVolumeKeysEnabled: () => true,
    isPageNumberPillEnabled: () => true,
    isTapZonesEnabled: () => true,
    isDefaultLiveTranslation: () => false,
    isHighQualityRendering: () => true,
  },
  watchProgressStorage: {},
}));
jest.mock('../src/lib/zustand/continueWatchingStore', () => ({
  __esModule: true,
  default: {getState: () => ({upsertItem: jest.fn()})},
}));

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {getStoredReaderSettings} from '../src/components/reader/readerStorage';

describe('getStoredReaderSettings — fit modes restored, zoom buttons gone', () => {
  beforeEach(() => {
    (global as any).__testReaderSettings = {};
    (global as any).__testPageFit = 'fit_screen';
  });

  it('defaults to fit-screen', () => {
    const settings = getStoredReaderSettings();
    expect(settings.imageScale).toBe('fit_screen');
  });

  it('keeps every stored fit mode untouched, including fit-width and full-screen', () => {
    for (const mode of [
      'fit_height',
      'fit_width',
      'fit_screen',
      'full_screen',
      'original',
    ] as const) {
      (global as any).__testReaderSettings = {
        'vega-komix-reader-settings': {imageScale: mode},
      };
      expect(getStoredReaderSettings().imageScale).toBe(mode);
    }
  });

  it('resets a stored zoom scale to 1.0 — the Live Zoom buttons are gone, so a stuck zoom would have no reset path', () => {
    (global as any).__testReaderSettings = {
      'vega-komix-reader-settings': {zoomScale: 2.5},
    };
    expect(getStoredReaderSettings().zoomScale).toBe(1.0);
    (global as any).__testReaderSettings = {
      'vega-komix-reader-settings': {zoomScale: 1.0},
    };
    expect(getStoredReaderSettings().zoomScale).toBe(1.0);
  });
});
