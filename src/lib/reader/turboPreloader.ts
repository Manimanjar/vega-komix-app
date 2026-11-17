import {Image as ExpoImage} from 'expo-image';
import type {EpisodeLink, PageImage} from '../providers/types';
import {resolvePageHeaders} from '../../components/reader/usePagePreloader';
import {autoDomainResolver} from '../network/autoDomainResolver';
import {cleanHighResImageUrl} from './highResImageCleaner';
import {instantChapterLauncher} from './instantChapterLauncher';
import {settingsStorage} from '../storage/SettingsStorage';

export interface TurboStats {
  readyAheadCount: number;
  maxAheadCount: number;
  nextChapterReady: boolean;
  statusText: string;
}

export type TurboStatsListener = (stats: TurboStats) => void;

class TurboPreloader {
  private prefetchedUrls = new Set<string>();
  private inFlight = new Map<string, Promise<void>>();
  private currentAbortController: AbortController | null = null;
  private nextChapterPreloadedLinks = new Set<string>();
  private listeners = new Set<TurboStatsListener>();
  private lastStats: TurboStats = {
    readyAheadCount: 0,
    maxAheadCount: 8,
    nextChapterReady: false,
    statusText: 'Turbo: Ready',
  };

  /**
   * Returns current turbo stats
   */
  public getStats(): TurboStats {
    return {
      ...this.lastStats,
      maxAheadCount: settingsStorage.getTurboPreloadCount(),
    };
  }

  /**
   * Subscribe to stats changes (for Reader HUD live badge)
   */
  public subscribe(listener: TurboStatsListener): () => void {
    this.listeners.add(listener);
    listener(this.lastStats);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(stats: TurboStats): void {
    // Identical stats must not re-notify: the reader subscribes with
    // setTurboStats, so every notify re-rendered the whole reader screen —
    // twice per page turn, for a badge the HUD does not even display.
    const prev = this.lastStats;
    if (
      prev.readyAheadCount === stats.readyAheadCount &&
      prev.maxAheadCount === stats.maxAheadCount &&
      prev.nextChapterReady === stats.nextChapterReady &&
      prev.statusText === stats.statusText
    ) {
      return;
    }
    this.lastStats = stats;
    for (const listener of this.listeners) {
      try {
        listener(stats);
      } catch {}
    }
  }

  /**
   * OOM Memory Guard
   * Bitmap images are strictly mounted ONLY within [currentIndex - 3, currentIndex + 5].
   * Distant pages are kept as lightweight layout placeholders to prevent Out-Of-Memory crashes.
   */
  public isPageBitmapActive(pageIndex: number, currentIndex: number): boolean {
    return pageIndex >= currentIndex - 3 && pageIndex <= currentIndex + 5;
  }

  /**
   * Checks if an image URL has already been pre-decoded into memory/disk cache
   */
  public isUrlPrefetched(rawUrl?: string): boolean {
    if (!rawUrl) return false;
    const resolved = autoDomainResolver.rewriteUrlWithResolvedDomain(rawUrl);
    return this.prefetchedUrls.has(resolved) || this.prefetchedUrls.has(rawUrl);
  }

  /**
   * Schedules a prioritized, 3-tier sliding window prefetch
   */
  public async scheduleWindowPrefetch({
    pages,
    currentPageIndex,
    allChapters = [],
    currentChapterIndex = 0,
    providerValue = '',
  }: {
    pages: PageImage[];
    currentPageIndex: number;
    allChapters?: EpisodeLink[];
    currentChapterIndex?: number;
    providerValue?: string;
  }): Promise<void> {
    if (!pages || pages.length === 0) return;

    // Abort previous background sliding window prefetch if running
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    const signal = abortController.signal;

    const totalPages = pages.length;
    const maxAhead = settingsStorage.getTurboPreloadCount(); // User-configured sliding lookahead window

    // Priority 1 (Immediate): Current page + next 3 pages in view direction + previous page for back-scroll
    const immediateIndices: number[] = [];
    if (currentPageIndex > 0) {
      immediateIndices.push(currentPageIndex - 1);
    }
    for (let i = currentPageIndex; i <= currentPageIndex + 3 && i < totalPages; i++) {
      if (i >= 0 && !immediateIndices.includes(i)) immediateIndices.push(i);
    }

    // Priority 2 (Sliding Lookahead): Pages [index + 4 ... index + 8]
    const slidingIndices: number[] = [];
    for (let i = currentPageIndex + 4; i <= currentPageIndex + maxAhead && i < totalPages; i++) {
      slidingIndices.push(i);
    }

    // Immediately trigger Priority 1 in parallel
    const p1Promises = immediateIndices.map(async idx => {
      const page = pages[idx];
      if (page) await this.preloadPageImage(page);
    });
    await Promise.allSettled(p1Promises);

    if (signal.aborted) return;
    this.updateStats(pages, currentPageIndex);

    // Concurrently trigger Priority 2 in parallel
    const p2Promises = slidingIndices.map(async idx => {
      if (signal.aborted) return;
      const page = pages[idx];
      if (page) await this.preloadPageImage(page);
    });
    await Promise.allSettled(p2Promises);

    if (signal.aborted) return;
    this.updateStats(pages, currentPageIndex);

    // Tier 3: Priority 3 (Seamless Next Chapter Warmup)
    // When user reaches >= 75% scroll or last 5 pages of the current chapter
    const handoffThreshold = Math.min(Math.floor(totalPages * 0.75), Math.max(0, totalPages - 5));
    if (currentPageIndex >= handoffThreshold && allChapters.length > 0) {
      const nextIndex = currentChapterIndex + 1;
      if (nextIndex < allChapters.length) {
        const nextChapter = allChapters[nextIndex];
        if (
          nextChapter?.link &&
          !this.nextChapterPreloadedLinks.has(nextChapter.link)
        ) {
          this.nextChapterPreloadedLinks.add(nextChapter.link);
          this.preloadNextChapter(nextChapter, providerValue);
        }
      }
    }
  }

  /**
   * Preloads a single PageImage with autoDomainResolver and anti-hotlink headers
   */
  private async preloadPageImage(page: PageImage): Promise<void> {
    const rawUrl = page.imageUrl || (page as any).url || (page as any).link || '';
    if (!rawUrl || rawUrl.startsWith('file://')) return;

    const targetUrl = cleanHighResImageUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(rawUrl));
    if (this.prefetchedUrls.has(targetUrl)) return;

    const existingPromise = this.inFlight.get(targetUrl);
    if (existingPromise) return existingPromise;

    const promise = (async () => {
      try {
        const resolvedHeaders = await resolvePageHeaders(targetUrl, page.headers);
        await ExpoImage.prefetch(targetUrl, {
          headers: resolvedHeaders,
          cachePolicy: 'disk',
        });
        this.prefetchedUrls.add(targetUrl);
        this.prefetchedUrls.add(rawUrl);
      } catch {
        // Silently catch background prefetch errors
      } finally {
        this.inFlight.delete(targetUrl);
      }
    })();

    this.inFlight.set(targetUrl, promise);
    return promise;
  }

  /**
   * Preloads next chapter manifest and its first 3 pages
   */
  private async preloadNextChapter(
    chapter: EpisodeLink,
    providerValue: string,
  ): Promise<void> {
    try {
      const effProvider = (chapter as any).provider || providerValue;
      const pages = await instantChapterLauncher.preloadChapter(
        chapter.link,
        effProvider,
        {
          chapterTitle: chapter.title,
          chapterNumber: (chapter as any).chapterNumber,
        },
      );

      // Preload first 4 pages of the next chapter
      if (Array.isArray(pages) && pages.length > 0) {
        const firstPages = pages.slice(0, 4);
        for (const p of firstPages) {
          await this.preloadPageImage(p);
        }
      }

      this.notify({
        ...this.lastStats,
        nextChapterReady: true,
        statusText: `Turbo: +${this.lastStats.readyAheadCount} • Next Ch Ready`,
      });
    } catch {
      // Background handoff should not throw
    }
  }

  private updateStats(pages: PageImage[], currentPageIndex: number): void {
    let ready = 0;
    const lookahead = 8;
    for (
      let i = currentPageIndex + 1;
      i <= currentPageIndex + lookahead && i < pages.length;
      i++
    ) {
      const p = pages[i];
      if (p && this.isUrlPrefetched(p.imageUrl)) {
        ready++;
      }
    }

    const nextReady = this.lastStats.nextChapterReady;
    const statusText = nextReady
      ? `Turbo: +${ready} • Next Ch Ready`
      : ready >= 6
      ? `Turbo: +${ready} Ready`
      : `Turbo: +${ready}/${lookahead}`;

    this.notify({
      readyAheadCount: ready,
      maxAheadCount: lookahead,
      nextChapterReady: nextReady,
      statusText,
    });
  }
}

export const turboPreloader = new TurboPreloader();
