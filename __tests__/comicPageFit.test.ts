import {describe, expect, it} from '@jest/globals';
import {
  toInternalPageFit,
  fromInternalPageFit,
} from '../src/services/comicPreferencesStorage';

describe('per-comic page-fit mapping', () => {
  it('round-trips the surviving modes', () => {
    expect(toInternalPageFit('CONTAIN')).toBe('fit_height');
    expect(fromInternalPageFit('fit_height')).toBe('CONTAIN');
    expect(toInternalPageFit('COVER')).toBe('fit_screen');
    expect(fromInternalPageFit('fit_screen')).toBe('COVER');
    expect(toInternalPageFit('WIDTH')).toBe('fit_width');
    expect(fromInternalPageFit('fit_width')).toBe('WIDTH');
    expect(toInternalPageFit('FULL')).toBe('full_screen');
    expect(fromInternalPageFit('full_screen')).toBe('FULL');
    expect(toInternalPageFit('ORIGINAL')).toBe('original');
    expect(fromInternalPageFit('original')).toBe('ORIGINAL');
  });

  it('defaults unknown values to fit-height', () => {
    expect(toInternalPageFit(undefined)).toBeUndefined();
    expect(toInternalPageFit('BOGUS' as any)).toBe('fit_height');
    expect(fromInternalPageFit(undefined)).toBeUndefined();
    expect(fromInternalPageFit('bogus')).toBe('CONTAIN');
  });
});
