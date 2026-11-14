import {Content} from './zustand/contentStore';
import {Catalog, Post} from './providers/types';
import {providerManager} from './services/ProviderManager';
import {throwIfProviderAborted} from './sandbox/abort';
import {clusterPostsIntoSeriesRooms} from './aggregator/seriesRoomEngine';
import {swrContentCache} from './cache/swrContentCache';

export interface HomePageData {
  title: string;
  Posts: Post[];
  filter: string;
  error?: string;
  isLoading?: boolean;
}

interface HomeLoadOptions {
  catalogs?: Catalog[];
  previousData?: HomePageData[];
  onCategory?: (data: HomePageData[]) => void;
}

// Stale-While-Revalidate speed engine:
// 1. Returns cached catalogs and row posts in 0ms without blocking spinners.
// 2. Silently revalidates in the background and updates rows only if items change.
// 3. Deduplicates identical in-flight scraper calls during rapid scrolling.
export const getHomePageDataOptimized = async (
  activeProvider: Content['provider'],
  signal: AbortSignal,
  options: HomeLoadOptions = {},
): Promise<HomePageData[]> => {
  throwIfProviderAborted(signal);

  let catalogs = options.catalogs;
  if (!catalogs) {
    const cachedCatalogs = swrContentCache.getCatalog(activeProvider.value);
    if (cachedCatalogs && cachedCatalogs.length > 0) {
      catalogs = cachedCatalogs;
      // Background revalidation of catalogs
      swrContentCache
        .dedupe(`catalog:${activeProvider.value}`, () =>
          providerManager.getCatalog({
            providerValue: activeProvider.value,
            signal,
          }),
        )
        .then(fresh => {
          if (fresh && fresh.length > 0) {
            swrContentCache.setCatalog(activeProvider.value, fresh);
          }
        })
        .catch(() => {});
    } else {
      catalogs = await swrContentCache.dedupe(`catalog:${activeProvider.value}`, () =>
        providerManager.getCatalog({
          providerValue: activeProvider.value,
          signal,
        }),
      );
      if (catalogs && catalogs.length > 0) {
        swrContentCache.setCatalog(activeProvider.value, catalogs);
      }
    }
  }

  throwIfProviderAborted(signal);

  // Initialize rows from SWR cache or previousData for 0ms instant display
  const rows: HomePageData[] = catalogs.map(item => {
    const previous = options.previousData?.find(
      row => row.filter === item.filter,
    );
    const cachedPosts = swrContentCache.getPosts(
      activeProvider.value,
      item.filter,
      1,
    );
    const existingPosts = previous?.Posts?.length
      ? previous.Posts
      : cachedPosts
      ? clusterPostsIntoSeriesRooms(cachedPosts)
      : [];

    return {
      title: item.title,
      filter: item.filter,
      Posts: existingPosts,
      // If we have cached posts, render immediately without skeleton
      isLoading:
        existingPosts.length > 0
          ? false
          : !previous || previous.isLoading === true,
    };
  });

  let cursor = 0;
  let successes = rows.some(r => r.Posts.length > 0) ? 1 : 0;
  const publish = () => {
    throwIfProviderAborted(signal);
    options.onCategory?.([...rows]);
  };

  // Immediate frame 1 publish so user sees content in 0ms!
  publish();

  const worker = async () => {
    while (cursor < catalogs.length) {
      throwIfProviderAborted(signal);
      const index = cursor++;
      const catalog = catalogs[index];
      const dedupeKey = `posts:${activeProvider.value}:${catalog.filter}:1`;

      try {
        const posts = await swrContentCache.dedupe(dedupeKey, () =>
          providerManager.getPosts({
            filter: catalog.filter,
            page: 1,
            providerValue: activeProvider.value,
            signal,
          }),
        );
        throwIfProviderAborted(signal);

        if (posts.length > 0) successes++;
        const clustered = clusterPostsIntoSeriesRooms(posts);

        // Only update row if items changed from cached version
        if (swrContentCache.hasChanged(rows[index].Posts, clustered)) {
          swrContentCache.setPosts(
            activeProvider.value,
            catalog.filter,
            1,
            posts,
          );
          rows[index] = {
            title: catalog.title,
            filter: catalog.filter,
            Posts: clustered,
            isLoading: false,
          };
          publish();
        } else if (rows[index].isLoading) {
          rows[index].isLoading = false;
          publish();
        }
      } catch (error) {
        throwIfProviderAborted(signal);
        if (rows[index].Posts.length === 0) {
          rows[index] = {
            title: catalog.title,
            filter: catalog.filter,
            Posts: rows[index].Posts,
            isLoading: false,
            error:
              error instanceof Error ? error.message : 'Failed to load category',
          };
          publish();
        }
      }
    }
  };

  await Promise.all(Array.from({length: Math.min(2, catalogs.length)}, worker));
  throwIfProviderAborted(signal);
  if (successes === 0) throw new Error('Failed to load any content categories');
  return rows;
};

export const getHomePageData = getHomePageDataOptimized;
