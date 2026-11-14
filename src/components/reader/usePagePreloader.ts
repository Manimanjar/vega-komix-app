import {useEffect, useRef} from 'react';
import {Image as ExpoImage} from 'expo-image';
import {getCookieHeader} from '../../lib/services/cookieManager';
import type {PageImage} from '../../lib/providers/types';

const headerCache = new Map<string, Record<string, string>>();

export const resolvePageHeaders = async (
  imageUrl: string,
  headers?: Record<string, string>,
): Promise<Record<string, string>> => {
  if (!imageUrl || imageUrl.startsWith('file://') || imageUrl.startsWith('content://')) {
    return headers || {};
  }

  const cacheKey = `${imageUrl}|${JSON.stringify(headers || {})}`;
  if (headerCache.has(cacheKey)) {
    return headerCache.get(cacheKey)!;
  }

  const merged: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    ...(headers || {}),
  };

  // Derive referer/origin if not provided
  try {
    const parsed = new URL(imageUrl);
    if (!merged.Referer && !merged.referer) {
      merged.Referer = `${parsed.protocol}//${parsed.host}/`;
    }
    if (!merged.Origin && !merged.origin) {
      merged.Origin = `${parsed.protocol}//${parsed.host}`;
    }
  } catch {}

  // Merge cookies from native cookie manager
  try {
    const cookieHeader = await getCookieHeader(imageUrl);
    if (cookieHeader) {
      if (merged.Cookie) {
        merged.Cookie = `${merged.Cookie}; ${cookieHeader}`;
      } else {
        merged.Cookie = cookieHeader;
      }
    }
  } catch (e) {
    console.warn('[usePagePreloader] Cookie resolution failed:', e);
  }

  headerCache.set(cacheKey, merged);
  return merged;
};

export const usePagePreloader = (
  pages: PageImage[],
  currentPageIndex: number,
  lookaheadCount: number = 4,
) => {
  const prefetchedSet = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pages || pages.length === 0) return;

    const prefetchTargets: PageImage[] = [];
    for (
      let i = currentPageIndex + 1;
      i <= currentPageIndex + lookaheadCount && i < pages.length;
      i++
    ) {
      const page = pages[i];
      if (page && page.imageUrl && !prefetchedSet.current.has(page.imageUrl)) {
        prefetchTargets.push(page);
      }
    }

    if (prefetchTargets.length === 0) return;

    // Prefetch sequentially or in parallel
    prefetchTargets.forEach(async target => {
      prefetchedSet.current.add(target.imageUrl);
      try {
        const resolvedHeaders = await resolvePageHeaders(
          target.imageUrl,
          target.headers,
        );
        ExpoImage.prefetch(target.imageUrl, {
          headers: resolvedHeaders,
          cachePolicy: 'memory-disk',
        }).catch(() => {
          prefetchedSet.current.delete(target.imageUrl);
        });
      } catch (err) {
        prefetchedSet.current.delete(target.imageUrl);
      }
    });
  }, [pages, currentPageIndex, lookaheadCount]);
};
