import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import type {ImageScale, ReaderPageItem, ReaderTheme} from './types';
import {THEME_COLORS} from './types';
import {TranslatedBubbleOverlay} from './TranslatedBubbleOverlay';
import type {PageTranslationResult, TranslatedBubble} from '../../lib/translator/mangaTranslatorEngine';

export interface AutoHeightComicPageProps {
  item: ReaderPageItem;
  index: number;
  screenWidth: number;
  theme: ReaderTheme;
  cropWhiteBorders?: boolean;
  translateEnabled?: boolean;
  translationBubbles?: TranslatedBubble[];
  onRetryTranslation?: () => void;
  onPageMeasured?: (index: number, height: number) => void;
}

export const AutoHeightComicPage = React.memo<AutoHeightComicPageProps>(({
  item,
  index,
  screenWidth,
  theme,
  cropWhiteBorders = false,
  translateEnabled = false,
  translationBubbles,
  onRetryTranslation,
  onPageMeasured,
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

  // Default aspect ratio: width = screenWidth, height = screenWidth * 1.45
  const initialHeight = useMemo(() => {
    if (item.width && item.height && item.width > 0 && item.height > 0) {
      return Math.round(screenWidth * (item.height / item.width));
    }
    return Math.round(screenWidth * 1.45);
  }, [screenWidth, item.width, item.height]);

  const [pageHeight, setPageHeight] = useState<number>(initialHeight);

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
        const dynamicHeight = Math.round(screenWidth * (naturalHeight / naturalWidth));
        setPageHeight(dynamicHeight);
        onPageMeasured?.(index, dynamicHeight);
      }
    },
    [screenWidth, item.width, item.height, index, onPageMeasured],
  );

  const handleImageError = useCallback(() => {
    retryPageImageWithUpdatedHeaders({
      index,
      imageUrl: currentUrl,
      headers: resolvedHeaders,
    })
      .then(updated => {
        if (updated.imageUrl !== currentUrl) {
          setCurrentUrl(updated.imageUrl);
          if (updated.headers) setResolvedHeaders(updated.headers);
          setLoading(true);
          setLoadError(false);
          setRetryKey(k => k + 1);
        } else {
          setLoading(false);
          setLoadError(true);
        }
      })
      .catch(() => {
        setLoading(false);
        setLoadError(true);
      });
  }, [index, currentUrl, resolvedHeaders]);

  const themeColors = THEME_COLORS[theme];

  return (
    <View
      style={{
        width: screenWidth,
        height: pageHeight,
        backgroundColor: themeColors.background,
        overflow: cropWhiteBorders ? 'hidden' : 'visible',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Image
        key={`${currentUrl}-${retryKey}`}
        source={{
          uri: currentUrl,
          ...(resolvedHeaders ? {headers: resolvedHeaders} : {}),
        }}
        style={{
          width: screenWidth,
          height: pageHeight,
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
          renderedWidth={screenWidth}
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
  onPageChange: (index: number) => void;
  onToggleHUD: () => void;
  onReachEnd?: () => void;
  scaleMode?: ImageScale;
  cropWhiteBorders?: boolean;
  theme?: ReaderTheme;
  disableTapZones?: boolean;
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
  cropWhiteBorders = false,
  theme = 'amoled',
  disableTapZones = false,
  translateEnabled = false,
  pageTranslations,
  onRetryTranslation,
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const listRef = useRef<FlatList<ReaderPageItem>>(null);
  const currentScrollY = useRef<number>(0);
  const isUserScrolling = useRef<boolean>(false);
  const lastReportedIndex = useRef<number>(currentPageIndex);

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

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    currentScrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onViewableItemsChanged = useCallback(
    ({viewableItems}: {viewableItems: ViewToken[]}) => {
      if (viewableItems && viewableItems.length > 0) {
        const topItem = viewableItems[0];
        if (typeof topItem.index === 'number') {
          lastReportedIndex.current = topItem.index;
          onPageChange(topItem.index);
        }
      }
    },
    [onPageChange],
  );

  // 3-Zone Edge Tap Handlers (executed safely on JS thread via Pressable)
  const handleLeftTap = useCallback(() => {
    try {
      const prevOffset = Math.max(0, currentScrollY.current - windowHeight * 0.8);
      listRef.current?.scrollToOffset({offset: prevOffset, animated: true});
    } catch {}
  }, [windowHeight]);

  const handleRightTap = useCallback(() => {
    try {
      const nextOffset = currentScrollY.current + windowHeight * 0.8;
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
          cropWhiteBorders={cropWhiteBorders}
          translateEnabled={translateEnabled}
          translationBubbles={bubbles}
          onRetryTranslation={onRetryTranslation ? () => onRetryTranslation(index) : undefined}
        />
      );
    },
    [
      windowWidth,
      theme,
      cropWhiteBorders,
      translateEnabled,
      pageTranslations,
      onRetryTranslation,
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
        extraData={currentPageIndex}
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
        onMomentumScrollEnd={() => {
          isUserScrolling.current = false;
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 30,
        }}
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

      {/* 3-Zone Edge Tap & HUD Toggle Overlay */}
      {!disableTapZones && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {/* Left Edge: 22% width -> Smoothly scroll UP */}
          <Pressable style={styles.leftTapZone} onPress={handleLeftTap} />

          {/* Center Zone: 56% width -> Toggle HUD */}
          <Pressable style={styles.centerTapZone} onPress={onToggleHUD} />

          {/* Right Edge: 22% width -> Smoothly scroll DOWN */}
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
    width: '22%',
  },
  centerTapZone: {
    position: 'absolute',
    left: '22%',
    top: 0,
    bottom: 0,
    width: '56%',
  },
  rightTapZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '22%',
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
