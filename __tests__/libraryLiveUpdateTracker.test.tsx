const getGlobalStore = () => {
  if (!(global as any).__testMMKVStore) {
    (global as any).__testMMKVStore = new Map<string, unknown>();
  }
  return (global as any).__testMMKVStore as Map<string, unknown>;
};

jest.mock('react-native-mmkv-storage', () => ({
  MMKVLoader: class {
    withInstanceID() {
      return this;
    }

    initialize() {
      const store = (global as any).__testMMKVStore || ((global as any).__testMMKVStore = new Map());
      return {
        getString: (key: string) => store.get(key),
        setString: (key: string, value: string) => store.set(key, value),
        getBool: (key: string) => store.get(key),
        setBool: (key: string, value: boolean) => store.set(key, value),
        getInt: (key: string) => store.get(key),
        setInt: (key: string, value: number) => store.set(key, value),
        getArray: (key: string) => {
          const val = store.get(key);
          if (!val) return null;
          return typeof val === 'string' ? JSON.parse(val) : val;
        },
        setArray: (key: string, value: any[]) => store.set(key, JSON.stringify(value)),
        removeItem: (key: string) => store.delete(key),
        clearStore: () => store.clear(),
      };
    }
  },
}));

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {
  calculateUnreadChapters,
  isNewComicWithZeroProgress,
} from '../src/screens/Library';
import {
  watchListStorage,
  type WatchListItem,
} from '../src/lib/storage/WatchListStorage';
import {libraryUpdateChecker} from '../src/services/libraryUpdateChecker';
import {providerManager} from '../src/lib/services/ProviderManager';

describe('Library Live Update Tracker & Green +X Badges', () => {
  beforeEach(() => {
    getGlobalStore().clear();
    jest.clearAllMocks();
  });

  describe('Unread Chapter & New Badge Math', () => {
    it('calculates unread chapter count as totalReleasedChapters - lastReadChapterIndex', () => {
      const item: Partial<WatchListItem> = {
        totalReleasedChapters: 45,
        lastReadChapterIndex: 12,
      };
      expect(calculateUnreadChapters(item)).toBe(33);
    });

    it('returns 0 when user is caught up with all released chapters', () => {
      const item: Partial<WatchListItem> = {
        totalReleasedChapters: 50,
        lastReadChapterIndex: 50,
      };
      expect(calculateUnreadChapters(item)).toBe(0);
    });

    it('handles legacy lastKnownChapterCount and lastReadChapterNumber seamlessly', () => {
      const item: Partial<WatchListItem> = {
        lastKnownChapterCount: 100,
        lastReadChapterNumber: 85,
      };
      expect(calculateUnreadChapters(item)).toBe(15);
    });

    it('identifies newly added comics with 0 read progress', () => {
      const freshComic: Partial<WatchListItem> = {
        isNew: true,
        lastReadChapterIndex: 0,
      };
      expect(isNewComicWithZeroProgress(freshComic)).toBe(true);

      const comicWithoutProgress: Partial<WatchListItem> = {
        isNew: true,
      };
      expect(isNewComicWithZeroProgress(comicWithoutProgress)).toBe(true);
    });

    it('detects that comics with read chapters are no longer new', () => {
      const readComic: Partial<WatchListItem> = {
        isNew: true,
        lastReadChapterIndex: 3,
      };
      expect(isNewComicWithZeroProgress(readComic)).toBe(false);
    });
  });

  describe('WatchListStorage Diff Persistence', () => {
    it('initializes isNew to true for newly added comics without reading progress', () => {
      const comic: WatchListItem = {
        title: 'Solo Leveling',
        poster: 'https://example.com/poster.jpg',
        link: 'https://example.com/manga/solo-leveling',
        provider: 'asura',
      };
      watchListStorage.addToWatchList(comic);

      const saved = watchListStorage.getWatchList();
      expect(saved.length).toBe(1);
      expect(saved[0].isNew).toBe(true);
      expect(watchListStorage.getNewComicStatus(comic.link)).toBe(true);
    });

    it('records fresh scraper chapter count and accurately tracks unread diff', () => {
      const comic: WatchListItem = {
        title: 'Tower of God',
        poster: 'https://example.com/tog.jpg',
        link: 'https://example.com/manga/tog',
        provider: 'asura',
        lastReadChapterIndex: 10,
      };
      watchListStorage.addToWatchList(comic);

      // Scraper finds 15 chapters released
      const res = watchListStorage.recordChapterCount(comic.link, 15);
      expect(res.newChaptersCount).toBe(5);

      const unread = watchListStorage.getUnreadChapterCount(comic.link);
      expect(unread).toBe(5);
    });

    it('advances last read chapter, recalibrates unread diff, and turns off NEW status', () => {
      const comic: WatchListItem = {
        title: 'Omniscient Reader',
        poster: 'https://example.com/orv.jpg',
        link: 'https://example.com/manga/orv',
        provider: 'asura',
        totalReleasedChapters: 200,
        isNew: true,
      };
      watchListStorage.addToWatchList(comic);

      // User reads up to chapter 150
      watchListStorage.recordLastReadChapter(comic.link, 150);

      expect(watchListStorage.getNewComicStatus(comic.link)).toBe(false);
      expect(watchListStorage.getUnreadChapterCount(comic.link)).toBe(50);
    });

    it('acknowledges chapters and clears badge once inspected or caught up', () => {
      const comic: WatchListItem = {
        title: 'Wind Breaker',
        poster: 'https://example.com/wb.jpg',
        link: 'https://example.com/manga/wb',
        provider: 'asura',
        totalReleasedChapters: 100,
        newChaptersCount: 5,
        isNew: true,
      };
      watchListStorage.addToWatchList(comic);

      watchListStorage.acknowledgeChapters(comic.link);
      const updated = watchListStorage.getWatchList().find(i => i.link === comic.link);
      expect(updated?.newChaptersCount).toBe(0);
      expect(updated?.isNew).toBe(false);
    });
  });

  describe('Library Update Checker Service', () => {
    it('micro-batches provider requests and updates chapter counts on force refresh', async () => {
      const comic: WatchListItem = {
        title: 'Return of the Mount Hua Sect',
        poster: 'https://example.com/mount.jpg',
        link: 'https://example.com/manga/mount-hua',
        provider: 'asura',
        lastKnownChapterCount: 120,
        lastReadChapterIndex: 120,
      };
      watchListStorage.addToWatchList(comic);

      // Mock provider returning 125 chapters
      jest.spyOn(providerManager, 'getMetaData').mockResolvedValueOnce({
        chapters: new Array(125).fill({link: 'ch', title: 'Chapter'}),
      } as any);

      const report = await libraryUpdateChecker.checkLibraryUpdates(true);
      expect(report.checkedCount).toBe(1);
      expect(report.updatedCount).toBe(1);
      expect(report.results[0].newChaptersCount).toBe(5);

      expect(watchListStorage.getUnreadChapterCount(comic.link)).toBe(5);
    });

    it('throttles unforced background checks within 60 seconds', async () => {
      const report1 = await libraryUpdateChecker.checkLibraryUpdates(true);
      expect(report1.checkedCount).toBeGreaterThanOrEqual(0);

      // Immediate unforced check should be throttled
      const report2 = await libraryUpdateChecker.checkLibraryUpdates(false);
      expect(report2.checkedCount).toBe(0);
      expect(report2.updatedCount).toBe(0);
    });
  });
});
