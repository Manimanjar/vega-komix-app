import {watchListStorage} from '../lib/storage/WatchListStorage';
import {providerManager} from '../lib/services/ProviderManager';
import useWatchListStore from '../lib/zustand/watchListStore';

export interface LibraryUpdateReport {
  checkedCount: number;
  updatedCount: number;
  results: Array<{
    link: string;
    title: string;
    previousCount: number;
    currentCount: number;
    newChaptersCount: number;
  }>;
}

class LibraryUpdateChecker {
  private isChecking = false;
  private lastCheckTimestamp = 0;
  private readonly THROTTLE_MS = 60 * 1000; // 1-minute throttle unless explicitly pulled to refresh

  /**
   * Fast background check against providers for all bookmarked comics in the library
   */
  async checkLibraryUpdates(force = false): Promise<LibraryUpdateReport> {
    const now = Date.now();
    if (this.isChecking) {
      return {checkedCount: 0, updatedCount: 0, results: []};
    }
    if (!force && now - this.lastCheckTimestamp < this.THROTTLE_MS) {
      return {checkedCount: 0, updatedCount: 0, results: []};
    }

    this.isChecking = true;
    this.lastCheckTimestamp = now;

    const watchList = watchListStorage.getWatchList();
    const results: LibraryUpdateReport['results'] = [];
    let updatedCount = 0;

    try {
      // Concurrently check in micro-batches of 3 to avoid overwhelming providers
      const batchSize = 3;
      for (let i = 0; i < watchList.length; i += batchSize) {
        const batch = watchList.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async item => {
            if (!item.link || !item.provider || item.provider === 'local') return;

            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 12000);
              let meta;
              try {
                meta = await providerManager.getMetaData({
                  link: item.link,
                  provider: item.provider,
                  signal: controller.signal,
                });
              } finally {
                clearTimeout(timeoutId);
              }

              const rawChapters = meta?.chapters || meta?.linkList || [];
              let currentTotalChapters = Array.isArray(rawChapters)
                ? rawChapters.length
                : 0;

              // Some providers return a single placeholder entry from
              // getMeta (e.g. MangaDex returns one "Chapters" linkList row)
              // while the real chapter list lives behind getChapters /
              // getEpisodes. Resolve it, so the +N badge can actually grow
              // for those titles instead of being pinned at 1 forever.
              if (currentTotalChapters <= 1) {
                const episodesLink = meta?.linkList?.find(
                  entry => entry.episodesLink,
                )?.episodesLink;
                if (episodesLink) {
                  try {
                    const chaptersController = new AbortController();
                    const chaptersTimeoutId = setTimeout(
                      () => chaptersController.abort(),
                      12000,
                    );
                    try {
                      const chapters = await providerManager.getChapters({
                        url: episodesLink,
                        providerValue: item.provider,
                        signal: chaptersController.signal,
                        silent: true,
                      });
                      if (Array.isArray(chapters) && chapters.length > 0) {
                        currentTotalChapters = chapters.length;
                      }
                    } finally {
                      clearTimeout(chaptersTimeoutId);
                    }
                  } catch {
                    // Keep the meta count: a failed chapter fetch must not
                    // break the background update check.
                  }
                }
              }

              if (currentTotalChapters > 0) {
                const previousCount =
                  item.lastKnownChapterCount ?? currentTotalChapters;
                const updateRes = watchListStorage.recordChapterCount(
                  item.link,
                  currentTotalChapters,
                );

                if (updateRes.newChaptersCount > 0) {
                  updatedCount++;
                  results.push({
                    link: item.link,
                    title: item.title,
                    previousCount,
                    currentCount: currentTotalChapters,
                    newChaptersCount: updateRes.newChaptersCount,
                  });
                }
              }
            } catch {
              // Silently ignore network timeouts/provider errors during background check
            }
          }),
        );
      }

      if (updatedCount > 0) {
        useWatchListStore.getState().syncFromStorage();
      }
    } finally {
      this.isChecking = false;
    }

    return {
      checkedCount: watchList.length,
      updatedCount,
      results,
    };
  }

  isCheckActive(): boolean {
    return this.isChecking;
  }
}

export const libraryUpdateChecker = new LibraryUpdateChecker();
