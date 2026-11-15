import type {EpisodeLink} from '../providers/types';

/**
 * Extracts a numeric chapter number from an episode/chapter object.
 * Checks explicit chapterNumber, regex matches on title and link, and general numbers.
 */
export function extractChapterNumber(item?: {
  title?: string;
  link?: string;
  chapterNumber?: number;
}): number | null {
  if (!item) return null;
  if (typeof (item as any)?.chapterNumber === 'number' && !isNaN((item as any).chapterNumber)) {
    return (item as any).chapterNumber;
  }
  const title = item.title || '';
  const match = title.match(/(?:chapter|ch\.?|ep\.?|episode)\s*([\d.]+)/i);
  if (match && match[1]) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) return val;
  }
  const link = item.link || '';
  const linkMatch = link.match(/(?:chapter|ch|ep|episode)[-_/]?([\d.]+)/i);
  if (linkMatch && linkMatch[1]) {
    const val = parseFloat(linkMatch[1]);
    if (!isNaN(val)) return val;
  }
  const generalMatch = title.match(/([\d.]+)/);
  if (generalMatch && generalMatch[1]) {
    const val = parseFloat(generalMatch[1]);
    if (!isNaN(val)) return val;
  }
  return null;
}

/**
 * Determines if a chapter list is in descending (reverse chronological: latest to oldest) order.
 * Returns true if index 0 represents a higher/later chapter than the end of the array.
 */
export function isChapterListDescending(chapters: (EpisodeLink | any)[]): boolean {
  if (!chapters || chapters.length < 2) return false;

  const validNumbers: Array<{ index: number; num: number }> = [];
  for (let i = 0; i < chapters.length; i++) {
    const num = extractChapterNumber(chapters[i]);
    if (num !== null) {
      validNumbers.push({ index: i, num });
    }
  }

  if (validNumbers.length >= 2) {
    const first = validNumbers[0];
    const last = validNumbers[validNumbers.length - 1];
    if (first.num !== last.num) {
      return first.num > last.num;
    }

    let descVotes = 0;
    let ascVotes = 0;
    for (let i = 0; i < validNumbers.length - 1; i++) {
      if (validNumbers[i].num > validNumbers[i + 1].num) descVotes++;
      else if (validNumbers[i].num < validNumbers[i + 1].num) ascVotes++;
    }
    if (descVotes > ascVotes) return true;
    if (ascVotes > descVotes) return false;
  }

  return false;
}

/**
 * Computes chronological next and previous chapter indices and boundary flags.
 */
export function getChronologicalNavigation({
  currentIndex,
  totalChapters,
  isDescending,
}: {
  currentIndex: number;
  totalChapters: number;
  isDescending: boolean;
}) {
  // Descending (e.g. index 0 = Ch 100, index N-1 = Ch 1):
  // Next in story (Ch 1 -> Ch 2): index decrements towards 0
  // Prev in story (Ch 2 -> Ch 1): index increments towards N-1
  //
  // Ascending (e.g. index 0 = Ch 1, index N-1 = Ch 100):
  // Next in story (Ch 1 -> Ch 2): index increments towards N-1
  // Prev in story (Ch 2 -> Ch 1): index decrements towards 0

  const hasNext = isDescending ? currentIndex > 0 : currentIndex < totalChapters - 1;
  const hasPrev = isDescending ? currentIndex < totalChapters - 1 : currentIndex > 0;

  const nextIndex = isDescending ? currentIndex - 1 : currentIndex + 1;
  const prevIndex = isDescending ? currentIndex + 1 : currentIndex - 1;

  return {
    hasNext,
    hasPrev,
    nextIndex: Math.max(0, Math.min(totalChapters - 1, nextIndex)),
    prevIndex: Math.max(0, Math.min(totalChapters - 1, prevIndex)),
  };
}
