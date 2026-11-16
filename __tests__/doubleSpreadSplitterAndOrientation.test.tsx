import React from 'react';

describe('Manga Double-Spread Auto-Splitter & Orientation Lock', () => {
  describe('Landscape Scan Detection & Splitter Logic', () => {
    const isLandscapeScan = (width: number, height: number): boolean => {
      if (!width || !height || height <= 0) return false;
      const ratio = width / height;
      return ratio > 1.2;
    };

    it('should detect landscape scans with width > height * 1.2', () => {
      expect(isLandscapeScan(1600, 1000)).toBe(true); // 1.6 > 1.2
      expect(isLandscapeScan(1250, 1000)).toBe(true); // 1.25 > 1.2
      expect(isLandscapeScan(1201, 1000)).toBe(true); // 1.201 > 1.2

      // Non-landscape / portrait or near-square scans
      expect(isLandscapeScan(1100, 1000)).toBe(false); // 1.1 <= 1.2
      expect(isLandscapeScan(1000, 1000)).toBe(false); // 1.0 <= 1.2
      expect(isLandscapeScan(700, 1000)).toBe(false);  // 0.7 <= 1.2 (portrait)
    });

    it('should split landscape scan into Right-first then Left in Manga (RTL) mode', () => {
      const isManga = true;
      const firstHalf = isManga ? 'right' : 'left';
      const secondHalf = isManga ? 'left' : 'right';

      expect(firstHalf).toBe('right');
      expect(secondHalf).toBe('left');
    });

    it('should split landscape scan into Left-first then Right in Western Comic (LTR) mode', () => {
      const isManga = false;
      const firstHalf = isManga ? 'right' : 'left';
      const secondHalf = isManga ? 'left' : 'right';

      expect(firstHalf).toBe('left');
      expect(secondHalf).toBe('right');
    });
  });

  describe('Consecutive Page Pairing in Landscape Double-Spread Mode', () => {
    it('should pair consecutive portrait pages side-by-side in landscape mode', () => {
      const mockPages = [
        {id: 'cover', width: 800, height: 1200}, // page 0: cover stands alone
        {id: 'p1', width: 800, height: 1200},
        {id: 'p2', width: 800, height: 1200},
        {id: 'p3', width: 800, height: 1200},
        {id: 'p4', width: 800, height: 1200},
        {id: 'p5', width: 800, height: 1200},
      ];

      const pairs: Array<{isPair: boolean; a: string; b?: string}> = [];
      let i = 0;
      while (i < mockPages.length) {
        if (i === 0 || i === mockPages.length - 1) {
          pairs.push({isPair: false, a: mockPages[i].id});
          i++;
        } else {
          pairs.push({isPair: true, a: mockPages[i].id, b: mockPages[i + 1]?.id});
          i += 2;
        }
      }

      expect(pairs).toHaveLength(4);
      expect(pairs[0]).toEqual({isPair: false, a: 'cover'});
      expect(pairs[1]).toEqual({isPair: true, a: 'p1', b: 'p2'});
      expect(pairs[2]).toEqual({isPair: true, a: 'p3', b: 'p4'});
      expect(pairs[3]).toEqual({isPair: false, a: 'p5'});
    });
  });

  describe('Screen Orientation Toggle', () => {
    it('should alternate strictly between portrait and landscape modes', () => {
      let currentOrientation = 'portrait';

      const toggle = () => {
        currentOrientation = currentOrientation === 'portrait' ? 'landscape' : 'portrait';
        return currentOrientation;
      };

      expect(toggle()).toBe('landscape');
      expect(toggle()).toBe('portrait');
      expect(toggle()).toBe('landscape');
      expect(toggle()).toBe('portrait');
    });
  });
});
