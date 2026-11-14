import {mainStorage, watchProgressStorage} from '../../lib/storage';
import useContinueWatchingStore from '../../lib/zustand/continueWatchingStore';
import type {EpisodeLink} from '../../lib/providers/types';
import type {ReaderProgress, ReaderSettings} from './types';

const READER_SETTINGS_KEY = 'vega-komix-reader-settings';
const READER_PROGRESS_PREFIX = 'vega-komix-reader-progress:';

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'amoled',
  readingMode: 'manga',
  imageScale: 'fit_width',
  cropWhiteBorders: false,
  keepScreenAwake: true,
  volumeKeysEnabled: false,
  showFloatingPageNumber: true,
  disableTapZonesInWebtoon: false,
  orientationMode: 'auto',
};

export const getStoredReaderSettings = (): ReaderSettings => {
  const stored = mainStorage.getObject<Partial<ReaderSettings>>(READER_SETTINGS_KEY);
  if (!stored) {
    return DEFAULT_READER_SETTINGS;
  }
  return {
    ...DEFAULT_READER_SETTINGS,
    ...stored,
  };
};

export const saveStoredReaderSettings = (settings: ReaderSettings): void => {
  mainStorage.setObject(READER_SETTINGS_KEY, settings);
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
