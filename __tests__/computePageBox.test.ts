import {describe, expect, it} from '@jest/globals';
import {computePageBox} from '../src/components/reader/pageBox';

// Portrait phone frame; landscape frame for the fit-height case.
const PORTRAIT = {w: 1080, h: 1920};
const LANDSCAPE = {w: 1920, h: 1080};

describe('computePageBox', () => {
  it('fit_width fills the screen width, height from the aspect ratio', () => {
    expect(
      computePageBox({width: 1000, height: 1500}, PORTRAIT.w, PORTRAIT.h, 'fit_width', 1),
    ).toEqual({width: 1080, height: 1620});
  });

  it('fit_height fills the screen height without overflowing the width', () => {
    // Landscape frame: a portrait page fits height with room to spare.
    expect(
      computePageBox({width: 1000, height: 1500}, LANDSCAPE.w, LANDSCAPE.h, 'fit_height', 1),
    ).toEqual({width: 720, height: 1080});
    // Portrait frame: fitting height would overflow the width, so it falls
    // back to fitting the screen instead of cropping the sides.
    expect(
      computePageBox({width: 1000, height: 1500}, PORTRAIT.w, PORTRAIT.h, 'fit_height', 1),
    ).toEqual({width: 1080, height: 1620});
  });

  it('fit_screen fits both dimensions: width-bound for portrait pages', () => {
    expect(
      computePageBox({width: 1000, height: 1500}, PORTRAIT.w, PORTRAIT.h, 'fit_screen', 1),
    ).toEqual({width: 1080, height: 1620});
  });

  it('fit_screen fits both dimensions: height-bound for very tall pages', () => {
    expect(
      computePageBox({width: 1000, height: 3000}, PORTRAIT.w, PORTRAIT.h, 'fit_screen', 1),
    ).toEqual({width: 640, height: 1920});
  });

  it('fit_screen fits both dimensions: width-bound for wide pages', () => {
    // A 2000x1000 spread fits by width (1080x540), never by height.
    expect(
      computePageBox({width: 2000, height: 1000}, PORTRAIT.w, PORTRAIT.h, 'fit_screen', 1),
    ).toEqual({width: 1080, height: 540});
  });

  it('original fills the frame proportionally, never stretched or cropped', () => {
    // Smaller than the frame: scales up to fill it (height first, width
    // following proportionally) instead of sitting small in the centre.
    expect(
      computePageBox({width: 500, height: 750}, PORTRAIT.w, PORTRAIT.h, 'original', 1),
    ).toEqual({width: 1080, height: 1620});
    // Larger than the frame: scales down to fit it, never exceeding it.
    expect(
      computePageBox({width: 2000, height: 3000}, PORTRAIT.w, PORTRAIT.h, 'original', 1),
    ).toEqual({width: 1080, height: 1620});
  });

  it('original and fit_screen compute the same box', () => {
    const dims = [
      {width: 1000, height: 1500},
      {width: 2000, height: 1000},
      {width: 500, height: 750},
      {width: 4000, height: 6000},
      undefined,
    ];
    for (const d of dims) {
      expect(computePageBox(d, PORTRAIT.w, PORTRAIT.h, 'original', 1)).toEqual(
        computePageBox(d, PORTRAIT.w, PORTRAIT.h, 'fit_screen', 1),
      );
    }
  });

  it('applies the zoom scale to every mode', () => {
    expect(
      computePageBox({width: 1000, height: 1500}, PORTRAIT.w, PORTRAIT.h, 'fit_width', 2),
    ).toEqual({width: 2160, height: 3240});
    expect(
      computePageBox({width: 1000, height: 1500}, PORTRAIT.w, PORTRAIT.h, 'fit_height', 2),
    ).toEqual({width: 2160, height: 3240});
  });

  it('falls back to the 1.45 aspect ratio when no dimensions are known', () => {
    expect(
      computePageBox(undefined, PORTRAIT.w, PORTRAIT.h, 'fit_width', 1),
    ).toEqual({width: 1080, height: 1566});
  });

  it('never exceeds the display frame in any mode', () => {
    const dims = [
      {width: 1000, height: 1500},
      {width: 2000, height: 1000},
      {width: 500, height: 750},
      {width: 4000, height: 6000},
      undefined,
    ];
    const modes = ['fit_width', 'fit_height', 'fit_screen', 'original'] as const;
    for (const d of dims) {
      for (const mode of modes) {
        const box = computePageBox(d, PORTRAIT.w, PORTRAIT.h, mode, 1);
        expect(box.width).toBeLessThanOrEqual(PORTRAIT.w);
        expect(box.height).toBeLessThanOrEqual(PORTRAIT.h);
        expect(box.height).toBeGreaterThan(0);
        expect(box.width).toBeGreaterThan(0);
      }
    }
  });
});
