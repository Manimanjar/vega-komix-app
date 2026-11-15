import {mainStorage} from '../lib/storage/StorageService';

/**
 * Per-Comic Reader Preferences Types
 * - readingMode: 'CONTINUOUS' (webtoon) or 'PAGED' (manga / paged)
 * - orientation: 'PORTRAIT' or 'LANDSCAPE'
 * - pageFit: 'CONTAIN' (fit height), 'COVER' (fit screen), or 'WIDTH' (fit width)
 */
export type ComicReadingMode = 'CONTINUOUS' | 'PAGED';
export type ComicOrientation = 'PORTRAIT' | 'LANDSCAPE';
export type ComicPageFit = 'CONTAIN' | 'COVER' | 'WIDTH';

export interface ComicPreferences {
  readingMode?: ComicReadingMode;
  orientation?: ComicOrientation;
  pageFit?: ComicPageFit;
}

/**
 * Type-mapping utilities between ComicPreferences and internal Reader types
 */
export function toInternalReadingMode(mode?: ComicReadingMode): 'webtoon' | 'manga' | undefined {
  if (!mode) return undefined;
  return mode === 'CONTINUOUS' ? 'webtoon' : 'manga';
}

export function fromInternalReadingMode(mode?: string): ComicReadingMode | undefined {
  if (!mode) return undefined;
  return mode === 'webtoon' ? 'CONTINUOUS' : 'PAGED';
}

export function toInternalOrientation(ori?: ComicOrientation): 'portrait' | 'landscape' | undefined {
  if (!ori) return undefined;
  return ori === 'LANDSCAPE' ? 'landscape' : 'portrait';
}

export function fromInternalOrientation(ori?: string): ComicOrientation | undefined {
  if (!ori) return undefined;
  return ori === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT';
}

export function toInternalPageFit(fit?: ComicPageFit): 'fit_width' | 'fit_height' | 'fit_screen' | undefined {
  if (!fit) return undefined;
  if (fit === 'WIDTH') return 'fit_width';
  if (fit === 'COVER') return 'fit_screen';
  return 'fit_height';
}

export function fromInternalPageFit(fit?: string): ComicPageFit | undefined {
  if (!fit) return undefined;
  if (fit === 'fit_width') return 'WIDTH';
  if (fit === 'fit_screen' || fit === 'cover') return 'COVER';
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
