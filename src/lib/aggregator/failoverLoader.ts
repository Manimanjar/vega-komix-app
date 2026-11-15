import {PageImage} from '../providers/types';
import {autoDomainResolver} from '../network/autoDomainResolver';
import {ConsolidatedChapterLink, ChapterSourceItem} from './seriesRoomEngine';
import {providerManager} from '../services/ProviderManager';

export interface FailoverPageResult {
  pages: PageImage[];
  sourceUsed: ChapterSourceItem;
  didFailover: boolean;
  failoverReason?: string;
}

/**
 * Retries a failed page image with updated TLD/domain, origin, and Referer headers.
 */
export async function retryPageImageWithUpdatedHeaders(
  page: PageImage,
  providerValue?: string,
  signal?: AbortSignal,
): Promise<PageImage> {
  if (!page || !page.imageUrl) {
    return page;
  }

  const originalUrl = page.imageUrl;
  // 1. Rewrite using existing resolved domain mappings
  let updatedUrl = autoDomainResolver.rewriteUrlWithResolvedDomain(originalUrl);

  // 2. If no mapping existed or if explicitly probing, attempt 4-stage domain resolution
  if (updatedUrl === originalUrl) {
    try {
      const parsed = new URL(originalUrl);
      const resolvedHost = await autoDomainResolver.resolveDomain(parsed.hostname, {
        providerValue,
        signal,
      });
      if (resolvedHost && resolvedHost !== parsed.hostname) {
        updatedUrl = originalUrl.replace(`://${parsed.host}`, `://${resolvedHost}`);
      }
    } catch {}
  }

  // 3. Update Referer and Origin headers to match new domain
  const headers = {...(page.headers || {})};
  try {
    const parsed = new URL(updatedUrl);
    const parts = parsed.hostname.split('.');
    const apex = parts.length > 2 ? parts.slice(-2).join('.') : parsed.hostname;
    const apexOrigin = `${parsed.protocol}//${apex}`;
    if (headers.Referer || headers.referer) {
      headers.Referer = `${apexOrigin}/`;
      delete headers.referer;
    }
    if (headers.Origin || headers.origin) {
      headers.Origin = apexOrigin;
      delete headers.origin;
    }
  } catch {}

  return {
    ...page,
    imageUrl: updatedUrl,
    headers,
  };
}

/**
 * Fetches page images for a chapter, automatically failing over to redundant sources in `chapter.sources`
 * if the primary source fails, times out, or returns no pages.
 */
export async function fetchPagesWithFailover(
  chapter: ConsolidatedChapterLink,
  providerValue: string,
  signal?: AbortSignal,
): Promise<FailoverPageResult> {
  const sources: ChapterSourceItem[] =
    chapter.sources && chapter.sources.length > 0
      ? chapter.sources
      : [
          {
            id: chapter.id,
            title: chapter.title,
            link: chapter.link,
            scanlator: chapter.scanlator,
            language: chapter.language,
            providerValue,
          },
        ];

  let lastError: any = null;

  for (let i = 0; i < sources.length; i++) {
    if (signal?.aborted) {
      throw new Error('Chapter page fetch aborted');
    }

    const currentSource = sources[i];
    const sourceProvider = currentSource.providerValue || providerValue;

    try {
      console.log(
        `[FailoverLoader] Attempting source [${i + 1}/${sources.length}] for Ch. ${chapter.chapterNumber}: ${currentSource.title} (${currentSource.scanlator || 'Default'})`,
      );

      // Attempt stream / page fetch through ProviderManager
      const rawPages = await providerManager.getStream({
        link: currentSource.link,
        type: 'comic',
        providerValue: sourceProvider,
        signal,
      });

      // Stream method in comic providers returns PageImage[], or array with pages, or object { pages: [...] }
      let list: any[] = [];
      if (Array.isArray(rawPages)) {
        list = rawPages;
      } else if (rawPages && typeof rawPages === 'object') {
        if (Array.isArray((rawPages as any).pages)) {
          list = (rawPages as any).pages;
        } else if (Array.isArray((rawPages as any).images)) {
          list = (rawPages as any).images;
        } else if (Array.isArray((rawPages as any).stream)) {
          list = (rawPages as any).stream;
        }
      }

      let pages: PageImage[] = [];
      if (list.length > 0) {
        // If items have imageUrl, it's PageImage[]
        if (typeof (list[0] as any)?.imageUrl === 'string') {
          pages = list as unknown as PageImage[];
        } else if (typeof (list[0] as any)?.link === 'string') {
          pages = list.map((item: any, idx: number) => ({
            index: idx + 1,
            imageUrl: item.link,
            headers: item.headers,
          }));
        }
      }

      if (pages.length > 0) {
        // Normalize page image URLs with autoDomainResolver
        const resolvedPages = pages.map(p => ({
          ...p,
          imageUrl: autoDomainResolver.rewriteUrlWithResolvedDomain(p.imageUrl),
        }));

        return {
          pages: resolvedPages,
          sourceUsed: currentSource,
          didFailover: i > 0,
          failoverReason: i > 0 ? `Failed on primary: ${lastError?.message || 'Empty pages'}` : undefined,
        };
      } else {
        lastError = new Error('Empty page list returned by provider');
      }
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[FailoverLoader] Source [${i + 1}/${sources.length}] failed for ${currentSource.link}:`,
        err?.message || err,
      );
    }
  }

  throw lastError || new Error(`All ${sources.length} sources failed to load chapter pages`);
}
