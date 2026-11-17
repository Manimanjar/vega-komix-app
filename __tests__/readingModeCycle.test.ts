import {describe, expect, it} from '@jest/globals';
import {nextReadingMode} from '../src/components/reader/readerMotion';

describe('nextReadingMode — HUD pill cycle', () => {
  it('goes Continuous -> Page by Page (LTR) first, never straight to manga', () => {
    expect(nextReadingMode('webtoon')).toBe('comic');
  });

  it('goes Page by Page -> Manga RTL -> Continuous', () => {
    expect(nextReadingMode('comic')).toBe('manga');
    expect(nextReadingMode('manga')).toBe('webtoon');
  });

  it('a double-spread session returns to Continuous', () => {
    expect(nextReadingMode('double_spread')).toBe('webtoon');
  });
});
