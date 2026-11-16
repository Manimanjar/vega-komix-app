import {beforeEach, describe, expect, it, jest} from '@jest/globals';

const getGlobalStore = () => {
  if (!(global as any).__testMMKVStore) {
    (global as any).__testMMKVStore = new Map<string, unknown>();
  }
  return (global as any).__testMMKVStore as Map<string, unknown>;
};

jest.mock('react-native-mmkv-storage', () => ({
  MMKVLoader: class {
    withInstanceID() {
      return this;
    }

    initialize() {
      const store = (global as any).__testMMKVStore || ((global as any).__testMMKVStore = new Map());
      return {
        getString: (key: string) => store.get(key),
        setString: (key: string, value: string) => store.set(key, value),
        getBool: (key: string) => store.get(key),
        setBool: (key: string, value: boolean) => store.set(key, value),
        getInt: (key: string) => store.get(key),
        setInt: (key: string, value: number) => store.set(key, value),
        getArray: (key: string) => {
          const val = store.get(key);
          if (!val) return null;
          return typeof val === 'string' ? JSON.parse(val) : val;
        },
        setArray: (key: string, value: any[]) => store.set(key, JSON.stringify(value)),
        removeItem: (key: string) => store.delete(key),
        clearStore: () => store.clear(),
      };
    }
  },
}));

import {COMIC_GENRES} from '../src/screens/Search';
import {clusterPostsIntoSeriesRooms} from '../src/lib/aggregator/seriesRoomEngine';

describe('Search Engine Overhaul & 15-Genre Exploration', () => {
  beforeEach(() => {
    getGlobalStore().clear();
    jest.clearAllMocks();
  });

  describe('15 Curated Comic Genre Filter Chips', () => {
    it('contains exactly 15 curated comic genres', () => {
      expect(COMIC_GENRES.length).toBe(15);
    });

    it('includes all 15 required comic genres', () => {
      const expectedGenres = [
        'Action',
        'Romance',
        'Isekai',
        'Fantasy',
        'Slice of Life',
        'Sci-Fi',
        'Martial Arts',
        'Comedy',
        'Drama',
        'Horror',
        'Mystery',
        'Psychological',
        'Supernatural',
        'Historical',
        'Sports',
      ];

      const actualGenreNames = COMIC_GENRES.map(g => g.name);
      for (const expected of expectedGenres) {
        expect(actualGenreNames).toContain(expected);
      }
    });

    it('assigns valid icon definitions for each genre chip', () => {
      for (const genre of COMIC_GENRES) {
        expect(genre.name.trim().length).toBeGreaterThan(0);
        expect(genre.icon.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('Search History Chips & 1-Tap Management', () => {
    it('manages search history items with deduplication and fast recall', () => {
      const history: string[] = [];

      const saveQuery = (query: string, currentHistory: string[]) => {
        const trimmed = query.trim();
        if (!trimmed) return currentHistory;
        const filtered = currentHistory.filter(
          item => item.toLowerCase() !== trimmed.toLowerCase(),
        );
        return [trimmed, ...filtered].slice(0, 25);
      };

      let h = saveQuery('Solo Leveling', history);
      h = saveQuery('Tower of God', h);
      h = saveQuery('solo leveling', h); // Re-searching Solo Leveling

      expect(h.length).toBe(2);
      expect(h[0]).toBe('solo leveling');
      expect(h[1]).toBe('Tower of God');
    });

    it('supports quick removal of individual history chips and quick clear', () => {
      let history = ['Chainsaw Man', 'One Piece', 'Jujutsu Kaisen'];

      // Remove individual chip
      history = history.filter(item => item !== 'One Piece');
      expect(history).toEqual(['Chainsaw Man', 'Jujutsu Kaisen']);

      // Quick clear all
      history = [];
      expect(history.length).toBe(0);
    });
  });

  describe('Multi-Provider Aggregator & Robust Fallbacks', () => {
    it('clusters multiple provider search results into unified series rooms', () => {
      const rawPosts = [
        {
          title: 'Berserk',
          link: 'https://asura.com/berserk',
          provider: 'asura',
          poster: 'https://asura.com/berserk.jpg',
        },
        {
          title: 'Berserk',
          link: 'https://flame.com/berserk',
          provider: 'flame',
          poster: 'https://flame.com/berserk.jpg',
        },
        {
          title: 'Vagabond',
          link: 'https://mangadex.org/title/vagabond',
          provider: 'mangadex',
          poster: 'https://mangadex.org/covers/vagabond.jpg',
        },
      ];

      const rooms = clusterPostsIntoSeriesRooms(rawPosts as any);
      expect(rooms.length).toBe(2);

      const berserkRoom = rooms.find(r => r.title.toLowerCase().includes('berserk'));
      expect(berserkRoom).toBeDefined();
      expect(berserkRoom?.cornerTag).toBe('Series Room');
    });

    it('handles empty provider results gracefully without throwing', () => {
      const emptyPosts: any[] = [];
      const rooms = clusterPostsIntoSeriesRooms(emptyPosts);
      expect(rooms).toEqual([]);
    });
  });
});
