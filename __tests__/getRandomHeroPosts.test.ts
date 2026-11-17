jest.mock('../src/lib/storage', () => ({
  cacheStorage: {
    getString: () => undefined,
    setString: () => undefined,
  },
}));
jest.mock('../src/lib/getHomepagedata', () => ({getHomePageData: jest.fn()}));
jest.mock('../src/lib/zustand/contentStore', () => ({}));

import {describe, expect, it, jest} from '@jest/globals';
import {
  getRandomHeroPosts,
  clearHeroCache,
  HERO_COUNT,
} from '../src/lib/hooks/useHomePageData';
import type {Post} from '../src/lib/providers/types';

const post = (link: string, title: string): Post =>
  ({link, title, image: `https://example.com/${title}.jpg`} as Post);

const row = (title: string, posts: Post[]) =>
  ({title, filter: title.toLowerCase(), Posts: posts} as any);

const incestRow = () =>
  row('Incest', [post('https://a/1', 'A1'), post('https://a/2', 'A2')]);
const familyRow = () =>
  row('Family', [post('https://b/1', 'B1'), post('https://b/2', 'B2')]);
const popularRow = () =>
  row('Popular', [post('https://c/1', 'C1'), post('https://c/2', 'C2')]);

describe('getRandomHeroPosts — Incest/Family only', () => {
  it('pools only Incest and Family rows, never other categories', () => {
    clearHeroCache('test-provider');
    const heroes = getRandomHeroPosts(
      [incestRow(), familyRow(), popularRow()],
      'test-provider',
    );
    expect(heroes.length).toBe(4);
    const links = heroes.map(h => h.link);
    expect(links).not.toContain('https://c/1');
    expect(links).not.toContain('https://c/2');
    for (const link of links) {
      expect(['https://a/1', 'https://a/2', 'https://b/1', 'https://b/2']).toContain(
        link,
      );
    }
  });

  it('matches category titles case-insensitively and trims whitespace', () => {
    clearHeroCache('test-provider-2');
    const heroes = getRandomHeroPosts(
      [row('INCEST', [post('https://a/1', 'A1')]), row(' family ', [post('https://b/1', 'B1')])],
      'test-provider-2',
    );
    expect(heroes.map(h => h.link).sort()).toEqual([
      'https://a/1',
      'https://b/1',
    ]);
  });

  it('dedupes a post that appears in both categories', () => {
    clearHeroCache('test-provider-3');
    const shared = post('https://a/1', 'Shared');
    const heroes = getRandomHeroPosts(
      [row('Incest', [shared]), row('Family', [shared])],
      'test-provider-3',
    );
    expect(heroes).toHaveLength(1);
    expect(heroes[0].link).toBe('https://a/1');
  });

  it('returns no heroes when Incest/Family rows are empty — never falls back to other categories', () => {
    clearHeroCache('test-provider-4');
    const heroes = getRandomHeroPosts(
      [row('Incest', []), row('Family', []), popularRow()],
      'test-provider-4',
    );
    expect(heroes).toEqual([]);
  });

  it('returns the same pick until the cache is cleared, then re-picks', () => {
    clearHeroCache('test-provider-5');
    const data = [incestRow(), familyRow(), popularRow()];

    const randomSpy = jest.spyOn(Math, 'random');
    // Identity shuffle: every pick keeps pool order.
    randomSpy.mockReturnValue(0.999999);
    const first = getRandomHeroPosts(data, 'test-provider-5').map(h => h.link);
    const second = getRandomHeroPosts(data, 'test-provider-5').map(h => h.link);
    expect(second).toEqual(first);

    clearHeroCache('test-provider-5');
    // Rotating shuffle: the pick order must change after the cache clears.
    randomSpy.mockReturnValue(0);
    const third = getRandomHeroPosts(data, 'test-provider-5').map(h => h.link);
    expect(third).not.toEqual(first);
    expect(third.sort()).toEqual(first.sort());
    randomSpy.mockRestore();
  });

  it('never returns more than HERO_COUNT heroes', () => {
    clearHeroCache('test-provider-6');
    const many = Array.from({length: 20}, (_, i) =>
      post(`https://a/${i}`, `A${i}`),
    );
    const heroes = getRandomHeroPosts(
      [row('Incest', many)],
      'test-provider-6',
    );
    expect(heroes.length).toBeLessThanOrEqual(HERO_COUNT);
  });
});
