import {cacheStorage} from '../storage';
import type {Catalog, Post} from '../providers/types';

interface CacheEnvelope<T> {
  timestamp: number;
  data: T;
}

const PREFIX = 'swr_komix:';

export class SWRContentCache {
  // In-flight request deduplication map to prevent multiple identical network calls
  private inFlight = new Map<string, Promise<any>>();

  /**
   * Deduplicates concurrent identical requests
   */
  async dedupe<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = (async () => {
      try {
        return await fetchFn();
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  // --- Catalog SWR ---

  getCatalog(providerValue: string): Catalog[] | null {
    if (!providerValue) return null;
    const key = `${PREFIX}catalog:${providerValue}`;
    const raw = cacheStorage.getString(key);
    if (!raw) return null;
    try {
      const envelope: CacheEnvelope<Catalog[]> = JSON.parse(raw);
      return Array.isArray(envelope.data) ? envelope.data : null;
    } catch {
      return null;
    }
  }

  setCatalog(providerValue: string, data: Catalog[]): void {
    if (!providerValue || !Array.isArray(data)) return;
    const key = `${PREFIX}catalog:${providerValue}`;
    const envelope: CacheEnvelope<Catalog[]> = {
      timestamp: Date.now(),
      data,
    };
    cacheStorage.setString(key, JSON.stringify(envelope));
  }

  // --- Posts SWR ---

  getPosts(providerValue: string, filter: string, page = 1): Post[] | null {
    if (!providerValue) return null;
    const key = `${PREFIX}posts:${providerValue}:${filter}:${page}`;
    const raw = cacheStorage.getString(key);
    if (!raw) return null;
    try {
      const envelope: CacheEnvelope<Post[]> = JSON.parse(raw);
      return Array.isArray(envelope.data) ? envelope.data : null;
    } catch {
      return null;
    }
  }

  setPosts(providerValue: string, filter: string, page: number, data: Post[]): void {
    if (!providerValue || !Array.isArray(data)) return;
    const key = `${PREFIX}posts:${providerValue}:${filter}:${page}`;
    const envelope: CacheEnvelope<Post[]> = {
      timestamp: Date.now(),
      data,
    };
    cacheStorage.setString(key, JSON.stringify(envelope));
  }

  // --- Search SWR ---

  getSearch(providerValue: string, query: string, page = 1): Post[] | null {
    if (!providerValue || !query) return null;
    const key = `${PREFIX}search:${providerValue}:${query.trim().toLowerCase()}:${page}`;
    const raw = cacheStorage.getString(key);
    if (!raw) return null;
    try {
      const envelope: CacheEnvelope<Post[]> = JSON.parse(raw);
      return Array.isArray(envelope.data) ? envelope.data : null;
    } catch {
      return null;
    }
  }

  setSearch(providerValue: string, query: string, page: number, data: Post[]): void {
    if (!providerValue || !query || !Array.isArray(data)) return;
    const key = `${PREFIX}search:${providerValue}:${query.trim().toLowerCase()}:${page}`;
    const envelope: CacheEnvelope<Post[]> = {
      timestamp: Date.now(),
      data,
    };
    cacheStorage.setString(key, JSON.stringify(envelope));
  }

  /**
   * Checks whether fresh post items differ meaningfully from cached post items.
   * Compares count and the first few IDs/links so we don't trigger unnecessary re-renders.
   */
  hasChanged(cached: Post[] | null | undefined, fresh: Post[]): boolean {
    if (!cached || cached.length !== fresh.length) return true;
    for (let i = 0; i < Math.min(cached.length, 5); i++) {
      if (
        cached[i].link !== fresh[i].link ||
        cached[i].title !== fresh[i].title ||
        cached[i].image !== fresh[i].image
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all SWR entries for a provider or all providers
   */
  clear(providerValue?: string): void {
    if (providerValue) {
      // Clear specific provider entries
      const catalogKey = `${PREFIX}catalog:${providerValue}`;
      cacheStorage.delete(catalogKey);
    }
  }
}

export const swrContentCache = new SWRContentCache();
