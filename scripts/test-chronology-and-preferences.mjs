import assert from 'node:assert';

// Test chapter parsing regexes and functions directly
function extractChapterNumber(item) {
  if (!item) return null;
  if (typeof item?.chapterNumber === 'number' && !isNaN(item.chapterNumber)) {
    return item.chapterNumber;
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

function isChapterListDescending(chapters) {
  if (!chapters || chapters.length < 2) return false;

  const validNumbers = [];
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

function getChronologicalNavigation({ currentIndex, totalChapters, isDescending }) {
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

console.log('Testing extractChapterNumber...');
assert.strictEqual(extractChapterNumber({ title: 'Chapter 105' }), 105);
assert.strictEqual(extractChapterNumber({ title: 'Ch. 12.5 - Bonus' }), 12.5);
assert.strictEqual(extractChapterNumber({ title: 'Episode 30' }), 30);
assert.strictEqual(extractChapterNumber({ link: 'https://example.com/manga/chapter-99/' }), 99);
assert.strictEqual(extractChapterNumber({ chapterNumber: 42 }), 42);

console.log('Testing isChapterListDescending (Descending MangaDex / Asura order)...');
const descendingChapters = [
  { title: 'Chapter 100', link: '/c100' },
  { title: 'Chapter 99', link: '/c99' },
  { title: 'Chapter 98', link: '/c98' },
  { title: 'Chapter 1', link: '/c1' },
];
assert.strictEqual(isChapterListDescending(descendingChapters), true);

console.log('Testing isChapterListDescending (Ascending Webtoon order)...');
const ascendingChapters = [
  { title: 'Chapter 1', link: '/c1' },
  { title: 'Chapter 2', link: '/c2' },
  { title: 'Chapter 3', link: '/c3' },
  { title: 'Chapter 100', link: '/c100' },
];
assert.strictEqual(isChapterListDescending(ascendingChapters), false);

console.log('Testing navigation in DESCENDING list...');
// In descending list:
// index 0 = Ch 100 (latest)
// index 3 = Ch 1 (first)
// When user is reading Ch 1 (index 3):
let nav = getChronologicalNavigation({ currentIndex: 3, totalChapters: 4, isDescending: true });
assert.strictEqual(nav.hasPrev, false, 'Ch 1 should not have prev chapter');
assert.strictEqual(nav.hasNext, true, 'Ch 1 should have next chapter');
assert.strictEqual(nav.nextIndex, 2, 'Next chapter after Ch 1 (idx 3) should be Ch 98 (idx 2)');

// When user is reading Ch 100 (index 0):
nav = getChronologicalNavigation({ currentIndex: 0, totalChapters: 4, isDescending: true });
assert.strictEqual(nav.hasNext, false, 'Ch 100 should not have next chapter');
assert.strictEqual(nav.hasPrev, true, 'Ch 100 should have prev chapter');
assert.strictEqual(nav.prevIndex, 1, 'Prev chapter before Ch 100 (idx 0) should be Ch 99 (idx 1)');

console.log('Testing navigation in ASCENDING list...');
// In ascending list:
// index 0 = Ch 1 (first)
// index 3 = Ch 100 (latest)
// When user is reading Ch 1 (index 0):
nav = getChronologicalNavigation({ currentIndex: 0, totalChapters: 4, isDescending: false });
assert.strictEqual(nav.hasPrev, false, 'Ch 1 should not have prev chapter');
assert.strictEqual(nav.hasNext, true, 'Ch 1 should have next chapter');
assert.strictEqual(nav.nextIndex, 1, 'Next chapter after Ch 1 (idx 0) should be Ch 2 (idx 1)');

// When user is reading Ch 100 (index 3):
nav = getChronologicalNavigation({ currentIndex: 3, totalChapters: 4, isDescending: false });
assert.strictEqual(nav.hasNext, false, 'Ch 100 should not have next chapter');
assert.strictEqual(nav.hasPrev, true, 'Ch 100 should have prev chapter');
assert.strictEqual(nav.prevIndex, 2, 'Prev chapter before Ch 100 (idx 3) should be Ch 3 (idx 2)');

console.log('All chapter chronology assertions passed perfectly!');
