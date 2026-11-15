import {Image as ExpoImage} from 'expo-image';
import {cacheStorage} from '../storage';
import {providerManager} from '../services/ProviderManager';
import {fetchPagesWithFailover} from '../aggregator/failoverLoader';
import {autoDomainResolver} from '../network/autoDomainResolver';
import {cleanHighResImageUrl} from './highResImageCleaner';
import {resolvePageHeaders} from '../../components/reader/usePagePreloader';
import type {ChapterLink, EpisodeLink, PageImage} from '../providers/types';
import type {ConsolidatedChapterLink} from '../aggregator/seriesRoomEngine';

class InstantChapterLauncher {
  private inFlight = new Map<string, Promise<PageImage[]>>();
  private memoryManifests = new Map<string, PageImage[]>();
  private preloadedUrls = new Set<string>();

  private getManifestKey(chapterLink: string, providerValue: string): string {
    return `chapter_pages_manifest:${providerValue}:${chapterLink}`;
  }

  /**
   * Synchronously checks if the chapter's PageImage manifest is already in memory or disk cache
   */
  getCachedPages(chapterLink: string, providerValue?: string): PageImage[] | null {
    if (!chapterLink) return null;
    const memKey = providerValue ? `${providerValue}:${chapterLink}` : chapterLink;
    if (this.memoryManifests.has(memKey)) {
      return this.memoryManifests.get(memKey)!;
    }

    if (providerValue) {
      const stored = cacheStorage.getString(this.getManifestKey(chapterLink, providerValue));
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.memoryManifests.set(memKey, parsed);
            return parsed;
          }
        } catch {}
      }
    }
    return null;
  }

  /**
   * Preloads the first 4 page image assets into disk/memory cache with resolved headers using ExpoImage
   */
  preloadPageImages(pages: PageImage[]): void {
    if (!Array.isArray(pages) || pages.length === 0) return;

    // Preload first 4 pages immediately
    const targetPages = pages.slice(0, 4);
    for (const page of targetPages) {
      const rawUrl = page.imageUrl || (page as any).url || (page as any).link || '';
      if (!rawUrl || this.preloadedUrls.has(rawUrl)) continue;

      const url = cleanHighResImageUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(rawUrl));
      this.preloadedUrls.add(rawUrl);

      resolvePageHeaders(url, page.headers)
        .then(headers => {
          ExpoImage.prefetch(url, {
            headers,
            cachePolicy: 'memory-disk',
          }).catch(() => {});
        })
        .catch(() => {});
    }
  }

  /**
   * Silently prefetches chapter pages manifest and preloads Page 1 & Page 2.
   * Deduplicates concurrent calls.
   */
  async preloadChapter(
    chapterLink: string,
    providerValue: string,
    options?: {
      chapterTitle?: string;
      chapterNumber?: number;
      failoverItem?: ConsolidatedChapterLink;
    },
  ): Promise<PageImage[]> {
    if (!chapterLink || !providerValue) return [];

    const cached = this.getCachedPages(chapterLink, providerValue);
    if (cached && cached.length > 0) {
      this.preloadPageImages(cached);
      return cached;
    }

    const dedupeKey = `${providerValue}:${chapterLink}`;
    const existing = this.inFlight.get(dedupeKey);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        let results: PageImage[] = [];

        // Attempt failover or direct page fetch
        try {
          const failoverItem =
            options?.failoverItem || ({
              id: chapterLink,
              title: options?.chapterTitle || 'Chapter',
              chapterNumber: options?.chapterNumber || 1,
              link: chapterLink,
            } as ConsolidatedChapterLink);

          const outcome = await fetchPagesWithFailover(failoverItem, providerValue);
          results = outcome.pages;
        } catch {
          results = await providerManager.getPages({
            link: chapterLink,
            providerValue,
            type: 'comic',
          });
        }

        if (Array.isArray(results) && results.length > 0) {
          // Normalize and rewrite URLs through autoDomainResolver
          const normalized: PageImage[] = results.map((item: any, idx: number) => {
            const rawUrl = item.imageUrl || item.link || item.url || '';
            const imgUrl = cleanHighResImageUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(rawUrl));
            return {
              index: typeof item.index === 'number' ? item.index : idx,
              imageUrl: imgUrl,
              width: item.width,
              height: item.height,
              headers: item.headers,
            };
          });

          this.memoryManifests.set(dedupeKey, normalized);
          cacheStorage.setString(
            this.getManifestKey(chapterLink, providerValue),
            JSON.stringify(normalized),
          );

          // Preload Page 1 and Page 2 into memory/disk
          this.preloadPageImages(normalized);

          return normalized;
        }
      } catch (err) {
        // Background speculative errors should not break the UI
      } finally {
        this.inFlight.delete(dedupeKey);
      }
      return [];
    })();

    this.inFlight.set(dedupeKey, promise);
    return promise;
  }

  /**
   * Silently preloads the start/resume chapter AND the next serial chapter when Info opens
   */
  preloadSerialSequence(
    chapters: (EpisodeLink | ChapterLink)[],
    resumeIndex: number,
    providerValue: string,
  ): void {
    if (!chapters || chapters.length === 0 || !providerValue) return;

    // 1. Preload current / resume chapter
    const current = chapters[resumeIndex];
    if (current?.link) {
      this.preloadChapter(current.link, (current as any).provider || providerValue, {
        chapterTitle: current.title,
        chapterNumber: (current as any).chapterNumber,
      });
    }

    // 2. Preload next serial chapter (if available)
    const nextIndex = resumeIndex + 1;
    if (nextIndex < chapters.length) {
      const next = chapters[nextIndex];
      if (next?.link) {
        setTimeout(() => {
          this.preloadChapter(next.link, (next as any).provider || providerValue, {
            chapterTitle: next.title,
            chapterNumber: (next as any).chapterNumber,
          });
        }, 300);
      }
    }
  }
}

export const instantChapterLauncher = new InstantChapterLauncher();
