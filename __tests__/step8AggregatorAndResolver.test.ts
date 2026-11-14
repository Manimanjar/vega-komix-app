const mockStorage = new Map<string, any>();

jest.mock('../src/lib/storage/StorageService', () => ({
  mainStorage: {
    getObject: (key: string) => mockStorage.get(key),
    setObject: (key: string, value: any) => mockStorage.set(key, value),
    getString: (key: string) => mockStorage.get(key),
    setString: (key: string, value: string) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
}));

jest.mock('../src/lib/storage/extensionStorage', () => ({
  extensionStorage: {
    getProviderSource: () => ({author: 'vega-org', repo: 'vega-komix-providers'}),
  },
}));

jest.mock('../src/lib/services/ProviderManager', () => ({
  providerManager: {
    getSearchPosts: jest.fn().mockResolvedValue([]),
    getStream: jest.fn().mockResolvedValue([]),
    getPages: jest.fn().mockResolvedValue([]),
  },
}));

import {
  getCanonicalSeriesKey,
  clusterPostsIntoSeriesRooms,
  sortAndMergeChapters,
} from '../src/lib/aggregator/seriesRoomEngine';
import {autoDomainResolver} from '../src/lib/network/autoDomainResolver';
import type {Post, ChapterLink} from '../src/lib/providers/types';

describe('Step 8 — Series Room Engine & Auto Domain Resolver', () => {
  describe('Canonical Series Fingerprinting', () => {
    it('should extract clean series title, scanlator, language, and chapter float', () => {
      const parsed = getCanonicalSeriesKey('[Flame Scans] Solo Leveling - Chapter 179.5 [ENG]');
      expect(parsed.cleanTitle).toBe('Solo Leveling');
      expect(parsed.chapterNumber).toBe(179.5);
      expect(parsed.scanlator).toBe('Flame Scans');
      expect(parsed.language).toBe('ENG');
      expect(parsed.canonicalKey).toBe('solo-leveling');
    });

    it('should parse volume and chapter numbers', () => {
      const parsed = getCanonicalSeriesKey('Bleach Vol. 74 Ch. 686');
      expect(parsed.cleanTitle).toBe('Bleach');
      expect(parsed.volumeNumber).toBe(74);
      expect(parsed.chapterNumber).toBe(686);
      expect(parsed.canonicalKey).toBe('bleach');
    });

    it('should parse Japanese and Korean chapter markers', () => {
      const jp = getCanonicalSeriesKey('呪術廻戦 第236話');
      expect(jp.cleanTitle).toBe('呪術廻戦');
      expect(jp.chapterNumber).toBe(236);

      const kr = getCanonicalSeriesKey('나 혼자만 레벨업 179화');
      expect(kr.cleanTitle).toBe('나 혼자만 레벨업');
      expect(kr.chapterNumber).toBe(179);
    });

    it('should parse hashtag and trailing hyphen chapter patterns', () => {
      const hash = getCanonicalSeriesKey('One Piece #1044');
      expect(hash.cleanTitle).toBe('One Piece');
      expect(hash.chapterNumber).toBe(1044);

      const hyphen = getCanonicalSeriesKey('Chainsaw Man - 97.5');
      expect(hyphen.cleanTitle).toBe('Chainsaw Man');
      expect(hyphen.chapterNumber).toBe(97.5);
    });
  });

  describe('Feed De-Duplication & Series Room Clustering', () => {
    it('should cluster scattered chapter posts of the same series into a single master card', () => {
      const posts: Post[] = [
        {
          title: '[Group A] Attack on Titan Ch. 138',
          link: 'https://manga.to/aot/138',
          image: 'https://manga.to/cover138.jpg',
        },
        {
          title: '[Group B] Attack on Titan Ch. 139',
          link: 'https://manga.to/aot/139',
          image: 'https://manga.to/cover139.jpg',
        },
        {
          title: 'One Piece Ch. 1050',
          link: 'https://manga.to/op/1050',
          image: 'https://manga.to/op.jpg',
        },
      ];

      const clustered = clusterPostsIntoSeriesRooms(posts);

      expect(clustered.length).toBe(2);
      const aotMaster = clustered.find(p => p.title === 'Attack on Titan');
      expect(aotMaster).toBeDefined();
      expect(aotMaster?.tag).toContain('2 Ch.');
      expect(aotMaster?.image).toBe('https://manga.to/cover139.jpg'); // newer cover
      expect(aotMaster?.cornerTag).toBe('Series Room');

      const opPost = clustered.find(p => p.title === 'One Piece');
      expect(opPost).toBeDefined();
    });
  });

  describe('Strict Float Sorting & Redundant Source Merging', () => {
    it('should sort chapters numerically including decimals', () => {
      const chapters: ChapterLink[] = [
        {id: '10', title: 'Chapter 10', chapterNumber: 10, link: '/ch10'},
        {id: '2.5', title: 'Chapter 2.5', chapterNumber: 2.5, link: '/ch2.5'},
        {id: '1', title: 'Chapter 1', chapterNumber: 1, link: '/ch1'},
        {id: '2', title: 'Chapter 2', chapterNumber: 2, link: '/ch2'},
      ];

      const sorted = sortAndMergeChapters(chapters, 'asc');
      expect(sorted.map(c => c.chapterNumber)).toEqual([1, 2, 2.5, 10]);
    });

    it('should merge duplicate uploads of the same chapter into single row with sources list', () => {
      const chapters: ChapterLink[] = [
        {
          id: '1a',
          title: 'Chapter 1',
          chapterNumber: 1,
          link: '/sourceA/ch1',
          scanlator: 'Scanlator Alpha',
        },
        {
          id: '1b',
          title: 'Chapter 1 (HQ)',
          chapterNumber: 1,
          link: '/sourceB/ch1',
          scanlator: 'Scanlator Beta',
        },
        {
          id: '2',
          title: 'Chapter 2',
          chapterNumber: 2,
          link: '/sourceA/ch2',
          scanlator: 'Scanlator Alpha',
        },
      ];

      const merged = sortAndMergeChapters(chapters, 'asc');
      expect(merged.length).toBe(2);

      const ch1 = merged.find(c => c.chapterNumber === 1);
      expect(ch1).toBeDefined();
      expect(ch1?.sources?.length).toBe(2);
      expect(ch1?.sources?.[0].scanlator).toBe('Scanlator Alpha');
      expect(ch1?.sources?.[1].scanlator).toBe('Scanlator Beta');
    });
  });

  describe('Auto TLD & Domain Rotation Resolver', () => {
    it('should record redirects and rewrite URLs', () => {
      autoDomainResolver.recordRedirectDomain('manga-dead.com', 'manga-alive.to');

      const rewritten = autoDomainResolver.rewriteUrlWithResolvedDomain(
        'https://manga-dead.com/series/one-piece/ch-1',
      );
      expect(rewritten).toBe('https://manga-alive.to/series/one-piece/ch-1');
    });

    it('should dynamically preserve subdomains (e.g. image CDNs) when rewriting', () => {
      autoDomainResolver.recordRedirectDomain('mangahost.org', 'mangahost.cc');

      const cdnUrl = 'https://cdn4.img.mangahost.org/data/001.jpg';
      const rewrittenCdn = autoDomainResolver.rewriteUrlWithResolvedDomain(cdnUrl);
      expect(rewrittenCdn).toBe('https://cdn4.img.mangahost.cc/data/001.jpg');
    });

    it('should detect meta refresh redirect targets', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta http-equiv="refresh" content="0; url=https://manganew.su/home">
          </head>
        </html>
      `;
      const detected = autoDomainResolver.checkMetaRefreshRedirect(html, 'https://mangaold.to/home');
      expect(detected).toBe('https://manganew.su/home');
    });

    it('should detect parked domains and Cloudflare outage codes', () => {
      expect(autoDomainResolver.isParkedOrFailedHtml('This domain is for sale. Buy this domain now at Dan.com', 200)).toBe(true);
      expect(autoDomainResolver.isParkedOrFailedHtml('<html><body>Welcome to HugeDomains</body></html>', 200)).toBe(true);
      expect(autoDomainResolver.isParkedOrFailedHtml('<html>Error 521 Web server is down</html>', 521)).toBe(true);
      expect(autoDomainResolver.isParkedOrFailedHtml('<html><div class="reader-chapter">Manga Title</div></html>', 200)).toBe(false);
    });
  });
});
