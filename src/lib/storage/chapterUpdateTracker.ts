import {useSyncExternalStore} from 'react';
import {mainStorage} from './StorageService';
import {watchListStorage} from './WatchListStorage';

const STORAGE_KEY = 'vega-komix-chapter-delta-v1';
const MAX_STORED_CHAPTER_IDS = 500;
const MAX_TRACKED_COMICS = 1000;

export interface ChapterSnapshotRecord {
  comicId: string;
  knownChapterCount: number;
  knownChapterIds: string[];
  newChaptersCount: number;
  newChapterIds: string[];
  updatedAt: number;
}

export interface ChapterLike {
  id?: string;
  link?: string;
  title?: string;
  isNew?: boolean;
}

export type ChapterInput = ChapterLike | string;

const EMPTY_SET: Set<string> = new Set();

export function normalizeComicId(comicId?: string): string {
  if (!comicId) return '';
  return comicId.trim().replace(/\/+$/, '');
}

export function extractChapterId(chapter: ChapterInput, index?: number): string {
  if (typeof chapter === 'string') return chapter.trim();
  const raw = chapter.id || chapter.link || chapter.title || '';
  if (raw) return String(raw).trim();
  return typeof index === 'number' ? `ch-${index}` : '';
}

function extractUniqueChapterIds(chapters: ChapterInput[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const id = extractChapterId(chapters[i], i);
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

class ChapterUpdateTracker {
  private cache: Map<string, ChapterSnapshotRecord> | null = null;
  private sessionNewIds: Map<string, Set<string>> = new Map();
  private listeners: Set<() => void> = new Set();
  private version = 0;

  private loadCache(): Map<string, ChapterSnapshotRecord> {
    if (this.cache) return this.cache;
    const map = new Map<string, ChapterSnapshotRecord>();
    try {
      const stored = mainStorage.getObject<Record<string, ChapterSnapshotRecord>>(STORAGE_KEY);
      if (stored && typeof stored === 'object') {
        for (const [k, v] of Object.entries(stored)) {
          if (v && typeof v.knownChapterCount === 'number') {
            map.set(k, {
              comicId: v.comicId || k,
              knownChapterCount: v.knownChapterCount,
              knownChapterIds: Array.isArray(v.knownChapterIds) ? v.knownChapterIds : [],
              newChaptersCount: typeof v.newChaptersCount === 'number' ? v.newChaptersCount : 0,
              newChapterIds: Array.isArray(v.newChapterIds) ? v.newChapterIds : [],
              updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : Date.now(),
            });
          }
        }
      }
    } catch {}
    this.cache = map;
    return map;
  }

  private persist(): void {
    const cache = this.loadCache();
    // Evict oldest entries if cache grows beyond MAX_TRACKED_COMICS
    if (cache.size > MAX_TRACKED_COMICS) {
      const sorted = Array.from(cache.entries()).sort(
        (a, b) => a[1].updatedAt - b[1].updatedAt,
      );
      const toRemove = sorted.length - MAX_TRACKED_COMICS;
      for (let i = 0; i < toRemove; i++) {
        cache.delete(sorted[i][0]);
      }
    }
    const obj: Record<string, ChapterSnapshotRecord> = {};
    cache.forEach((v, k) => {
      obj[k] = v;
    });
    try {
      mainStorage.setObject(STORAGE_KEY, obj);
    } catch {}
    this.version += 1;
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch {}
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;

  /**
   * Compare fetched chapter list against stored snapshot.
   * If the comic already existed in storage and now has more chapters or new chapter IDs,
   * computes newChaptersCount = currentCount - previousCount (minimum 1 when new IDs detected)
   * and flags those chapter IDs as isNew = true.
   */
  recordChapterListSnapshot(
    rawComicId: string,
    chapters: ChapterInput[],
  ): {newChaptersCount: number; newChapterIds: string[]} {
    const comicId = normalizeComicId(rawComicId);
    if (!comicId || !Array.isArray(chapters) || chapters.length === 0) {
      return {newChaptersCount: 0, newChapterIds: []};
    }

    const cache = this.loadCache();
    const currentIds = extractUniqueChapterIds(chapters);
    const currentCount = chapters.length;
    const existing = cache.get(comicId);

    if (!existing) {
      cache.set(comicId, {
        comicId,
        knownChapterCount: currentCount,
        knownChapterIds: currentIds.slice(0, MAX_STORED_CHAPTER_IDS),
        newChaptersCount: 0,
        newChapterIds: [],
        updatedAt: Date.now(),
      });
      this.persist();
      return {newChaptersCount: 0, newChapterIds: []};
    }

    const knownSet = new Set(existing.knownChapterIds);
    const addedIds =
      existing.knownChapterIds.length > 0
        ? currentIds.filter(id => !knownSet.has(id))
        : [];
    const countDelta = Math.max(0, currentCount - existing.knownChapterCount);

    if (countDelta > 0 || addedIds.length > 0) {
      const newChaptersCount =
        countDelta > 0 ? countDelta : Math.max(1, addedIds.length);
      const mergedNewIds = Array.from(
        new Set([...existing.newChapterIds, ...addedIds]),
      );

      // Flag chapter objects in-place if mutable objects were passed
      const newSet = new Set(mergedNewIds);
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (ch && typeof ch === 'object') {
          const id = extractChapterId(ch, i);
          if (newSet.has(id)) {
            ch.isNew = true;
          }
        }
      }

      // Preserve in session map so chapters stay highlighted after user opens list
      const sessionSet = this.sessionNewIds.get(comicId) || new Set<string>();
      mergedNewIds.forEach(id => sessionSet.add(id));
      this.sessionNewIds.set(comicId, sessionSet);

      cache.set(comicId, {
        ...existing,
        newChaptersCount: Math.max(existing.newChaptersCount, newChaptersCount),
        newChapterIds: mergedNewIds.slice(0, MAX_STORED_CHAPTER_IDS),
        updatedAt: Date.now(),
      });
      this.persist();
      return {
        newChaptersCount: Math.max(existing.newChaptersCount, newChaptersCount),
        newChapterIds: mergedNewIds,
      };
    }

    return {
      newChaptersCount: existing.newChaptersCount,
      newChapterIds: existing.newChapterIds,
    };
  }

  /**
   * Compare fetched comic list items (from Home, Categories, Search) that carry chapterCount.
   */
  recordComicListCounts(
    items: Array<{link?: string; chapterCount?: number}>,
  ): void {
    if (!Array.isArray(items) || items.length === 0) return;
    const cache = this.loadCache();
    let changed = false;

    for (const item of items) {
      const comicId = normalizeComicId(item?.link);
      const count = item?.chapterCount;
      if (!comicId || typeof count !== 'number' || count <= 0) continue;

      const existing = cache.get(comicId);
      if (!existing) {
        cache.set(comicId, {
          comicId,
          knownChapterCount: count,
          knownChapterIds: [],
          newChaptersCount: 0,
          newChapterIds: [],
          updatedAt: Date.now(),
        });
        changed = true;
      } else if (count > existing.knownChapterCount) {
        const delta = count - existing.knownChapterCount;
        if (delta > existing.newChaptersCount) {
          cache.set(comicId, {
            ...existing,
            newChaptersCount: delta,
            updatedAt: Date.now(),
          });
          changed = true;
        }
      }
    }

    if (changed) {
      this.persist();
    }
  }

  /**
   * Update the stored baseline once the user opens the comic's chapter list or reads new chapters,
   * while keeping newly added chapter IDs flagged in the current session.
   */
  acknowledgeComicUpdates(
    rawComicId: string,
    chapters?: ChapterInput[],
  ): void {
    const comicId = normalizeComicId(rawComicId);
    if (!comicId) return;

    const cache = this.loadCache();
    const existing = cache.get(comicId);
    const currentIds = chapters ? extractUniqueChapterIds(chapters) : [];
    const currentCount = chapters ? chapters.length : existing?.knownChapterCount ?? 0;

    if (existing && existing.newChapterIds.length > 0) {
      const sessionSet = this.sessionNewIds.get(comicId) || new Set<string>();
      existing.newChapterIds.forEach(id => sessionSet.add(id));
      this.sessionNewIds.set(comicId, sessionSet);
    }

    if (!existing && currentCount <= 0) return;

    const nextKnownCount = Math.max(
      existing?.knownChapterCount ?? 0,
      currentCount,
    );
    const nextKnownIds =
      currentIds.length > 0
        ? currentIds.slice(0, MAX_STORED_CHAPTER_IDS)
        : existing?.knownChapterIds ?? [];

    if (
      !existing ||
      existing.newChaptersCount > 0 ||
      existing.newChapterIds.length > 0 ||
      existing.knownChapterCount !== nextKnownCount ||
      (currentIds.length > 0 && existing.knownChapterIds.length === 0)
    ) {
      cache.set(comicId, {
        comicId,
        knownChapterCount: nextKnownCount,
        knownChapterIds: nextKnownIds,
        newChaptersCount: 0,
        newChapterIds: [],
        updatedAt: Date.now(),
      });
      this.persist();
    }
  }

  getComicUpdateCount(rawComicId?: string): number {
    const comicId = normalizeComicId(rawComicId);
    if (!comicId) return 0;
    const record = this.loadCache().get(comicId);
    const trackerCount = record?.newChaptersCount ?? 0;
    const watchListCount = watchListStorage.getUnreadChapterCount(comicId);
    return Math.max(trackerCount, watchListCount);
  }

  getNewChapterIds(rawComicId?: string): Set<string> {
    const comicId = normalizeComicId(rawComicId);
    if (!comicId) return EMPTY_SET;
    const record = this.loadCache().get(comicId);
    const sessionSet = this.sessionNewIds.get(comicId);
    if ((!record || record.newChapterIds.length === 0) && (!sessionSet || sessionSet.size === 0)) {
      return EMPTY_SET;
    }
    const merged = new Set<string>(record?.newChapterIds ?? []);
    if (sessionSet) {
      sessionSet.forEach(id => merged.add(id));
    }
    return merged;
  }
}

export const chapterUpdateTracker = new ChapterUpdateTracker();

export const getComicUpdateCount = (comicId?: string): number =>
  chapterUpdateTracker.getComicUpdateCount(comicId);

export const getNewChapterIds = (comicId?: string): Set<string> =>
  chapterUpdateTracker.getNewChapterIds(comicId);

export function useComicUpdateCount(comicId?: string): number {
  useSyncExternalStore(
    chapterUpdateTracker.subscribe,
    chapterUpdateTracker.getVersion,
    chapterUpdateTracker.getVersion,
  );
  return chapterUpdateTracker.getComicUpdateCount(comicId);
}

export function useNewChapterIds(comicId?: string): Set<string> {
  const version = useSyncExternalStore(
    chapterUpdateTracker.subscribe,
    chapterUpdateTracker.getVersion,
    chapterUpdateTracker.getVersion,
  );
  void version;
  return chapterUpdateTracker.getNewChapterIds(comicId);
}
