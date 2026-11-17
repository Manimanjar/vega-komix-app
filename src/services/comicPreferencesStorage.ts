import {mainStorage} from '../lib/storage/StorageService';

/**
 * Per-Comic Reader Preferences Types
 * - readingMode: 'CONTINUOUS' (webtoon) or 'PAGED' (manga / paged)
 * - orientation: 'PORTRAIT' or 'LANDSCAPE'
 * - pageFit: 'CONTAIN' (fit height), 'COVER' (fit screen), 'WIDTH' (fit screen — legacy, was fit width) or 'ORIGINAL' (original size)
 */
export type ComicReadingMode = 'CONTINUOUS' | 'PAGED' | 'MANGA' | 'COMIC' | 'WEBTOON';
export type ComicOrientation = 'PORTRAIT' | 'LANDSCAPE';
export type ComicPageFit = 'CONTAIN' | 'COVER' | 'WIDTH' | 'ORIGINAL';

export interface ComicPreferences {
  readingMode?: ComicReadingMode;
  orientation?: ComicOrientation;
  pageFit?: ComicPageFit;
  zoomScale?: number;
}

/**
 * Type-mapping utilities between ComicPreferences and internal Reader types
 */
export function toInternalReadingMode(mode?: ComicReadingMode | string): 'webtoon' | 'manga' | 'comic' | undefined {
  if (!mode) return undefined;
  if (mode === 'CONTINUOUS' || mode === 'WEBTOON' || mode === 'webtoon') return 'webtoon';
  if (mode === 'MANGA' || mode === 'manga') return 'manga';
  if (mode === 'COMIC' || mode === 'comic') return 'comic';
  if (mode === 'PAGED') return 'manga';
  return undefined;
}

export function fromInternalReadingMode(mode?: string): ComicReadingMode | undefined {
  if (!mode) return undefined;
  if (mode === 'webtoon') return 'CONTINUOUS';
  if (mode === 'manga') return 'MANGA';
  if (mode === 'comic') return 'COMIC';
  return 'PAGED';
}

export function toInternalOrientation(ori?: ComicOrientation): 'portrait' | 'landscape' | undefined {
  if (!ori) return undefined;
  return ori === 'LANDSCAPE' ? 'landscape' : 'portrait';
}

export function fromInternalOrientation(ori?: string): ComicOrientation | undefined {
  if (!ori) return undefined;
  return ori === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT';
}

export function toInternalPageFit(fit?: ComicPageFit): 'fit_width' | 'fit_height' | 'fit_screen' | 'original' | undefined {
  if (!fit) return undefined;
  // 'WIDTH' is legacy: fit-width (Full Bleed) was removed, so old per-comic
  // WIDTH preferences now resolve to fit-screen instead of re-applying it.
  if (fit === 'WIDTH') return 'fit_screen';
  if (fit === 'COVER') return 'fit_screen';
  if (fit === 'ORIGINAL') return 'original';
  return 'fit_height';
}

export function fromInternalPageFit(fit?: string): ComicPageFit | undefined {
  if (!fit) return undefined;
  // 'fit_width' is legacy (Full Bleed removed): never write WIDTH again.
  if (fit === 'fit_width') return 'COVER';
  if (fit === 'fit_screen' || fit === 'cover') return 'COVER';
  if (fit === 'original') return 'ORIGINAL';
  return 'CONTAIN';
}

/**
 * Service to store and retrieve per-comic reading preferences using MMKV mainStorage
 */
export class ComicPreferencesStorageService {
  private readonly PREFIX = 'vega-komix-comic-pref:';

  private normalizeKey(comicLink: string): string {
    return `${this.PREFIX}${comicLink.trim()}`;
  }

  getPreferences(comicLink: string): ComicPreferences | null {
    if (!comicLink || !comicLink.trim()) return null;
    try {
      return mainStorage.getObject<ComicPreferences>(this.normalizeKey(comicLink)) || null;
    } catch {
      return null;
    }
  }

  savePreferences(comicLink: string, prefs: Partial<ComicPreferences>): void {
    if (!comicLink || !comicLink.trim()) return;
    try {
      const existing = this.getPreferences(comicLink) || {};
      const updated: ComicPreferences = {
        ...existing,
        ...prefs,
      };
      mainStorage.setObject(this.normalizeKey(comicLink), updated);
    } catch {}
  }

  deletePreferences(comicLink: string): void {
    if (!comicLink || !comicLink.trim()) return;
    try {
      mainStorage.delete(this.normalizeKey(comicLink));
    } catch {}
  }

  clearPreferences(comicLink: string): void {
    this.deletePreferences(comicLink);
  }
}

export const comicPreferencesStorage = new ComicPreferencesStorageService();

export const getComicPreferences = (comicLink: string): ComicPreferences | null =>
  comicPreferencesStorage.getPreferences(comicLink);

export const saveComicPreferences = (
  comicLink: string,
  prefs: Partial<ComicPreferences>,
): void => comicPreferencesStorage.savePreferences(comicLink, prefs);

export const clearComicPreferences = (comicLink: string): void =>
  comicPreferencesStorage.deletePreferences(comicLink);
