import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {Image as ExpoImage} from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../ui/Text';
import {resolvePageHeaders} from './usePagePreloader';
import {retryPageImageWithUpdatedHeaders} from '../../lib/aggregator/failoverLoader';
import {autoDomainResolver} from '../../lib/network/autoDomainResolver';
import {cleanHighResImageUrl} from '../../lib/reader/highResImageCleaner';
import type {ImageScale, InteractionMode, ReaderPageItem, ReaderTheme} from './types';
import {THEME_COLORS} from './types';
import {TranslatedBubbleOverlay} from './TranslatedBubbleOverlay';
import {EndOfChapterCard} from './EndOfChapterCard';
import type {PageTranslationResult, TranslatedBubble} from '../../lib/translator/mangaTranslatorEngine';
import {computePageBox} from './pageBox';

// Natural image sizes measured on load, keyed by image URL. Survives
// remounts (removeClippedSubviews unmounts off-screen pages) and chapter
// re-opens, so a page that loaded once never mounts again at a guessed height.
const measuredNaturalSizeCache = new Map<string, {width: number; height: number}>();
const MAX_CACHED_SIZES = 2000;
const cacheNaturalSize = (url: string, dims: {width: number; height: number}) => {
  if (!measuredNaturalSizeCache.has(url) && measuredNaturalSizeCache.size >= MAX_CACHED_SIZES) {
    const oldest = measuredNaturalSizeCache.keys().next().value;
    if (oldest) measuredNaturalSizeCache.delete(oldest);
  }
  measuredNaturalSizeCache.set(url, dims);
};

export interface AutoHeightComicPageProps {
  item: ReaderPageItem;
  index: number;
  screenWidth: number;
  screenHeight: number;
  theme: ReaderTheme;
  scaleMode?: ImageScale;
  zoomScale?: number;
  reloadKey?: number;
  cropWhiteBorders?: boolean;
  translateEnabled?: boolean;
  translationBubbles?: TranslatedBubble[];
  onRetryTranslation?: (pageIndex: number) => void;
  onPageMeasured?: (index: number, height: number) => void;
  /** Called when this page's image has decoded (for chapter load progress). */
  onPageLoaded?: (index: number) => void;
  onToggleHUD?: () => void;
  highQualityRendering?: boolean;
  onZoomChange?: (newScale: number) => void;
}

export const AutoHeightComicPage = React.memo<AutoHeightComicPageProps>(({
  item,
  index,
  screenWidth,
  screenHeight,
  theme,
  scaleMode = 'fit_width',
  zoomScale = 1.0,
  reloadKey = 0,
  translateEnabled = false,
  translationBubbles,
  onRetryTranslation,
  onPageMeasured,
  onPageLoaded,
  onToggleHUD,
  highQualityRendering = true,
  onZoomChange,
}) => {
  const [currentUrl, setCurrentUrl] = useState<string>(() =>
    cleanHighResImageUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(item.imageUrl)),
  );
  useEffect(() => {
    setCurrentUrl(cleanHighResImageUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(item.imageUrl)));
  }, [item.imageUrl]);

  const [resolvedHeaders, setResolvedHeaders] = useState<Record<string, string> | undefined>(
    item.headers,
  );
  const [retryKey, setRetryKey] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<boolean>(false);

  // Soft fade-in when the image decodes: the page melts in instead of
  // popping, which makes continuous scrolling feel fluid rather than jumpy.
  // But a page that already loaded once (its natural size is cached) must
  // NOT start black: on rotation / remount (removeClippedSubviews) every
  // visible page remounts, and if they all start at opacity 0 the whole
  // screen flashes black until they fade in (user, 2026-11-18). So a
  // cached image starts fully visible; only a genuinely new image fades in.
  const fade = useSharedValue(measuredNaturalSizeCache.has(item.imageUrl) ? 1 : 0);
  useEffect(() => {
    // The cache is keyed by the original item URL (not the cleaned one).
    if (!measuredNaturalSizeCache.has(item.imageUrl)) {
      fade.value = 0;
    }
  }, [currentUrl, retryKey, fade, item.imageUrl]);

  // Natural size measured on load (from the cache when this page loaded
  // before). Known dimensions — cached, then provider-supplied — feed the box
  // below, so a remounted page starts at its true size instead of the 1.45
  // fallback that made scrolling up shake.
  const [naturalSize, setNaturalSize] = useState<{width: number; height: number} | null>(() =>
    measuredNaturalSizeCache.get(item.imageUrl) ?? null,
  );
  const knownDims =
    naturalSize ??
    (item.width && item.height && item.width > 0 && item.height > 0
      ? {width: item.width, height: item.height}
      : undefined);

  // The page box for the current fit mode. Width and height always come from
  // this one computation, so the fit buttons visibly change the layout.
  const box = useMemo(
    () => computePageBox(knownDims, screenWidth, screenHeight, scaleMode, zoomScale),
    [knownDims, screenWidth, screenHeight, scaleMode, zoomScale],
  );

  const [pageHeight, setPageHeight] = useState<number>(box.height);

  // Update height when the box changes (mode/zoom change, or the true size loads).
  useEffect(() => {
    setPageHeight(prev => (Math.abs(prev - box.height) > 1 ? box.height : prev));
  }, [box.height]);

  // Trigger reload if reloadKey changes
  useEffect(() => {
    if (reloadKey > 0) {
      setLoading(true);
      setLoadError(false);
      setRetryKey(k => k + 1);
    }
  }, [reloadKey]);

  // Resolve headers (e.g. referer, cookies) asynchronously
  useEffect(() => {
    let active = true;
    resolvePageHeaders(currentUrl, item.headers).then(res => {
      if (active) {
        setResolvedHeaders(res);
      }
    });
    return () => {
      active = false;
    };
  }, [currentUrl, item.headers, retryKey]);

  const handleImageLoad = useCallback(
    (e: any) => {
      setLoading(false);
      setLoadError(false);
      fade.value = withTiming(1, {duration: 200});
      const src = e?.source || (e.nativeEvent as any)?.source;
      const naturalWidth = src?.width || item.width;
      const naturalHeight = src?.height || item.height;
      onPageLoaded?.(index);
      if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
        const dims = {width: naturalWidth, height: naturalHeight};
        setNaturalSize(dims);
        cacheNaturalSize(item.imageUrl, dims);
        const boxHeight = computePageBox(dims, screenWidth, screenHeight, scaleMode, zoomScale).height;
        setPageHeight(prev => (Math.abs(prev - boxHeight) > 1 ? boxHeight : prev));
        onPageMeasured?.(index, boxHeight);
      }
    },
    [screenWidth, screenHeight, scaleMode, zoomScale, item.width, item.height, item.imageUrl, index, onPageMeasured, onPageLoaded],
  );

  const handleImageError = useCallback(() => {
    setLoading(false);
    setLoadError(true);
    // Automatic retry with relaxed referrer
    retryPageImageWithUpdatedHeaders({
      index,
      imageUrl: currentUrl,
      headers: resolvedHeaders,
    })
      .then(result => {
        if (result && result.imageUrl && result.imageUrl !== currentUrl) {
          setCurrentUrl(result.imageUrl);
          if (result.headers) setResolvedHeaders(result.headers);
          setLoadError(false);
          setLoading(true);
          setRetryKey(k => k + 1);
        }
      })
      .catch(() => {});
  }, [index, currentUrl, resolvedHeaders]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  const themeColors = THEME_COLORS[theme];

  return (
    <View
      style={{
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: themeColors.background,
        marginTop: index > 0 ? -0.5 : 0,
      }}>
      <Animated.View
        style={[
          {
            width: box.width,
            height: Math.ceil(pageHeight),
            backgroundColor: themeColors.background,
          },
          animatedStyle,
        ]}>
        <ExpoImage
          key={`${currentUrl}-${retryKey}`}
          source={{
            uri: currentUrl,
            headers: resolvedHeaders,
          }}
          style={{width: '100%', height: '100%'}}
          // Full Screen fills the frame edge to edge, so the image must
          // cover-crop; every other mode contains the whole page.
          contentFit={scaleMode === 'full_screen' ? 'cover' : 'contain'}
          priority={highQualityRendering ? 'high' : 'normal'}
          recyclingKey={item.imageUrl}
          enableLiveTextInteraction={false}
          // High-quality ON (default): full original resolution, 32-bit
          // ARGB, no downscaling. OFF: the decoder may downscale to the
          // view size and uses 16-bit RGB — roughly half the bitmap memory
          // per page, which is what makes big chapters scroll smoothly.
          allowDownscaling={!highQualityRendering}
          decodeFormat={highQualityRendering ? 'argb' : 'rgb'}
          cachePolicy="memory-disk"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </Animated.View>

      {/* Loading state indicator: only show if not already in natural size cache, non-blocking */}
      {loading && !loadError && !measuredNaturalSizeCache.has(item.imageUrl) && (
        <View pointerEvents="none" style={styles.centerOverlay}>
          <ActivityIndicator size="small" color="#7C4DFF" />
        </View>
      )}

      {/* Error state with retry */}
      {loadError && (
        <View style={styles.centerOverlay}>
          <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#FF5252" />
          <AppText role="labelSmall" style={{color: '#FF5252', marginTop: 4}}>
            Failed to load page {index + 1}
          </AppText>
          <Pressable
            onPress={() => {
              setLoading(true);
              setLoadError(false);
              setRetryKey(k => k + 1);
              onRetryTranslation?.(index);
            }}
            style={styles.retryButton}>
            <MaterialCommunityIcons name="reload" size={14} color="#FFFFFF" />
            <AppText role="labelSmall" style={{color: '#FFFFFF', fontWeight: '700'}}>
              Retry
            </AppText>
          </Pressable>
        </View>
      )}

      {/* Translation Bubbles Overlay */}
      {translateEnabled && translationBubbles && translationBubbles.length > 0 && (
        <TranslatedBubbleOverlay
          bubbles={translationBubbles}
          renderedWidth={box.width}
          renderedHeight={pageHeight}
          visible={true}
        />
      )}
    </View>
  );
});

export interface WebtoonViewProps {
  pages: ReaderPageItem[];
  currentPageIndex: number;
  sliderJumpTarget?: {index: number; timestamp: number} | null;
  onPageChange: (index: number) => void;
  onToggleHUD: () => void;
  onPageLoaded?: (index: number) => void;
  onDismissHUD?: () => void;
  onReachEnd?: () => void;
  hasNextChapter?: boolean;
  nextChapterTitle?: string;
  onNextChapter?: () => void;
  scaleMode?: ImageScale;
  zoomScale?: number;
  reloadKey?: number;
  cropWhiteBorders?: boolean;
  theme?: ReaderTheme;
  disableTapZones?: boolean;
  interactionMode?: InteractionMode;
  translateEnabled?: boolean;
  pageTranslations?: Record<number, PageTranslationResult>;
  onRetryTranslation?: (pageIndex: number) => void;
  highQualityRendering?: boolean;
  onZoomChange?: (newScale: number) => void;
}

export const WebtoonContinuousReader: React.FC<WebtoonViewProps> = ({
  pages,
  currentPageIndex,
  sliderJumpTarget,
  onPageChange,
  onToggleHUD,
  onDismissHUD,
  onPageLoaded,
  onReachEnd,
  hasNextChapter,
  nextChapterTitle,
  onNextChapter,
  scaleMode = 'fit_width',
  zoomScale = 1.0,
  reloadKey = 0,
  cropWhiteBorders = false,
  theme = 'amoled',
  disableTapZones = false,
  interactionMode = 'scroll',
  translateEnabled = false,
  pageTranslations,
  onRetryTranslation,
  highQualityRendering = true,
  onZoomChange,
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const listRef = useRef<FlatList<ReaderPageItem>>(null);
  const currentScrollY = useRef<number>(0);
  const isUserScrolling = useRef<boolean>(false);
  const isJumpingRef = useRef<boolean>(false);
  const isInternalPageChange = useRef<boolean>(false);
  const jumpTimerRef = useRef<any>(null);
  const rotateTimerRef = useRef<any>(null);
  const lastReportedIndex = useRef<number>(currentPageIndex);
  const pageHeights = useRef<Record<number, number>>({});
  // Rotation guard (see the effect below): re-anchor to the same page when
  // the window size changes, instead of keeping the old pixel offset.
  const prevDimsRef = useRef<{width: number; height: number} | null>(null);

  // Document-level PDF-style zoom & pan for continuous scroll
  const docScale = useSharedValue(1.0);
  const savedDocScale = useSharedValue(1.0);
  const docTransX = useSharedValue(0);
  const savedDocTransX = useSharedValue(0);

  // While a rotation is settling, automatic jumps and viewability handlers
  // are locked out: if the viewability handler fires on a half-laid-out list,
  // the list fights the re-anchor and the scroll runs away (user, 2026-11-18).
  // Set by the rotation effect, cleared once the re-anchor has landed and layout settled.
  const isRotatingRef = useRef<boolean>(false);
  // Bumps every time a page reports a real measured height, so the
  // prefix-sum below (and getItemLayout) recompute from true heights
  // instead of the fallback ratio.
  const [measuredVersion, setMeasuredVersion] = useState<number>(0);
  // In ONE_TAP mode the edge/centre overlay owns every tap, so the page's
  // own tap gesture must stay silent — otherwise one centre tap toggles the
  // HUD twice and the bars flash on and off instantly.
  const overlayActive = interactionMode === 'one_tap' && !disableTapZones;

  const handlePageMeasured = useCallback((idx: number, height: number) => {
    if (pageHeights.current[idx] !== height) {
      pageHeights.current[idx] = height;
      setMeasuredVersion(v => v + 1);
    }
  }, []);

  // One height per page, from the same box math as the rendered pages.
  // Measured heights win; otherwise the cached natural size / provider dims
  // feed computePageBox; otherwise the 1.45 fallback ratio. This is the
  // single source of truth for both the rendered height and the list's
  // layout, so they can never disagree.
  const pageHeightAt = useCallback(
    (index: number): number => {
      const measured = pageHeights.current[index];
      if (measured && measured > 0) return measured;
      const page = pages[index];
      const cached = page?.imageUrl
        ? measuredNaturalSizeCache.get(page.imageUrl)
        : undefined;
      const dims =
        cached ??
        (page?.width && page?.height && page.width > 0
          ? {width: page.width, height: page.height}
          : undefined);
      return computePageBox(dims, windowWidth, windowHeight, scaleMode, zoomScale).height;
    },
    [pages, windowWidth, windowHeight, scaleMode, zoomScale],
  );

  // Prefix sum of page heights: pageOffsets[i] is the exact pixel offset of
  // the top of page i. Recomputed whenever the window, fit mode or any
  // measured height changes. This is what makes getItemLayout exact and
  // the rotation re-anchor land on the right page instead of a random one.
  const pageOffsets = useMemo(() => {
    const offsets: number[] = new Array(pages.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < pages.length; i++) {
      offsets[i + 1] = offsets[i] + pageHeightAt(i);
    }
    return offsets;
  }, [pages.length, pageHeightAt, measuredVersion]);

  const getItemLayout = useCallback(
    (_data: any, index: number) => ({
      length: pageHeightAt(index),
      offset: pageOffsets[index] ?? 0,
      index,
    }),
    [pageHeightAt, pageOffsets],
  );

  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  // Jump offsets come from the prefix sum, so a jump lands on the exact
  // top of the target page — the same heights the list lays out with.
  const calculatePageOffset = useCallback(
    (targetIndex: number): number => {
      const clamped = Math.min(Math.max(targetIndex, 0), pages.length);
      return pageOffsets[clamped] ?? 0;
    },
    [pages.length, pageOffsets],
  );

  // Jump directly with animated: false and lock scroll listener for 400ms to eliminate jitter.
  // Uses scrollToIndex (precise with getItemLayout) instead of a raw pixel
  // offset, so the jump lands on the target page even while the list is
  // still laying out — a pixel offset computed from heights the list has
  // not rendered yet is what used to land on a random page (user, 2026-11-18).
  const jumpToPage = useCallback(
    (targetIndex: number) => {
      if (pages.length === 0) return;
      const clampedIndex = Math.min(Math.max(targetIndex, 0), pages.length - 1);

      isJumpingRef.current = true;
      if (jumpTimerRef.current) {
        clearTimeout(jumpTimerRef.current);
      }
      jumpTimerRef.current = setTimeout(() => {
        isJumpingRef.current = false;
      }, 400);

      lastReportedIndex.current = clampedIndex;
      onPageChangeRef.current(clampedIndex);

      const offset = calculatePageOffset(clampedIndex);
      currentScrollY.current = offset;

      try {
        listRef.current?.scrollToIndex({
          index: clampedIndex,
          animated: false,
        });
      } catch {
        try {
          listRef.current?.scrollToOffset({
            offset,
            animated: false,
          });
        } catch {}
      }
    },
    [pages.length, calculatePageOffset],
  );

  const jumpToPageRef = useRef(jumpToPage);
  jumpToPageRef.current = jumpToPage;

  // Direct jump triggered by slider commit
  useEffect(() => {
    if (sliderJumpTarget) {
      jumpToPage(sliderJumpTarget.index);
    }
  }, [sliderJumpTarget, jumpToPage]);

  // Sync scroll to index when currentPageIndex is changed externally (e.g. from chapter change or resume).
  // Never during a rotation: the re-anchor owns the scroll position until
  // the layout settles, and an external jump mid-transition is what used
  // to send the list to a random page.
  useEffect(() => {
    if (isInternalPageChange.current) {
      isInternalPageChange.current = false;
      return;
    }
    if (
      !isUserScrolling.current &&
      !isJumpingRef.current &&
      !isRotatingRef.current &&
      Math.abs(currentPageIndex - lastReportedIndex.current) > 0
    ) {
      lastReportedIndex.current = currentPageIndex;
      jumpToPage(currentPageIndex);
    }
  }, [currentPageIndex, jumpToPage]);

  // Stay on the SAME page across an orientation change. Rotation resizes
  // every page (a fit-screen portrait page is much shorter in landscape),
  // so the old pixel offset lands on a different page — or on a gap while
  // heights settle, which is the shaking / disappearing image. Re-anchor to
  // the last reported page, without animation, once the new layout settles.
  useEffect(() => {
    const prev = prevDimsRef.current;
    prevDimsRef.current = {width: windowWidth, height: windowHeight};
    if (!prev) return;
    if (prev.width === windowWidth && prev.height === windowHeight) return;

    // Reset doc zoom and pan on orientation switch so layout starts clean
    docScale.value = 1.0;
    savedDocScale.value = 1.0;
    docTransX.value = 0;
    savedDocTransX.value = 0;

    // Drop the old orientation's measured heights: a height measured at
    // the old width is wrong at the new width, and the prefix sum must
    // fall back to computePageBox (correct for the new window) until the
    // pages re-measure.
    pageHeights.current = {};
    setMeasuredVersion(v => v + 1);

    // Lock automatic jumps and scroll runaway mid-transition
    isRotatingRef.current = true;
    isJumpingRef.current = true;
    if (jumpTimerRef.current) {
      clearTimeout(jumpTimerRef.current);
    }

    const targetIndex = lastReportedIndex.current;
    const timer1 = setTimeout(() => {
      jumpToPageRef.current(targetIndex);
    }, 100);
    const timer2 = setTimeout(() => {
      jumpToPageRef.current(targetIndex);
    }, 400);

    const release = setTimeout(() => {
      isRotatingRef.current = false;
      isJumpingRef.current = false;
    }, 600);
    rotateTimerRef.current = release;

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(release);
      isRotatingRef.current = false;
      isJumpingRef.current = false;
    };
  }, [windowWidth, windowHeight]);

  // Clear jump timer on unmount
  useEffect(() => {
    return () => {
      if (jumpTimerRef.current) {
        clearTimeout(jumpTimerRef.current);
      }
      if (rotateTimerRef.current) {
        clearTimeout(rotateTimerRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    currentScrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 30,
    waitForInteraction: false,
  }).current;

  const onViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: ViewToken[]}) => {
      if (isJumpingRef.current) return;
      // During a rotation the list is half-laid-out: the "top" item is
      // whatever happens to be visible mid-transition, not the page the
      // user is on. Reporting it would move lastReportedIndex (and the
      // parent's currentPageIndex) to a random page and the sync effect
      // would jump there — the 7 -> 17 jump (user, 2026-11-18).
      if (isRotatingRef.current) return;
      if (viewableItems && viewableItems.length > 0) {
        const topItem = viewableItems[0];
        if (typeof topItem.index === 'number') {
          isInternalPageChange.current = true;
          lastReportedIndex.current = topItem.index;
          onPageChangeRef.current(topItem.index);
        }
      }
    },
  ).current;

  // 3-Zone Edge Tap Handlers (executed safely on JS thread via Pressable)
  const handleLeftTap = useCallback(() => {
    try {
      const prevOffset = Math.max(0, currentScrollY.current - windowHeight * 0.8);
      currentScrollY.current = prevOffset;
      listRef.current?.scrollToOffset({offset: prevOffset, animated: true});
    } catch {}
  }, [windowHeight]);

  const handleRightTap = useCallback(() => {
    try {
      const nextOffset = currentScrollY.current + windowHeight * 0.8;
      currentScrollY.current = nextOffset;
      listRef.current?.scrollToOffset({offset: nextOffset, animated: true});
    } catch {}
  }, [windowHeight]);

  const renderItem = useCallback(
    ({item, index}: {item: ReaderPageItem; index: number}) => {
      const bubbles = pageTranslations?.[index]?.bubbles;
      return (
        <AutoHeightComicPage
          item={item}
          index={index}
          screenWidth={windowWidth}
          screenHeight={windowHeight}
          theme={theme}
          scaleMode={scaleMode}
          zoomScale={zoomScale}
          reloadKey={reloadKey}
          cropWhiteBorders={cropWhiteBorders}
          translateEnabled={translateEnabled}
          translationBubbles={bubbles}
          onRetryTranslation={onRetryTranslation}
          onPageMeasured={handlePageMeasured}
          onPageLoaded={onPageLoaded}
          onToggleHUD={overlayActive ? undefined : onToggleHUD}
          highQualityRendering={highQualityRendering}
          onZoomChange={onZoomChange}
        />
      );
    },
    [
      windowWidth,
      windowHeight,
      theme,
      scaleMode,
      zoomScale,
      reloadKey,
      cropWhiteBorders,
      translateEnabled,
      pageTranslations,
      onRetryTranslation,
      handlePageMeasured,
      onPageLoaded,
      onToggleHUD,
      overlayActive,
      highQualityRendering,
      onZoomChange,
    ],
  );

  const keyExtractor = useCallback(
    (item: ReaderPageItem, idx: number) => `${item.imageUrl}-${idx}`,
    [],
  );

  const themeColors = THEME_COLORS[theme];

  // Two-Finger Pinch-to-Zoom Gesture (PDF-style continuous smooth zoom of entire comic)
  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      savedDocScale.value = docScale.value;
    })
    .onUpdate(e => {
      const next = Math.max(1.0, Math.min(3.5, savedDocScale.value * e.scale));
      docScale.value = next;
    })
    .onEnd(() => {
      if (docScale.value <= 1.05) {
        docScale.value = withTiming(1.0, {duration: 150});
        docTransX.value = withTiming(0, {duration: 150});
        savedDocScale.value = 1.0;
        savedDocTransX.value = 0;
      } else {
        savedDocScale.value = docScale.value;
      }
    });

  // Pan Gesture: requires 2 fingers to scroll/pan horizontally towards borders,
  // reserving 1-finger drag strictly for native vertical FlatList scrolling.
  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    .maxPointers(2)
    .onStart(() => {
      savedDocTransX.value = docTransX.value;
    })
    .onUpdate(e => {
      const maxPanX = Math.max(0, (windowWidth * (docScale.value - 1)) / 2);
      if (maxPanX > 0) {
        const nextX = savedDocTransX.value + e.translationX;
        if (nextX < -maxPanX) {
          docTransX.value = -maxPanX + (nextX - (-maxPanX)) * 0.25;
        } else if (nextX > maxPanX) {
          docTransX.value = maxPanX + (nextX - maxPanX) * 0.25;
        } else {
          docTransX.value = nextX;
        }
      }
    })
    .onEnd(() => {
      const maxPanX = Math.max(0, (windowWidth * (docScale.value - 1)) / 2);
      const boundedX = Math.max(-maxPanX, Math.min(maxPanX, docTransX.value));
      docTransX.value = withTiming(boundedX, {duration: 150});
      savedDocTransX.value = boundedX;
    });

  // Single Tap Gesture (triggers HUD toggle)
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .runOnJS(true)
    .onEnd(() => {
      if (!overlayActive) {
        onToggleHUD?.();
      }
    });

  // Double Tap Gesture (1x <-> 2.0x global continuous zoom)
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .runOnJS(true)
    .onEnd(() => {
      if (docScale.value > 1.15) {
        docScale.value = withTiming(1.0, {duration: 200});
        docTransX.value = withTiming(0, {duration: 200});
        savedDocScale.value = 1.0;
        savedDocTransX.value = 0;
      } else {
        docScale.value = withTiming(2.0, {duration: 200});
        savedDocScale.value = 2.0;
      }
    });

  const zoomGestures = Gesture.Simultaneous(pinchGesture, panGesture);
  const tapGestures = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
  const continuousGestures = Gesture.Simultaneous(zoomGestures, tapGestures);

  const docAnimatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [
      {translateX: docTransX.value},
      {scale: docScale.value},
    ],
  }));

  return (
    <View style={[styles.container, {backgroundColor: themeColors.background}]}>
      <GestureDetector gesture={continuousGestures}>
        <Animated.View style={[{flex: 1, overflow: 'hidden'}, docAnimatedStyle]}>
          <FlatList
            ref={listRef}
            data={pages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            extraData={`${zoomScale}-${reloadKey}-${theme}-${highQualityRendering}-${scaleMode}`}
            horizontal={false}
            pagingEnabled={false}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            removeClippedSubviews={true}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={32}
            ItemSeparatorComponent={null}
            // Exact item layout: the list knows every page's height and offset
            // without rendering, so scrollToIndex lands on the target page and
            // the scroll position survives the rotation resize.
            getItemLayout={getItemLayout}
            ListFooterComponent={
              hasNextChapter ? (
                <EndOfChapterCard
                  hasNextChapter={!!hasNextChapter}
                  nextChapterTitle={nextChapterTitle}
                  onNextChapter={onNextChapter}
                  theme={theme}
                  isPaged={false}
                />
              ) : null
            }
            onEndReachedThreshold={0.05}
            onEndReached={() => {
              if (onReachEnd) {
                onReachEnd();
              }
            }}
            style={{backgroundColor: themeColors.background}}
            contentContainerStyle={{backgroundColor: themeColors.background}}
            onScroll={handleScroll}
            onScrollBeginDrag={() => {
              if (isRotatingRef.current) return;
              isUserScrolling.current = true;
              onDismissHUD?.();
            }}
            onMomentumScrollBegin={() => {
              if (isRotatingRef.current) return;
              isUserScrolling.current = true;
            }}
            onScrollEndDrag={(e: any) => {
              const vy = Math.abs(e?.nativeEvent?.velocity?.y || 0);
              if (vy < 0.1) {
                isUserScrolling.current = false;
              }
            }}
            onMomentumScrollEnd={() => {
              isUserScrolling.current = false;
            }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onScrollToIndexFailed={(info: any) => {
              const offset =
                typeof info.offset === 'number'
                  ? info.offset
                  : calculatePageOffset(info.index ?? 0);
              setTimeout(() => {
                try {
                  listRef.current?.scrollToOffset({offset, animated: false});
                } catch {}
              }, 50);
            }}
            windowSize={highQualityRendering ? 5 : 3}
            maxToRenderPerBatch={highQualityRendering ? 3 : 2}
            initialNumToRender={3}
          />
        </Animated.View>
      </GestureDetector>

      {/* In ONE_TAP mode: 3-Zone Edge Tap & HUD Toggle Overlay (Left 28%, Center 44%, Right 28%) */}
      {/* In SCROLL mode: NO overlay is rendered so FlatList has 100% unrestricted native touch scroll */}
      {interactionMode === 'one_tap' && !disableTapZones && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {/* Left Edge: 28% width -> Smoothly scroll UP */}
          <Pressable style={styles.leftTapZone} onPress={handleLeftTap} />

          {/* Center Zone: 44% width -> Toggle HUD */}
          <Pressable style={styles.centerTapZone} onPress={onToggleHUD} />

          {/* Right Edge: 28% width -> Smoothly scroll DOWN */}
          <Pressable style={styles.rightTapZone} onPress={handleRightTap} />
        </View>
      )}
    </View>
  );
};

export const WebtoonView = WebtoonContinuousReader;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  leftTapZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '28%',
  },
  centerTapZone: {
    position: 'absolute',
    left: '28%',
    top: 0,
    bottom: 0,
    width: '44%',
  },
  rightTapZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '28%',
  },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 5,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#7C4DFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
});
