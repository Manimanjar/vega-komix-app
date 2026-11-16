import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import {Image as ExpoImage} from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../ui/Text';
import {resolvePageHeaders} from './usePagePreloader';
import {retryPageImageWithUpdatedHeaders} from '../../lib/aggregator/failoverLoader';
import {autoDomainResolver} from '../../lib/network/autoDomainResolver';
import {cleanHighResImageUrl} from '../../lib/reader/highResImageCleaner';
import type {AutoScrollSpeed, ImageScale, InteractionMode, ReaderPageItem, ReaderTheme} from './types';
import {THEME_COLORS} from './types';
import {TranslatedBubbleOverlay} from './TranslatedBubbleOverlay';
import type {PageTranslationResult, TranslatedBubble} from '../../lib/translator/mangaTranslatorEngine';

export interface AutoHeightComicPageProps {
  item: ReaderPageItem;
  index: number;
  screenWidth: number;
  theme: ReaderTheme;
  scaleMode?: ImageScale;
  zoomScale?: number;
  reloadKey?: number;
  cropWhiteBorders?: boolean;
  translateEnabled?: boolean;
  translationBubbles?: TranslatedBubble[];
  onRetryTranslation?: (pageIndex: number) => void;
  onPageMeasured?: (index: number, height: number) => void;
  onToggleHUD?: () => void;
  highQualityRendering?: boolean;
}

export const AutoHeightComicPage = React.memo<AutoHeightComicPageProps>(({
  item,
  index,
  screenWidth,
  theme,
  scaleMode = 'fit_width',
  zoomScale = 1.0,
  reloadKey = 0,
  cropWhiteBorders = false,
  translateEnabled = false,
  translationBubbles,
  onRetryTranslation,
  onPageMeasured,
  onToggleHUD,
  highQualityRendering = false,
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

  // Crash-free zoom controller (1x <-> 2x toggle without Reanimated worklets)
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isZoomed = useRef<boolean>(false);
  const lastTapTime = useRef<number>(0);
  const singleTapTimer = useRef<any>(null);

  const toggleZoom = useCallback(() => {
    if (isZoomed.current) {
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      isZoomed.current = false;
    } else {
      Animated.timing(scaleAnim, {
        toValue: 2,
        duration: 200,
        useNativeDriver: true,
      }).start();
      isZoomed.current = true;
    }
  }, [scaleAnim]);

  const handlePagePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTime.current < 280) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      toggleZoom();
    } else {
      lastTapTime.current = now;
      if (onToggleHUD) {
        singleTapTimer.current = setTimeout(() => {
          onToggleHUD();
        }, 280);
      }
    }
  }, [toggleZoom, onToggleHUD]);

  const effectiveWidth = useMemo(() => {
    return Math.round(screenWidth * (zoomScale || 1.0));
  }, [screenWidth, zoomScale]);

  // Default aspect ratio: width = effectiveWidth, height = effectiveWidth * (naturalHeight / naturalWidth)
  const initialHeight = useMemo(() => {
    if (item.width && item.height && item.width > 0 && item.height > 0) {
      return Math.ceil(Math.round(effectiveWidth * (item.height / item.width)));
    }
    return Math.ceil(Math.round(effectiveWidth * 1.45));
  }, [effectiveWidth, item.width, item.height]);

  const [pageHeight, setPageHeight] = useState<number>(initialHeight);

  // Update height when effectiveWidth changes
  useEffect(() => {
    setPageHeight(initialHeight);
  }, [initialHeight]);

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
      const src = e?.source || (e.nativeEvent as any)?.source;
      const naturalWidth = src?.width || item.width;
      const naturalHeight = src?.height || item.height;
      if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
        const dynamicHeight = Math.ceil(Math.round(screenWidth * (naturalHeight / naturalWidth))) * (zoomScale || 1.0);
        setPageHeight(prev => (Math.abs(prev - dynamicHeight) > 1 ? dynamicHeight : prev));
        onPageMeasured?.(index, dynamicHeight);
      }
    },
    [screenWidth, zoomScale, item.width, item.height, index, onPageMeasured],
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

  const themeColors = THEME_COLORS[theme];

  return (
    <Pressable
      onPress={handlePagePress}
      style={{
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        marginTop: index > 0 ? -0.5 : 0,
      }}>
      <Animated.View
        style={{
          width: effectiveWidth, // width: screenWidth
          height: Math.ceil(pageHeight),
          backgroundColor: '#000000',
          transform: [{scale: scaleAnim}],
        }}>
        <ExpoImage
          key={`${currentUrl}-${retryKey}`}
          source={{
            uri: currentUrl,
            headers: resolvedHeaders,
          }}
          style={{width: '100%', height: '100%'}}
          contentFit="contain"
          priority="high"
          recyclingKey={item.imageUrl}
          enableLiveTextInteraction={false}
          allowDownscaling={highQualityRendering ? false : true}
          decodeFormat="argb"
          cachePolicy="memory-disk"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </Animated.View>

      {/* Loading state indicator */}
      {loading && !loadError && (
        <View style={styles.centerOverlay}>
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
          renderedWidth={effectiveWidth}
          renderedHeight={pageHeight}
          visible={true}
        />
      )}
    </Pressable>
  );
});

export interface WebtoonViewProps {
  pages: ReaderPageItem[];
  currentPageIndex: number;
  sliderJumpTarget?: {index: number; timestamp: number} | null;
  onPageChange: (index: number) => void;
  onToggleHUD: () => void;
  onDismissHUD?: () => void;
  onReachEnd?: () => void;
  scaleMode?: ImageScale;
  zoomScale?: number;
  autoScrollSpeed?: AutoScrollSpeed;
  reloadKey?: number;
  cropWhiteBorders?: boolean;
  theme?: ReaderTheme;
  disableTapZones?: boolean;
  interactionMode?: InteractionMode;
  translateEnabled?: boolean;
  pageTranslations?: Record<number, PageTranslationResult>;
  onRetryTranslation?: (pageIndex: number) => void;
  highQualityRendering?: boolean;
}

export const WebtoonContinuousReader: React.FC<WebtoonViewProps> = ({
  pages,
  currentPageIndex,
  sliderJumpTarget,
  onPageChange,
  onToggleHUD,
  onDismissHUD,
  onReachEnd,
  scaleMode = 'fit_width',
  zoomScale = 1.0,
  autoScrollSpeed = 'off',
  reloadKey = 0,
  cropWhiteBorders = false,
  theme = 'amoled',
  disableTapZones = false,
  interactionMode = 'scroll',
  translateEnabled = false,
  pageTranslations,
  onRetryTranslation,
  highQualityRendering = false,
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const listRef = useRef<FlatList<ReaderPageItem>>(null);
  const currentScrollY = useRef<number>(0);
  const isUserScrolling = useRef<boolean>(false);
  const isJumpingRef = useRef<boolean>(false);
  const isInternalPageChange = useRef<boolean>(false);
  const jumpTimerRef = useRef<any>(null);
  const lastReportedIndex = useRef<number>(currentPageIndex);
  const pageHeights = useRef<Record<number, number>>({});

  const handlePageMeasured = useCallback((idx: number, height: number) => {
    pageHeights.current[idx] = height;
  }, []);

  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  // Accurate offset calculation for instant jump without intermediate render passes
  const calculatePageOffset = useCallback(
    (targetIndex: number): number => {
      let offset = 0;
      const effectiveW = Math.round(windowWidth * (zoomScale || 1.0));
      for (let i = 0; i < targetIndex && i < pages.length; i++) {
        const page = pages[i];
        const measured = pageHeights.current[i];
        if (measured && measured > 0) {
          offset += measured;
        } else if (page && page.width && page.height && page.width > 0) {
          offset += Math.round(effectiveW * (page.height / page.width));
        } else {
          offset += Math.round(effectiveW * 1.45);
        }
      }
      return offset;
    },
    [pages, windowWidth, zoomScale],
  );

  // Jump directly with animated: false and lock scroll listener for 400ms to eliminate jitter
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
        listRef.current?.scrollToOffset({
          offset,
          animated: false,
        });
      } catch {
        try {
          listRef.current?.scrollToIndex({
            index: clampedIndex,
            animated: false,
          });
        } catch {}
      }
    },
    [pages.length, calculatePageOffset],
  );

  // Direct jump triggered by slider commit
  useEffect(() => {
    if (sliderJumpTarget) {
      jumpToPage(sliderJumpTarget.index);
    }
  }, [sliderJumpTarget, jumpToPage]);

  // Sync scroll to index when currentPageIndex is changed externally (e.g. from chapter change or resume)
  useEffect(() => {
    if (isInternalPageChange.current) {
      isInternalPageChange.current = false;
      return;
    }
    if (
      !isUserScrolling.current &&
      !isJumpingRef.current &&
      Math.abs(currentPageIndex - lastReportedIndex.current) > 0
    ) {
      lastReportedIndex.current = currentPageIndex;
      jumpToPage(currentPageIndex);
    }
  }, [currentPageIndex, jumpToPage]);

  // Clear jump timer on unmount
  useEffect(() => {
    return () => {
      if (jumpTimerRef.current) {
        clearTimeout(jumpTimerRef.current);
      }
    };
  }, []);

  // Hands-Free Auto-Scroll: Smooth continuous scroll, pauses automatically on touch
  useEffect(() => {
    if (!autoScrollSpeed || autoScrollSpeed === 'off') return;

    const speedPx =
      autoScrollSpeed === 'slow' ? 1.0 : autoScrollSpeed === 'medium' ? 2.4 : 4.5;

    const timer = setInterval(() => {
      if (!isUserScrolling.current && !isJumpingRef.current && listRef.current) {
        currentScrollY.current += speedPx;
        listRef.current.scrollToOffset({
          offset: currentScrollY.current,
          animated: false,
        });
      }
    }, 32);

    return () => clearInterval(timer);
  }, [autoScrollSpeed]);

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
          theme={theme}
          scaleMode={scaleMode}
          zoomScale={zoomScale}
          reloadKey={reloadKey}
          cropWhiteBorders={cropWhiteBorders}
          translateEnabled={translateEnabled}
          translationBubbles={bubbles}
          onRetryTranslation={onRetryTranslation}
          onPageMeasured={handlePageMeasured}
          onToggleHUD={onToggleHUD}
          highQualityRendering={highQualityRendering}
        />
      );
    },
    [
      windowWidth,
      theme,
      scaleMode,
      zoomScale,
      reloadKey,
      cropWhiteBorders,
      translateEnabled,
      pageTranslations,
      onRetryTranslation,
      handlePageMeasured,
      onToggleHUD,
      highQualityRendering,
    ],
  );

  const keyExtractor = useCallback(
    (item: ReaderPageItem, idx: number) => `${item.imageUrl}-${idx}`,
    [],
  );

  const themeColors = THEME_COLORS[theme];

  return (
    <View style={[styles.container, {backgroundColor: '#000000'}]}>
      <FlatList
        ref={listRef}
        data={pages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={`${zoomScale}-${reloadKey}-${theme}-${highQualityRendering}`}
        horizontal={false}
        pagingEnabled={false}
        scrollEnabled={true}
        nestedScrollEnabled={true}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        ItemSeparatorComponent={null}
        style={{backgroundColor: '#000000'}}
        contentContainerStyle={{backgroundColor: '#000000'}}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          isUserScrolling.current = true;
          onDismissHUD?.();
        }}
        onMomentumScrollBegin={() => {
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
              : info.index * (windowHeight * 0.8);
          setTimeout(() => {
            try {
              listRef.current?.scrollToOffset({offset, animated: false});
            } catch {}
          }, 50);
        }}
        windowSize={highQualityRendering ? 4 : 3}
        maxToRenderPerBatch={2}
        initialNumToRender={3}
        onEndReached={onReachEnd}
        onEndReachedThreshold={0.05}
      />

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
