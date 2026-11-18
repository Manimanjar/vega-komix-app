import fs from 'fs';
import path from 'path';
import {describe, expect, it} from '@jest/globals';
import {nextReadingMode} from '../src/components/reader/readerMotion';

describe('nextReadingMode — HUD pill cycle', () => {
  it('toggles cleanly between Continuous and Page by Page', () => {
    expect(nextReadingMode('webtoon')).toBe('comic');
    expect(nextReadingMode('comic')).toBe('webtoon');
  });

  it('any legacy manga or double-spread session returns to Continuous', () => {
    expect(nextReadingMode('manga')).toBe('webtoon');
    expect(nextReadingMode('double_spread')).toBe('webtoon');
  });
});

// Both paged modes turn pages the same way — swipe right-to-left for the
// next page, from page 1 onward — because that is the user's habit. The
// paged list is never inverted, and the edge tap zones agree with the
// swipe (left = previous, right = next) instead of mirroring in manga.
describe('PagedView — one swipe direction in both paged modes', () => {
  const pagedView = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'reader', 'PagedView.tsx'),
    'utf-8',
  );

  it('never inverts the page list', () => {
    // The word "inverted" still appears in comments explaining why the
    // list is NOT inverted — check for the prop itself.
    expect(pagedView).not.toContain('inverted={');
    expect(pagedView).not.toContain('inverted =');
  });

  it('left edge goes back, right edge goes forward, in every paged mode', () => {
    expect(pagedView).toContain('Left edge = previous');
    expect(pagedView).toContain('Right edge = next page');
    expect(pagedView).not.toContain('Left = Next page');
  });

  it('manga still keeps its own reading order inside spreads', () => {
    // Right page first in a double spread, right half first in a split
    // spread — that is what makes Manga different, not the swipe.
    expect(pagedView).toContain("const firstHalf = isManga ? 'right' : 'left'");
    expect(pagedView).toContain('const leftPage = isManga ? item.pageB : item.pageA');
  });
});
