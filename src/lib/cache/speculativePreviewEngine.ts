import {Image as ExpoImage} from 'expo-image';
import {cacheStorage} from '../storage';
import {providerManager} from '../services/ProviderManager';
import type {Info} from '../providers/types';

class SpeculativePreviewEngine {
  private inFlight = new Map<string, Promise<Info | undefined>>();
  private memoryCache = new Map<string, Info>();

  private getCacheKey(link: string, providerValue: string): string {
    return `contentInfo:${providerValue}:${link}`;
  }

  /**
   * Returns prefetched metadata synchronously if already loaded into memory or disk cache
   */
  getPrefetchedMeta(link: string, providerValue: string): Info | undefined {
    if (!link || !providerValue) return undefined;
    const mem = this.memoryCache.get(`${providerValue}:${link}`);
    if (mem) return mem;

    const raw = cacheStorage.getString(this.getCacheKey(link, providerValue));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.memoryCache.set(`${providerValue}:${link}`, parsed);
          return parsed;
        }
      } catch {}
    }
    return undefined;
  }

  /**
   * Speculatively prefetches comic metadata on touch-down (onPressIn) ~150ms before tap release.
   * Also preloads the high-resolution cover into GPU memory.
   */
  async prefetchMeta(link: string, providerValue: string): Promise<Info | undefined> {
    if (!link || !providerValue) return undefined;

    // Check existing cache
    const cached = this.getPrefetchedMeta(link, providerValue);
    if (cached) {
      if (cached.image) {
        this.prefetchCover(cached.image);
      }
      return cached;
    }

    const dedupeKey = `${providerValue}:${link}`;
    const existing = this.inFlight.get(dedupeKey);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        const meta = await providerManager.getMetaData({
          link,
          provider: providerValue,
        });

        if (meta && (meta.title || meta.image || meta.synopsis)) {
          this.memoryCache.set(dedupeKey, meta);
          cacheStorage.setString(
            this.getCacheKey(link, providerValue),
            JSON.stringify(meta),
          );

          if (meta.image) {
            this.prefetchCover(meta.image);
          }
          return meta;
        }
      } catch (err) {
        // Silently catch speculative errors so background touch events don't throw
      } finally {
        this.inFlight.delete(dedupeKey);
      }
      return undefined;
    })();

    this.inFlight.set(dedupeKey, promise);
    return promise;
  }

  /**
   * Pre-decodes image directly into ExpoImage memory / disk cache
   */
  prefetchCover(url?: string): void {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
    try {
      ExpoImage.prefetch(url).catch(() => {});
    } catch {}
  }
}

export const speculativePreviewEngine = new SpeculativePreviewEngine();
