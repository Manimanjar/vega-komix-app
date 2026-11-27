import {mainStorage} from '../storage/StorageService';

const TITLE_CACHE_KEY = 'vega-komix-title-cache-v2';
const MAX_CACHED_TITLES = 1500;

export interface ProcessedTitleResult {
  originalTitle: string;
  translatedTitle: string;
  needsTranslation: boolean;
}

const CJK_FOREIGN_SCRIPT_RE =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f]/;

const ACCENTED_LATIN_RE =
  /[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ]/;

const ROMAJI_HONORIFIC_SUFFIX_RE =
  /(?:^|[\s\w])-(?:hen|san|kun|chan|sama|sensei|senpai|kouhai)\b/i;

const ROMAJI_KEYWORDS_RE =
  /\b(?:shoujo|shounen|isekai|nakadashi|oppai|hentai|doujin|doujinshi|ecchi|yuri|yaoi|harem|kawaii|sukebe|oshiri|chichi|imouto|oneechan|oniichan|okaasan|otousan|tsundere|yandere|watashi|anata|daisuki|yamete|kimochi|shota|bakunyuu|paizuri|ahegao|futanari|netorare|chikan|seifuku|kitsune|akuma|tenshi|mahou|maou|yuusha|gakuen|koukou|chuugaku|monogatari|nikki|jikan|sekai|kokoro|ouji|sensei|senpai|kouhai|chan|kun|sama|wo|ga|wa|ni|ka)\b/i;

const ROMAJI_PARTICLE_PHRASE_RE =
  /\b[a-z]{2,}\s+(?:no|to|de|wa|ga|wo|ni)\s+[a-z]{2,}\b/;

/**
 * Detect whether a comic title needs translation (CJK, accented foreign scripts,
 * or Romaji honorifics/keywords). Leaves natural English titles untouched.
 */
export function needsTitleTranslation(rawTitle: string): boolean {
  const title = (rawTitle || '').trim();
  if (!title) return false;

  if (CJK_FOREIGN_SCRIPT_RE.test(title)) return true;
  if (ACCENTED_LATIN_RE.test(title)) return true;
  if (ROMAJI_HONORIFIC_SUFFIX_RE.test(title)) return true;
  if (ROMAJI_KEYWORDS_RE.test(title)) return true;
  if (ROMAJI_PARTICLE_PHRASE_RE.test(title)) return true;

  return false;
}

let memoryCache: Map<string, ProcessedTitleResult> | null = null;
const inFlightJobs = new Map<string, Promise<ProcessedTitleResult>>();

function loadCache(): Map<string, ProcessedTitleResult> {
  if (memoryCache) return memoryCache;
  const map = new Map<string, ProcessedTitleResult>();
  try {
    const stored = mainStorage.getObject<Record<string, ProcessedTitleResult>>(
      TITLE_CACHE_KEY,
    );
    if (stored && typeof stored === 'object') {
      for (const [key, val] of Object.entries(stored)) {
        if (val && typeof val.translatedTitle === 'string') {
          map.set(key, val);
        }
      }
    }
  } catch {}
  memoryCache = map;
  return map;
}

function saveToCache(result: ProcessedTitleResult): void {
  const cache = loadCache();
  cache.set(result.originalTitle, result);
  if (cache.size > MAX_CACHED_TITLES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  const obj: Record<string, ProcessedTitleResult> = {};
  cache.forEach((v, k) => {
    obj[k] = v;
  });
  try {
    mainStorage.setObject(TITLE_CACHE_KEY, obj);
  } catch {}
}

export function getCachedProcessedTitle(
  rawTitle: string,
): ProcessedTitleResult | null {
  const originalTitle = (rawTitle || '').trim();
  if (!originalTitle) return null;
  if (!needsTitleTranslation(originalTitle)) {
    return {
      originalTitle,
      translatedTitle: originalTitle,
      needsTranslation: false,
    };
  }
  return loadCache().get(originalTitle) ?? null;
}

async function fetchGoogleTranslate(
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(
    text,
  )}`;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 8000);
  const onParentAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onParentAbort, {once: true});

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: timeoutController.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translated = data[0]
        .map((seg: any) => (Array.isArray(seg) ? seg[0] || '' : ''))
        .join('')
        .trim();
      if (translated) return translated;
    }
    throw new Error('Unexpected translate payload');
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

export async function processAndTranslateTitle(
  rawTitle: string,
  signal?: AbortSignal,
): Promise<ProcessedTitleResult> {
  const originalTitle = (rawTitle || '').trim();
  if (!originalTitle) {
    return {originalTitle: '', translatedTitle: '', needsTranslation: false};
  }

  if (!needsTitleTranslation(originalTitle)) {
    return {
      originalTitle,
      translatedTitle: originalTitle,
      needsTranslation: false,
    };
  }

  const cached = loadCache().get(originalTitle);
  if (cached) return cached;

  const existingJob = inFlightJobs.get(originalTitle);
  if (existingJob) return existingJob;

  const job = (async (): Promise<ProcessedTitleResult> => {
    try {
      const translated = await fetchGoogleTranslate(originalTitle, signal);
      const result: ProcessedTitleResult = {
        originalTitle,
        translatedTitle: translated || originalTitle,
        needsTranslation: true,
      };
      saveToCache(result);
      return result;
    } catch {
      return {
        originalTitle,
        translatedTitle: originalTitle,
        needsTranslation: true,
      };
    } finally {
      inFlightJobs.delete(originalTitle);
    }
  })();

  inFlightJobs.set(originalTitle, job);
  return job;
}
