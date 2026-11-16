import type {PageImage} from '../../lib/providers/types';

export type ReadingMode = 'webtoon' | 'manga' | 'comic' | 'double_spread';

export type ReaderTheme = 'amoled' | 'dark' | 'sepia' | 'white';

export type ImageScale = 'fit_width' | 'fit_height' | 'fit_screen' | 'original';

export type ScreenOrientationMode = 'portrait' | 'landscape' | 'auto';

export type InteractionMode = 'scroll' | 'one_tap' | 'swipe';

export type AutoScrollSpeed = 'off' | 'slow' | 'medium' | 'fast';

export interface ReaderSettings {
  theme: ReaderTheme;
  readingMode: ReadingMode;
  imageScale: ImageScale;
  cropWhiteBorders: boolean;
  keepScreenAwake: boolean;
  volumeKeysEnabled: boolean;
  showFloatingPageNumber: boolean;
  disableTapZonesInWebtoon: boolean;
  orientationMode: ScreenOrientationMode;
  interactionMode?: InteractionMode;
  zoomScale?: number;
  autoScrollSpeed?: AutoScrollSpeed;
  screenDimmer?: number;
  warmFilterEnabled?: boolean;
  liveTranslateEnabled?: boolean;
  splitDoubleSpreads?: boolean;
  highQualityRendering?: boolean;
}

export interface ReaderProgress {
  comicLink: string;
  chapterId: string;
  chapterTitle: string;
  chapterIndex: number;
  currentPageIndex: number;
  totalPages: number;
  readingMode: ReadingMode;
  updatedAt: number;
}

export interface ReaderPageItem extends PageImage {
  localUri?: string;
  aspectRatio?: number;
  resolvedHeaders?: Record<string, string>;
}

export const THEME_COLORS: Record<
  ReaderTheme,
  {
    background: string;
    text: string;
    subText: string;
    hudBackground: string;
    hudBorder: string;
  }
> = {
  amoled: {
    background: '#000000',
    text: '#FFFFFF',
    subText: '#A0A0A0',
    hudBackground: 'rgba(18, 18, 18, 0.92)',
    hudBorder: 'rgba(255, 255, 255, 0.12)',
  },
  dark: {
    background: '#18181B',
    text: '#F4F4F5',
    subText: '#A1A1AA',
    hudBackground: 'rgba(24, 24, 27, 0.92)',
    hudBorder: 'rgba(255, 255, 255, 0.12)',
  },
  sepia: {
    background: '#F4ECD8',
    text: '#433422',
    subText: '#7D6A53',
    hudBackground: 'rgba(244, 236, 216, 0.95)',
    hudBorder: 'rgba(67, 52, 34, 0.2)',
  },
  white: {
    background: '#FFFFFF',
    text: '#111827',
    subText: '#6B7280',
    hudBackground: 'rgba(255, 255, 255, 0.95)',
    hudBorder: 'rgba(0, 0, 0, 0.12)',
  },
};
