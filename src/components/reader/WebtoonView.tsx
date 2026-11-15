import React, {useCallback, useEffect, useRef} from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import {ReaderImage} from './ReaderImage';
import {turboPreloader} from '../../lib/reader/turboPreloader';
import type {ImageScale, ReaderPageItem, ReaderTheme} from './types';
import {THEME_COLORS} from './types';

import type {PageTranslationResult} from '../../lib/translator/mangaTranslatorEngine';

interface WebtoonViewProps {
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

export const WebtoonView: React.FC<WebtoonViewProps> = ({
  pages,
  currentPageIndex,
  onPageChange,
  onToggleHUD,
  onReachEnd,
  scaleMode = 'fit_width',
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
        listRef.current?.scrollToIndex({
          index: Math.min(Math.max(currentPageIndex, 0), pages.length - 1),
          animated: false,
        });
      } catch {
        // Handled by onScrollToIndexFailed
      }
    }
  }, [currentPageIndex, pages.length]);

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

  const handleTap = useCallback(
    (tapX: number, _tapY: number) => {
      if (disableTapZones) {
        onToggleHUD();
        return;
      }

      // 9-grid horizontal zones:
      // Left 30% = scroll up by screenHeight * 0.75
      // Right 30% = scroll down by screenHeight * 0.75
      // Center 40% = toggle HUD
      const leftThreshold = windowWidth * 0.3;
      const rightThreshold = windowWidth * 0.7;

      if (tapX < leftThreshold) {
        const prevOffset = Math.max(0, currentScrollY.current - windowHeight * 0.75);
        listRef.current?.scrollToOffset({offset: prevOffset, animated: true});
      } else if (tapX > rightThreshold) {
        const nextOffset = currentScrollY.current + windowHeight * 0.75;
        listRef.current?.scrollToOffset({offset: nextOffset, animated: true});
      } else {
        onToggleHUD();
      }
    },
    [disableTapZones, windowWidth, windowHeight, onToggleHUD],
  );

  const renderItem = useCallback(
    ({item, index}: {item: ReaderPageItem; index: number}) => {
      const activeBitmap = turboPreloader.isPageBitmapActive(
        index,
        currentPageIndex,
      );
      const bubbles = pageTranslations?.[index]?.bubbles;
      return (
        <ReaderImage
          imageUrl={item.imageUrl}
          index={index}
          width={item.width}
          height={item.height}
          headers={item.headers}
          scaleMode={scaleMode}
          cropWhiteBorders={cropWhiteBorders}
          theme={theme}
          isWebtoon={true}
          activeBitmap={activeBitmap}
          translateEnabled={translateEnabled}
          translationBubbles={bubbles}
          onRetryTranslation={onRetryTranslation ? () => onRetryTranslation(index) : undefined}
          onSingleTap={handleTap}
        />
      );
    },
    [
      scaleMode,
      cropWhiteBorders,
      theme,
      handleTap,
      currentPageIndex,
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
          const offset = typeof info.offset === 'number' ? info.offset : info.index * (info.averageItemLength || windowHeight * 0.8);
          setTimeout(() => {
            listRef.current?.scrollToOffset({ offset, animated: false });
          }, 50);
        }}
        windowSize={11}
        maxToRenderPerBatch={4}
        initialNumToRender={3}
        removeClippedSubviews={false}
        onEndReached={onReachEnd}
        onEndReachedThreshold={0.05}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
