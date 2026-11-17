import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {
  extractChapterNumber,
  isChapterListDescending,
  getChronologicalNavigation,
} from '../src/lib/reader/chapterChronology';
import {
  comicPreferencesStorage,
  toInternalReadingMode,
  fromInternalReadingMode,
  toInternalOrientation,
  fromInternalOrientation,
  toInternalPageFit,
  fromInternalPageFit,
} from '../src/services/comicPreferencesStorage';
import {EndOfChapterCard} from '../src/components/reader/EndOfChapterCard';

describe('Chapter Chronology Navigation & Transitions', () => {
  describe('Chapter Chronology Resolution', () => {
    it('should accurately extract chapter numbers from titles and links', () => {
      expect(extractChapterNumber({title: 'Chapter 15 - The Awakening'})).toBe(15);
      expect(extractChapterNumber({title: 'Ch. 42.5 Special'})).toBe(42.5);
      expect(extractChapterNumber({title: 'Episode 108'})).toBe(108);
      expect(extractChapterNumber({link: 'https://site.com/comic/chapter-201'})).toBe(201);
      expect(extractChapterNumber({title: 'No Number Here'})).toBeNull();
    });

    it('should detect descending chapter lists (latest chapter first)', () => {
      const descendingChapters = [
        {title: 'Chapter 100', link: '/ch-100'},
        {title: 'Chapter 99', link: '/ch-99'},
        {title: 'Chapter 1', link: '/ch-1'},
      ];
      expect(isChapterListDescending(descendingChapters)).toBe(true);
    });

    it('should detect ascending chapter lists (oldest chapter first)', () => {
      const ascendingChapters = [
        {title: 'Chapter 1', link: '/ch-1'},
        {title: 'Chapter 2', link: '/ch-2'},
        {title: 'Chapter 100', link: '/ch-100'},
      ];
      expect(isChapterListDescending(ascendingChapters)).toBe(false);
    });

    it('should navigate forward in story for descending scraper inputs', () => {
      // Index 0 = Ch 3, Index 1 = Ch 2, Index 2 = Ch 1
      const navAtCh1 = getChronologicalNavigation({
        currentIndex: 2,
        totalChapters: 3,
        isDescending: true,
      });
      expect(navAtCh1.hasNext).toBe(true);
      expect(navAtCh1.nextIndex).toBe(1); // Navigates to Ch 2
      expect(navAtCh1.hasPrev).toBe(false);

      const navAtCh2 = getChronologicalNavigation({
        currentIndex: 1,
        totalChapters: 3,
        isDescending: true,
      });
      expect(navAtCh2.hasNext).toBe(true);
      expect(navAtCh2.nextIndex).toBe(0); // Navigates to Ch 3
      expect(navAtCh2.hasPrev).toBe(true);
      expect(navAtCh2.prevIndex).toBe(2); // Navigates to Ch 1

      const navAtCh3 = getChronologicalNavigation({
        currentIndex: 0,
        totalChapters: 3,
        isDescending: true,
      });
      expect(navAtCh3.hasNext).toBe(false);
      expect(navAtCh3.hasPrev).toBe(true);
    });

    it('should navigate forward in story for ascending scraper inputs', () => {
      // Index 0 = Ch 1, Index 1 = Ch 2, Index 2 = Ch 3
      const navAtCh1 = getChronologicalNavigation({
        currentIndex: 0,
        totalChapters: 3,
        isDescending: false,
      });
      expect(navAtCh1.hasNext).toBe(true);
      expect(navAtCh1.nextIndex).toBe(1); // Navigates to Ch 2
      expect(navAtCh1.hasPrev).toBe(false);

      const navAtCh3 = getChronologicalNavigation({
        currentIndex: 2,
        totalChapters: 3,
        isDescending: false,
      });
      expect(navAtCh3.hasNext).toBe(false);
      expect(navAtCh3.hasPrev).toBe(true);
      expect(navAtCh3.prevIndex).toBe(1);
    });
  });

  describe('Per-Comic Reader Preferences Storage', () => {
    const mockComicLink = 'https://example.com/comics/solo-leveling';

    beforeEach(() => {
      comicPreferencesStorage.deletePreferences(mockComicLink);
    });

    it('should save and retrieve per-comic reading mode, zoomScale, and pageFit', () => {
      expect(comicPreferencesStorage.getPreferences(mockComicLink)).toBeNull();

      comicPreferencesStorage.savePreferences(mockComicLink, {
        readingMode: 'CONTINUOUS',
        orientation: 'PORTRAIT',
        pageFit: 'WIDTH',
        zoomScale: 1.5,
      });

      const prefs = comicPreferencesStorage.getPreferences(mockComicLink);
      expect(prefs).not.toBeNull();
      expect(prefs?.readingMode).toBe('CONTINUOUS');
      expect(prefs?.orientation).toBe('PORTRAIT');
      expect(prefs?.pageFit).toBe('WIDTH');
      expect(prefs?.zoomScale).toBe(1.5);
    });

    it('should map between internal and external reading modes accurately', () => {
      expect(toInternalReadingMode('CONTINUOUS')).toBe('webtoon');
      expect(toInternalReadingMode('WEBTOON')).toBe('webtoon');
      expect(toInternalReadingMode('MANGA')).toBe('manga');
      expect(toInternalReadingMode('COMIC')).toBe('comic');
      expect(toInternalReadingMode('PAGED')).toBe('manga');

      expect(fromInternalReadingMode('webtoon')).toBe('CONTINUOUS');
      expect(fromInternalReadingMode('manga')).toBe('MANGA');
      expect(fromInternalReadingMode('comic')).toBe('COMIC');
    });

    it('should map orientations and page fits accurately', () => {
      expect(toInternalOrientation('PORTRAIT')).toBe('portrait');
      expect(toInternalOrientation('LANDSCAPE')).toBe('landscape');
      expect(fromInternalOrientation('portrait')).toBe('PORTRAIT');
      expect(fromInternalOrientation('landscape')).toBe('LANDSCAPE');

      // Fit Width is back and Full Screen is new: WIDTH and FULL round-trip
      // to their own modes instead of collapsing to fit-screen.
      expect(toInternalPageFit('WIDTH')).toBe('fit_width');
      expect(toInternalPageFit('FULL')).toBe('full_screen');
      expect(toInternalPageFit('COVER')).toBe('fit_screen');
      expect(toInternalPageFit('CONTAIN')).toBe('fit_height');
      expect(toInternalPageFit('ORIGINAL')).toBe('original');
      expect(fromInternalPageFit('fit_width')).toBe('WIDTH');
      expect(fromInternalPageFit('full_screen')).toBe('FULL');
      expect(fromInternalPageFit('fit_screen')).toBe('COVER');
      expect(fromInternalPageFit('original')).toBe('ORIGINAL');
    });
  });

  describe('EndOfChapterCard UI Component', () => {
    it('should render next chapter card with action button when hasNextChapter is true', () => {
      const handleNextMock = jest.fn();
      let tree: renderer.ReactTestRenderer;

      act(() => {
        tree = renderer.create(
          <EndOfChapterCard
            hasNextChapter={true}
            nextChapterTitle="Chapter 45 - The Climax"
            onNextChapter={handleNextMock}
            theme="amoled"
            isPaged={false}
          />,
        );
      });

      const instance = tree!.root;
      const textNodes = instance.findAll(node => typeof node.props.children === 'string');
      const texts = textNodes.map(node => node.props.children);

      expect(texts).toContain('END OF CHAPTER');
      expect(texts).toContain('Chapter 45 - The Climax');
      expect(texts).toContain('Read Next Chapter');

      // Test button press
      const button = instance.find(node => node.props.onPress === handleNextMock);
      expect(button).toBeDefined();
      act(() => {
        button.props.onPress();
      });
      expect(handleNextMock).toHaveBeenCalledTimes(1);
    });

    it('renders nothing when hasNextChapter is false (the caught-up card was removed)', () => {
      let tree: renderer.ReactTestRenderer;

      act(() => {
        tree = renderer.create(
          <EndOfChapterCard
            hasNextChapter={false}
            theme="dark"
            isPaged={true}
          />,
        );
      });

      expect(tree!.toJSON()).toBeNull();
    });
  });
});
