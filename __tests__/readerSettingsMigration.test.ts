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

describe('getStoredReaderSettings — removed fit-width migration', () => {
  beforeEach(() => {
    (global as any).__testReaderSettings = {};
    (global as any).__testPageFit = 'fit_screen';
  });

  it('defaults to fit-screen, never fit-width', () => {
    const settings = getStoredReaderSettings();
    expect(settings.imageScale).toBe('fit_screen');
  });

  it('migrates a stored fit_width value to fit-screen', () => {
    (global as any).__testReaderSettings = {
      'vega-komix-reader-settings': {imageScale: 'fit_width'},
    };
    expect(getStoredReaderSettings().imageScale).toBe('fit_screen');
  });

  it('keeps the surviving stored modes untouched', () => {
    for (const mode of ['fit_height', 'fit_screen', 'original'] as const) {
      (global as any).__testReaderSettings = {
        'vega-komix-reader-settings': {imageScale: mode},
      };
      expect(getStoredReaderSettings().imageScale).toBe(mode);
    }
  });
});
