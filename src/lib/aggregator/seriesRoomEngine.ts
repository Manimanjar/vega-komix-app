import {ChapterLink, EpisodeLink, Post} from '../providers/types';
import {providerManager} from '../services/ProviderManager';

export interface CanonicalSeriesInfo {
  canonicalKey: string;
  cleanTitle: string;
  chapterNumber?: number;
  volumeNumber?: number;
  scanlator?: string;
  language?: string;
}

export interface ChapterSourceItem {
  id: string;
  title: string;
  link: string;
  scanlator?: string;
  language?: string;
  providerValue?: string;
  releaseDate?: string;
}

export interface ConsolidatedChapterLink extends ChapterLink {
  sources?: ChapterSourceItem[];
}

// Common scanlator / language / quality bracket patterns
const BRACKET_STRIP_REGEX = /\[(.*?)\]|\((.*?)\)/g;

// Chapter patterns covering standard, fractional, localized (JP/KR), and hashtag formats
const CHAPTER_PATTERNS = [
  // Ch. 12, Chapter 12.5, Chap 12, Cap 12, Episode 12, Ep. 12
  /(?:chapter|ch\.?|chap\.?|capitulo|cap\.?|episode|ep\.?|mission|act|part)\s*([0-9]+(?:\.[0-9]+)?)/i,
  // Japanese: 第12話 or 第12.5話
  /第\s*([0-9]+(?:\.[0-9]+)?)\s*(?:話|巻)/,
  // Korean: 12화 or 12.5화
  /([0-9]+(?:\.[0-9]+)?)\s*(?:화|권)/,
  // #12 or #12.5
  /#\s*([0-9]+(?:\.[0-9]+)?)/,
  // Trailing standalone hyphenated number (e.g. "Series Name - 12")
  /-\s*([0-9]+(?:\.[0-9]+)?)\s*$/,
];

const VOLUME_PATTERNS = [
  /(?:vol\.?|volume)\s*([0-9]+(?:\.[0-9]+)?)/i,
  /第\s*([0-9]+(?:\.[0-9]+)?)\s*巻/,
  /([0-9]+(?:\.[0-9]+)?)\s*권/,
];

const LANGUAGE_MARKERS = new Set([
  'ENG',
  'ENGLISH',
  'RAW',
  'JAP',
  'JAPANESE',
  'KOR',
  'KOREAN',
  'SPA',
  'SPANISH',
  'ESP',
  'ESPANOL',
  'FR',
  'FRENCH',
  'PT',
  'PT-BR',
  'PORTUGUESE',
  'RUS',
  'RUSSIAN',
  'ITA',
  'ITALIAN',
  'DE',
  'GERMAN',
  'ID',
  'INDONESIAN',
  'VIE',
  'VIETNAMESE',
  'THAI',
  'CHI',
  'CHINESE',
  'ZH',
]);

/**
 * Extracts canonical base series title, float chapter number, volume, and scanlator tags.
 */
export function getCanonicalSeriesKey(rawTitle: string): CanonicalSeriesInfo {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return {canonicalKey: '', cleanTitle: ''};
  }

  let title = rawTitle.trim();
  let scanlator: string | undefined;
  let language: string | undefined;

  // 1. Extract bracketed info (scanlator group, language, etc.)
  const bracketMatches = Array.from(title.matchAll(BRACKET_STRIP_REGEX));
  for (const match of bracketMatches) {
    const content = (match[1] || match[2] || '').trim();
    if (!content) continue;

    const upper = content.toUpperCase();
    if (LANGUAGE_MARKERS.has(upper)) {
      language = upper;
    } else if (!scanlator && !upper.includes('CHAPTER') && !upper.includes('PAGE') && isNaN(Number(content))) {
      scanlator = content;
    }
  }

  // 2. Extract Volume number if present
  let volumeNumber: number | undefined;
  for (const pattern of VOLUME_PATTERNS) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const v = parseFloat(match[1]);
      if (!isNaN(v)) {
        volumeNumber = v;
        break;
      }
    }
  }

  // 3. Extract Chapter float number if present
  let chapterNumber: number | undefined;
  for (const pattern of CHAPTER_PATTERNS) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const ch = parseFloat(match[1]);
      if (!isNaN(ch)) {
        chapterNumber = ch;
        break;
      }
    }
  }

  // 4. Strip brackets, chapter markers, and volume markers to isolate clean series title
  let clean = title.replace(BRACKET_STRIP_REGEX, ' ');

  for (const pattern of CHAPTER_PATTERNS) {
    clean = clean.replace(pattern, ' ');
  }
  for (const pattern of VOLUME_PATTERNS) {
    clean = clean.replace(pattern, ' ');
  }

  // Remove common separator noise: trailing hyphens, colons, underscores, slashes, extra spaces
  clean = clean
    .replace(/[\-_:/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If clean title ended up empty (e.g. the entire title was just "[Group] Ch. 12"), fallback to raw title
  if (!clean) {
    clean = title;
  }

  // 5. Generate normalized canonical key: lowercase, alpha-numeric + CJK/Hangul
  const canonicalKey = clean
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, '-');

  return {
    canonicalKey,
    cleanTitle: clean,
    chapterNumber,
    volumeNumber,
    scanlator,
    language,
  };
}

/**
 * Clusters scattered standalone chapter posts sharing the same canonical series
 * into a single master series card with an aggregated chapter badge.
 */
export function clusterPostsIntoSeriesRooms(posts: Post[]): Post[] {
  if (!Array.isArray(posts) || posts.length === 0) {
    return [];
  }

  const clusters = new Map<string, {master: Post; count: number; maxChapter?: number; minChapter?: number}>();
  const orderedKeys: string[] = [];

  for (const post of posts) {
    if (!post || !post.title) continue;

    const info = getCanonicalSeriesKey(post.title);
    const key = info.canonicalKey || post.title.toLowerCase().trim();

    if (!clusters.has(key)) {
      clusters.set(key, {
        master: {
          ...post,
          title: info.cleanTitle || post.title,
        },
        count: 1,
        maxChapter: info.chapterNumber,
        minChapter: info.chapterNumber,
      });
      orderedKeys.push(key);
    } else {
      const entry = clusters.get(key)!;
      entry.count++;

      if (info.chapterNumber !== undefined) {
        if (entry.maxChapter === undefined || info.chapterNumber > entry.maxChapter) {
          entry.maxChapter = info.chapterNumber;
          // Prefer cover art from newer chapter
          if (post.image) {
            entry.master.image = post.image;
          }
        }
        if (entry.minChapter === undefined || info.chapterNumber < entry.minChapter) {
          entry.minChapter = info.chapterNumber;
        }
      }
    }
  }

  return orderedKeys.map(key => {
    const entry = clusters.get(key)!;
    if (entry.count > 1) {
      const chapterBadge =
        entry.maxChapter !== undefined
          ? `${entry.count} Ch. (up to ${entry.maxChapter})`
          : `${entry.count} Chapters`;

      return {
        ...entry.master,
        tag: chapterBadge,
        cornerTag: entry.master.cornerTag || 'Series Room',
      };
    }
    return entry.master;
  });
}

/**
 * Strict serial float sorting and redundant source merging.
 * Merges duplicate uploads of the same chapter into a single row with `sources: [...]`.
 */
export function sortAndMergeChapters(
  chapters: (ChapterLink | EpisodeLink)[],
  order: 'asc' | 'desc' = 'asc',
): ConsolidatedChapterLink[] {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return [];
  }

  const chapterMap = new Map<number, ConsolidatedChapterLink>();
  const unnumbered: ConsolidatedChapterLink[] = [];

  for (const ch of chapters) {
    if (!ch) continue;

    const asChapter = ch as ChapterLink;
    let chNum: number | undefined = asChapter.chapterNumber;

    if (chNum === undefined || isNaN(chNum) || chNum === 0) {
      const info = getCanonicalSeriesKey(ch.title);
      chNum = info.chapterNumber;
    }

    const sourceItem: ChapterSourceItem = {
      id: asChapter.id || ch.link,
      title: ch.title || `Chapter ${chNum ?? ''}`,
      link: ch.link,
      scanlator: asChapter.scanlator,
      language: asChapter.language,
      releaseDate: asChapter.releaseDate,
    };

    if (chNum !== undefined && !isNaN(chNum)) {
      if (!chapterMap.has(chNum)) {
        chapterMap.set(chNum, {
          id: asChapter.id || ch.link,
          title: ch.title || `Chapter ${chNum}`,
          chapterNumber: chNum,
          volume: asChapter.volume,
          scanlator: asChapter.scanlator,
          language: asChapter.language,
          releaseDate: asChapter.releaseDate,
          link: ch.link,
          sources: [sourceItem],
        });
      } else {
        const existing = chapterMap.get(chNum)!;
        existing.sources = existing.sources || [];

        // Check if this source link is already present
        const alreadyExists = existing.sources.some(s => s.link === ch.link);
        if (!alreadyExists) {
          existing.sources.push(sourceItem);
        }

        // Prefer richer scanlator/language metadata if missing on existing
        if (!existing.scanlator && asChapter.scanlator) {
          existing.scanlator = asChapter.scanlator;
        }
        if (!existing.language && asChapter.language) {
          existing.language = asChapter.language;
        }
      }
    } else {
      unnumbered.push({
        id: asChapter.id || ch.link,
        title: ch.title,
        chapterNumber: 0,
        volume: asChapter.volume,
        scanlator: asChapter.scanlator,
        language: asChapter.language,
        releaseDate: asChapter.releaseDate,
        link: ch.link,
        sources: [sourceItem],
      });
    }
  }

  // Sort numbered chapters numerically by float chapterNumber
  const sortedNumbered = Array.from(chapterMap.values()).sort((a, b) => {
    return order === 'asc'
      ? a.chapterNumber - b.chapterNumber
      : b.chapterNumber - a.chapterNumber;
  });

  return order === 'asc'
    ? [...sortedNumbered, ...unnumbered]
    : [...sortedNumbered, ...unnumbered];
}

export interface CollectSeriesChaptersOptions {
  baseTitle: string;
  providerValue: string;
  currentChapters?: (ChapterLink | EpisodeLink)[];
  signal?: AbortSignal;
}

/**
 * Deep Collector: Background searches for scattered chapters of the series across the provider
 * and aggregates them into a unified, sorted chapter list.
 */
export async function collectAllSeriesChapters(
  options: CollectSeriesChaptersOptions,
): Promise<ConsolidatedChapterLink[]> {
  const {baseTitle, providerValue, currentChapters = [], signal} = options;
  const initial = sortAndMergeChapters(currentChapters);

  if (!baseTitle || !providerValue) {
    return initial;
  }

  const baseInfo = getCanonicalSeriesKey(baseTitle);
  const targetCanonicalKey = baseInfo.canonicalKey;

  try {
    const searchResults = await providerManager.getSearchPosts({
      searchQuery: baseInfo.cleanTitle || baseTitle,
      page: 1,
      providerValue,
      signal: signal || new AbortController().signal,
    });

    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return initial;
    }

    const scatteredChapters: ChapterLink[] = [];

    for (const post of searchResults) {
      if (!post || !post.title || !post.link) continue;

      const postInfo = getCanonicalSeriesKey(post.title);
      // Verify this post belongs to the same canonical series
      if (postInfo.canonicalKey === targetCanonicalKey && postInfo.chapterNumber !== undefined) {
        scatteredChapters.push({
          id: post.link,
          title: post.title,
          chapterNumber: postInfo.chapterNumber,
          volume: postInfo.volumeNumber,
          scanlator: postInfo.scanlator,
          language: postInfo.language,
          link: post.link,
        });
      }
    }

    if (scatteredChapters.length > 0) {
      return sortAndMergeChapters([...initial, ...scatteredChapters]);
    }
  } catch (err) {
    console.warn('[SeriesRoomEngine] Deep collection search encountered an error:', err);
  }

  return initial;
}
