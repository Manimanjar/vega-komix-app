import {mainStorage, settingsStorage, watchProgressStorage} from '../../lib/storage';
import useContinueWatchingStore from '../../lib/zustand/continueWatchingStore';
import type {EpisodeLink} from '../../lib/providers/types';
import type {ReaderProgress, ReaderSettings} from './types';

const READER_SETTINGS_KEY = 'vega-komix-reader-settings';
const READER_PROGRESS_PREFIX = 'vega-komix-reader-progress:';

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'amoled',
  readingMode: 'webtoon',
  imageScale: 'fit_width',
  cropWhiteBorders: false,
  keepScreenAwake: true,
  volumeKeysEnabled: true,
  showFloatingPageNumber: true,
  disableTapZonesInWebtoon: false,
  orientationMode: 'portrait',
  interactionMode: 'scroll',
  liveTranslateEnabled: false,
};

export const getStoredReaderSettings = (): ReaderSettings => {
  const dynamicDefaults: ReaderSettings = {
    theme: (settingsStorage.getReaderBgColor() as any) || 'amoled',
    readingMode: (settingsStorage.getDefaultReadingMode() as any) || 'manga',
    imageScale: ((settingsStorage.getPageFit() === 'fit_screen' ? 'fit_width' : settingsStorage.getPageFit()) as any) || 'fit_width',
    cropWhiteBorders: settingsStorage.isAutoCropMargins(),
    keepScreenAwake: settingsStorage.isKeepAwakeEnabled(),
    volumeKeysEnabled: settingsStorage.isVolumeKeysEnabled(),
    showFloatingPageNumber: settingsStorage.isPageNumberPillEnabled(),
    disableTapZonesInWebtoon: !settingsStorage.isTapZonesEnabled(),
    orientationMode: 'portrait',
    interactionMode: 'scroll',
    liveTranslateEnabled: settingsStorage.isDefaultLiveTranslation(),
  };

  const stored = mainStorage.getObject<Partial<ReaderSettings>>(READER_SETTINGS_KEY);
  if (!stored) {
    return dynamicDefaults;
  }
  return {
    ...dynamicDefaults,
    ...stored,
  };
};

export const saveStoredReaderSettings = (settings: ReaderSettings): void => {
  mainStorage.setObject(READER_SETTINGS_KEY, settings);
  try {
    if (settings.readingMode) settingsStorage.setDefaultReadingMode(settings.readingMode);
    if (settings.theme) settingsStorage.setReaderBgColor(settings.theme);
    if (settings.keepScreenAwake !== undefined) settingsStorage.setKeepAwakeEnabled(settings.keepScreenAwake);
    if (settings.volumeKeysEnabled !== undefined) settingsStorage.setVolumeKeysEnabled(settings.volumeKeysEnabled);
    if (settings.showFloatingPageNumber !== undefined) settingsStorage.setPageNumberPillEnabled(settings.showFloatingPageNumber);
    if (settings.disableTapZonesInWebtoon !== undefined) settingsStorage.setTapZonesEnabled(!settings.disableTapZonesInWebtoon);
    if (settings.cropWhiteBorders !== undefined) settingsStorage.setAutoCropMargins(settings.cropWhiteBorders);
    if (settings.liveTranslateEnabled !== undefined) settingsStorage.setDefaultLiveTranslation(settings.liveTranslateEnabled);
  } catch {}
};

export const getStoredReaderProgress = (
  comicLink: string,
): ReaderProgress | null => {
  if (!comicLink) return null;
  return (
    mainStorage.getObject<ReaderProgress>(`${READER_PROGRESS_PREFIX}${comicLink}`) ||
    null
  );
};

export const saveStoredReaderProgress = ({
  comicLink,
  chapterId,
  chapterTitle,
  chapterIndex,
  currentPageIndex,
  totalPages,
  readingMode,
  comicTitle,
  poster,
  providerValue,
}: {
  comicLink: string;
  chapterId: string;
  chapterTitle: string;
  chapterIndex: number;
  currentPageIndex: number;
  totalPages: number;
  readingMode: ReaderSettings['readingMode'];
  comicTitle?: string;
  poster?: string;
  providerValue?: string;
}): void => {
  if (!comicLink) return;

  const now = Date.now();
  const progress: ReaderProgress = {
    comicLink,
    chapterId,
    chapterTitle,
    chapterIndex,
    currentPageIndex,
    totalPages,
    readingMode,
    updatedAt: now,
  };

  // 1. Save to MMKV reader progress key
  mainStorage.setObject(`${READER_PROGRESS_PREFIX}${comicLink}`, progress);

  // 2. Save to watchProgressStorage (for chapter read percentage calculation)
  // Store page progress: position = currentPageIndex + 1, duration = totalPages
  if (chapterId) {
    watchProgressStorage.setProgress(
      chapterId,
      currentPageIndex + 1,
      totalPages > 0 ? totalPages : 100,
    );
  }

  // 3. Update Continue Watching Store for immediate Home/Info UI sync
  const chapterNumberMatch = chapterTitle.match(
    /(?:chapter|ch\.?|ep\.?|episode)\s*([\d.]+)/i,
  );
  const chapterNum = chapterNumberMatch ? parseFloat(chapterNumberMatch[1]) : chapterIndex + 1;

  const continueItem = {
    id: comicLink,
    title: comicTitle || chapterTitle,
    episodeTitle: chapterTitle,
    seasonTitle: 'Chapters',
    episode: {
      id: chapterId,
      title: chapterTitle,
      link: chapterId,
    } as EpisodeLink,
    type: 'comic',
    poster: poster || '',
    background: poster || '',
    providerValue: providerValue || '',
    infoUrl: comicLink,
    position: currentPageIndex + 1,
    duration: totalPages > 0 ? totalPages : 100,
    updatedAt: now,
    chapterNumber: chapterNum,
    page: currentPageIndex + 1,
    totalPages: totalPages > 0 ? totalPages : 1,
  };

  useContinueWatchingStore.getState().upsertItem(continueItem);
};
