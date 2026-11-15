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
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../ui/Text';
import {resolvePageHeaders} from './usePagePreloader';
import {retryPageImageWithUpdatedHeaders} from '../../lib/aggregator/failoverLoader';
import {autoDomainResolver} from '../../lib/network/autoDomainResolver';
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
  onRetryTranslation?: () => void;
  onPageMeasured?: (index: number, height: number) => void;
  onToggleHUD?: () => void;
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
}) => {
  const [currentUrl, setCurrentUrl] = useState<string>(() =>
    autoDomainResolver.rewriteUrlWithResolvedDomain(item.imageUrl),
  );
  useEffect(() => {
    setCurrentUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(item.imageUrl));
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
      return Math.round(effectiveWidth * (item.height / item.width));
    }
    return Math.round(effectiveWidth * 1.45);
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
      const src = (e.nativeEvent as any)?.source || (e as any)?.source;
      const naturalWidth = src?.width || item.width;
      const naturalHeight = src?.height || item.height;
      if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
        const dynamicHeight = Math.round(screenWidth * (naturalHeight / naturalWidth)) * (zoomScale || 1.0);
        setPageHeight(dynamicHeight);
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
      }}>
      <Animated.Image
        key={`${currentUrl}-${retryKey}`}
        source={{
          uri: currentUrl,
          ...(resolvedHeaders ? {headers: resolvedHeaders} : {}),
        }}
        style={{
          width: effectiveWidth, // width: screenWidth
          height: pageHeight,
          transform: [{scale: scaleAnim}],
        }}
        resizeMode="contain"
        resizeMethod="resize"
        onLoad={handleImageLoad}
        onError={handleImageError}
      />

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
  onPageChange: (index: number) => void;
  onToggleHUD: () => void;
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
}

export const WebtoonContinuousReader: React.FC<WebtoonViewProps> = ({
  pages,
  currentPageIndex,
  onPageChange,
  onToggleHUD,
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
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const listRef = useRef<FlatList<ReaderPageItem>>(null);
  const currentScrollY = useRef<number>(0);
  const isUserScrolling = useRef<boolean>(false);
  const lastReportedIndex = useRef<number>(currentPageIndex);

  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  // Sync scroll to index when currentPageIndex is changed externally (e.g. from HUD slider)
  useEffect(() => {
    if (!isUserScrolling.current && Math.abs(currentPageIndex - lastReportedIndex.current) > 0) {
      lastReportedIndex.current = currentPageIndex;
      try {
        const clampedIndex = Math.min(Math.max(currentPageIndex, 0), pages.length - 1);
        listRef.current?.scrollToIndex({
          index: clampedIndex,
          animated: false,
        });
      } catch {
        try {
          listRef.current?.scrollToOffset({
            offset: currentPageIndex * (windowHeight * 0.8),
            animated: false,
          });
        } catch {}
      }
    }
  }, [currentPageIndex, pages.length, windowHeight]);

  // Hands-Free Auto-Scroll: Smooth continuous scroll, pauses automatically on touch
  useEffect(() => {
    if (!autoScrollSpeed || autoScrollSpeed === 'off') return;

    const speedPx =
      autoScrollSpeed === 'slow' ? 1.0 : autoScrollSpeed === 'medium' ? 2.4 : 4.5;

    const timer = setInterval(() => {
      if (!isUserScrolling.current && listRef.current) {
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
      if (viewableItems && viewableItems.length > 0) {
        const topItem = viewableItems[0];
        if (typeof topItem.index === 'number') {
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
          onRetryTranslation={onRetryTranslation ? () => onRetryTranslation(index) : undefined}
          onToggleHUD={onToggleHUD}
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
      onToggleHUD,
    ],
  );

  const keyExtractor = useCallback(
    (item: ReaderPageItem, idx: number) => `${item.imageUrl}-${idx}`,
    [],
  );

  const themeColors = THEME_COLORS[theme];

  return (
    <View style={[styles.container, {backgroundColor: themeColors.background}]}>
      <FlatList
        ref={listRef}
        data={pages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={`${currentPageIndex}-${zoomScale}-${reloadKey}`}
        horizontal={false}
        pagingEnabled={false}
        scrollEnabled={true}
        nestedScrollEnabled={true}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          isUserScrolling.current = true;
        }}
        onScrollEndDrag={() => {
          isUserScrolling.current = false;
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
        windowSize={11}
        maxToRenderPerBatch={4}
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
