import {mainStorage} from './StorageService';

/**
 * Storage keys for the library (saved titles and their categories)
 */
export enum WatchListKeys {
  WATCH_LIST = 'watchlist',
  COLLECTIONS = 'library-collections',
  /** Set once the Watchlist category was added to the stored categories. */
  DEFAULT_COLLECTION_ADDED = 'library-default-collection-added',
}

/**
 * Category every library starts with. It is stored like any other category,
 * so the user can rename or delete it. While it exists, it holds titles saved
 * by older app versions and titles whose categories were all deleted.
 */
export const DEFAULT_COLLECTION_ID = 'reading';

export interface WatchListItem {
  title: string;
  poster: string;
  link: string;
  provider: string;
  updatedAt?: number;
  /** Category ids. Missing or empty means the default category. */
  collections?: string[];
  totalReleasedChapters?: number;
  lastKnownChapterCount?: number;
  lastReadChapterNumber?: number;
  lastReadChapterIndex?: number;
  newChaptersCount?: number;
  isNew?: boolean;
}

/**
 * User-made library category. `icon` is a key from LIBRARY_ICONS or an emoji.
 */
export interface LibraryCollection {
  id: string;
  name: string;
  icon: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_COLLECTIONS: LibraryCollection[] = [
  {
    id: 'reading',
    name: 'Reading',
    icon: 'book',
    color: '#8B5CF6',
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'plan_to_read',
    name: 'Plan to Read',
    icon: 'bookmark',
    color: '#3B82F6',
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: 'completed',
    name: 'Completed',
    icon: 'check',
    color: '#22C55E',
    createdAt: 3,
    updatedAt: 3,
  },
  {
    id: 'favorites',
    name: 'Favorites',
    icon: 'heart',
    color: '#EC4899',
    createdAt: 4,
    updatedAt: 4,
  },
];

export const DEFAULT_COLLECTION: LibraryCollection = DEFAULT_COLLECTIONS[0];

/**
 * Categories of an item, limited to categories that exist. Falls back to
 * Reading while it exists; otherwise the item is in no category and shows
 * only under All.
 */
export const getItemCollectionIds = (
  item: WatchListItem,
  existingIds: ReadonlySet<string>,
): string[] => {
  const ids = (item.collections || []).filter(id => existingIds.has(id));
  if (ids.length > 0) {
    return ids;
  }
  if (existingIds.has(DEFAULT_COLLECTION_ID)) {
    return [DEFAULT_COLLECTION_ID];
  }
  if (existingIds.has('watchlist')) {
    return ['watchlist'];
  }
  return [];
};

export const createCollectionId = (): string =>
  `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Watchlist storage manager
 */
export class WatchListStorage {
  /**
   * Get all watchlist items
   */
  getWatchList(): WatchListItem[] {
    const watchList =
      mainStorage.getArray<Partial<WatchListItem>>(WatchListKeys.WATCH_LIST) ||
      [];
    return watchList
      .filter(item => Boolean(item.title && item.link && item.provider))
      .map(item => ({...item, poster: item.poster || ''}) as WatchListItem);
  }

  /**
   * Add an item to the watchlist
   */
  addToWatchList(item: WatchListItem): WatchListItem[] {
    if (!item.provider) {
      return this.getWatchList();
    }
    const watchList = this.getWatchList();

    // Filter out any existing item with the same link
    const newWatchList = watchList.filter(i => i.link !== item.link);

    // Add the new item to the end. Without categories it goes to Watchlist,
    // or to the only category when Watchlist was deleted.
    const collections = this.getCollections();
    const fallback = collections.some(c => c.id === DEFAULT_COLLECTION_ID)
      ? [DEFAULT_COLLECTION_ID]
      : collections.length === 1
        ? [collections[0].id]
        : [];
    const hasReadProgress =
      (item.lastReadChapterNumber ?? item.lastReadChapterIndex ?? 0) > 0;
    newWatchList.push({
      ...item,
      isNew: item.isNew ?? !hasReadProgress,
      collections: item.collections?.length ? item.collections : fallback,
      updatedAt: Date.now(),
    });

    // Save the updated watchlist
    mainStorage.setArray(WatchListKeys.WATCH_LIST, newWatchList);

    return newWatchList;
  }

  /**
   * Set the categories of an item. Adds the item when it is not saved yet and
   * removes it when no category is left.
   */
  setItemCollections(item: WatchListItem, ids: string[]): WatchListItem[] {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return this.removeFromWatchList(item.link);
    }
    const watchList = this.getWatchList();
    const index = watchList.findIndex(i => i.link === item.link);
    if (index === -1) {
      return this.addToWatchList({...item, collections: unique});
    }
    watchList[index] = {
      ...watchList[index],
      collections: unique,
      updatedAt: Date.now(),
    };
    mainStorage.setArray(WatchListKeys.WATCH_LIST, watchList);
    return watchList;
  }

  /**
   * Remove an item from the watchlist
   */
  removeFromWatchList(link: string): WatchListItem[] {
    const watchList = this.getWatchList();
    const newWatchList = watchList.filter(item => item.link !== link);

    mainStorage.setArray(WatchListKeys.WATCH_LIST, newWatchList);

    return newWatchList;
  }

  /**
   * Clear all items from the watchlist
   */
  clearWatchList(): WatchListItem[] {
    const emptyList: WatchListItem[] = [];
    mainStorage.setArray(WatchListKeys.WATCH_LIST, emptyList);
    return emptyList;
  }

  /**
   * Check if an item exists in the watchlist
   */
  isInWatchList(link: string): boolean {
    const watchList = this.getWatchList();
    return watchList.some(item => item.link === link);
  }

  /**
   * Library categories, oldest first, Watchlist included while it exists.
   */
  getCollections(): LibraryCollection[] {
    const collections = (
      mainStorage.getArray<LibraryCollection>(WatchListKeys.COLLECTIONS) || []
    ).filter(c => Boolean(c?.id && c.name));
    if (!mainStorage.getBool(WatchListKeys.DEFAULT_COLLECTION_ADDED, false)) {
      mainStorage.setBool(WatchListKeys.DEFAULT_COLLECTION_ADDED, true);
      const merged = [...DEFAULT_COLLECTIONS];
      for (const col of collections) {
        if (!merged.some(m => m.id === col.id)) {
          merged.push(col);
        }
      }
      return this.saveCollections(merged);
    }
    return collections.sort((a, b) => a.createdAt - b.createdAt);
  }

  saveCollections(collections: LibraryCollection[]): LibraryCollection[] {
    const sorted = [...collections].sort((a, b) => a.createdAt - b.createdAt);
    mainStorage.setArray(WatchListKeys.COLLECTIONS, sorted);
    return sorted;
  }

  /**
   * Delete a category. Its titles stay in the library: titles in no other
   * category move to Watchlist, or to no category when Watchlist is gone.
   */
  deleteCollection(id: string): {
    collections: LibraryCollection[];
    watchList: WatchListItem[];
  } {
    const collections = this.saveCollections(
      this.getCollections().filter(c => c.id !== id),
    );
    const fallback = collections.some(c => c.id === DEFAULT_COLLECTION_ID)
      ? [DEFAULT_COLLECTION_ID]
      : [];
    const now = Date.now();
    let changed = false;
    const watchList = this.getWatchList().map(item => {
      if (!item.collections?.includes(id)) {
        return item;
      }
      changed = true;
      const rest = item.collections.filter(c => c !== id);
      return {
        ...item,
        collections: rest.length > 0 ? rest : fallback,
        updatedAt: now,
      };
    });
    if (changed) {
      mainStorage.setArray(WatchListKeys.WATCH_LIST, watchList);
    }
    return {collections, watchList};
  }

  /**
   * Retrieves the number of unread / new chapters for a bookmarked comic.
   * unreadCount = totalReleasedChapters - lastReadChapterIndex
   */
  getUnreadChapterCount(comicLink: string): number {
    if (!comicLink) return 0;
    const watchList = this.getWatchList();
    const item = watchList.find(i => i.link === comicLink);
    if (!item) return 0;
    const total =
      item.totalReleasedChapters ?? item.lastKnownChapterCount ?? 0;
    const read =
      item.lastReadChapterIndex ?? item.lastReadChapterNumber ?? 0;
    if (total > read) {
      return total - read;
    }
    if (typeof item.newChaptersCount === 'number' && item.newChaptersCount > 0) {
      return item.newChaptersCount;
    }
    return 0;
  }

  /**
   * Returns whether a comic is marked as new with 0 read progress.
   */
  getNewComicStatus(comicLink: string): boolean {
    if (!comicLink) return false;
    const watchList = this.getWatchList();
    const item = watchList.find(i => i.link === comicLink);
    if (!item) return false;
    const read =
      item.lastReadChapterIndex ?? item.lastReadChapterNumber ?? 0;
    return Boolean(item.isNew && read === 0);
  }

  /**
   * Records provider chapter count and computes newly added chapters.
   */
  recordChapterCount(
    comicLink: string,
    currentTotalChapters: number,
  ): {newChaptersCount: number} {
    if (!comicLink || currentTotalChapters <= 0) return {newChaptersCount: 0};
    const watchList = this.getWatchList();
    const index = watchList.findIndex(i => i.link === comicLink);
    if (index === -1) return {newChaptersCount: 0};

    const item = watchList[index];
    const lastRead =
      item.lastReadChapterIndex ?? item.lastReadChapterNumber ?? 0;
    const previousTotal =
      item.totalReleasedChapters ?? item.lastKnownChapterCount ?? 0;

    let newCount = 0;
    if (currentTotalChapters > previousTotal && previousTotal > 0) {
      newCount = currentTotalChapters - Math.max(previousTotal, lastRead);
    } else if (currentTotalChapters > lastRead) {
      newCount = currentTotalChapters - lastRead;
    }

    const calculatedUnread = Math.max(0, currentTotalChapters - lastRead);

    watchList[index] = {
      ...item,
      totalReleasedChapters: currentTotalChapters,
      lastKnownChapterCount: currentTotalChapters,
      newChaptersCount: calculatedUnread,
      updatedAt: Date.now(),
    };

    mainStorage.setArray(WatchListKeys.WATCH_LIST, watchList);
    return {newChaptersCount: calculatedUnread};
  }

  /**
   * Acknowledges new chapters (e.g. when opening comic/Info screen) and clears the badge.
   */
  acknowledgeChapters(comicLink: string, totalChapters?: number): void {
    if (!comicLink) return;
    const watchList = this.getWatchList();
    const index = watchList.findIndex(i => i.link === comicLink);
    if (index === -1) return;

    const item = watchList[index];
    const newBaseline =
      typeof totalChapters === 'number' && totalChapters > 0
        ? totalChapters
        : item.totalReleasedChapters || item.lastKnownChapterCount || 0;

    watchList[index] = {
      ...item,
      lastKnownChapterCount: Math.max(item.lastKnownChapterCount || 0, newBaseline),
      totalReleasedChapters: Math.max(item.totalReleasedChapters || 0, newBaseline),
      newChaptersCount: 0,
      isNew: false,
      updatedAt: Date.now(),
    };
    mainStorage.setArray(WatchListKeys.WATCH_LIST, watchList);
  }

  /**
   * Records last read chapter number.
   */
  recordLastReadChapter(comicLink: string, chapterNumber: number): void {
    if (!comicLink) return;
    const watchList = this.getWatchList();
    const index = watchList.findIndex(i => i.link === comicLink);
    if (index === -1) return;

    const item = watchList[index];
    const newRead = Math.max(
      item.lastReadChapterNumber || 0,
      item.lastReadChapterIndex || 0,
      chapterNumber,
    );
    const total =
      item.totalReleasedChapters ?? item.lastKnownChapterCount ?? 0;
    const unread = Math.max(0, total - newRead);

    const updated: WatchListItem = {
      ...item,
      lastReadChapterNumber: newRead,
      lastReadChapterIndex: newRead,
      newChaptersCount: unread,
      isNew: false,
      updatedAt: Date.now(),
    };

    watchList[index] = updated;
    mainStorage.setArray(WatchListKeys.WATCH_LIST, watchList);
  }

  /**
   * Records last read chapter index (0-based or 1-based, aligns with recordLastReadChapter).
   */
  recordLastReadChapterIndex(comicLink: string, chapterIndex: number): void {
    this.recordLastReadChapter(comicLink, chapterIndex);
  }

  /**
   * Sets whether comic has NEW badge.
   */
  markComicAsNew(comicLink: string, isNew: boolean): void {
    if (!comicLink) return;
    const watchList = this.getWatchList();
    const index = watchList.findIndex(i => i.link === comicLink);
    if (index === -1) return;

    watchList[index] = {
      ...watchList[index],
      isNew,
      updatedAt: Date.now(),
    };
    mainStorage.setArray(WatchListKeys.WATCH_LIST, watchList);
  }
}

// Export a singleton instance
export const watchListStorage = new WatchListStorage();

/**
 * Convenience utility to get unread chapter count for any comic link
 */
export const getUnreadChapterCount = (comicLink: string): number =>
  watchListStorage.getUnreadChapterCount(comicLink);
