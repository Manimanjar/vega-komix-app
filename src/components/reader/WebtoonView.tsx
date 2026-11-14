import React, {useCallback, useEffect, useRef} from 'react';
import {StyleSheet, View, useWindowDimensions, type ViewToken} from 'react-native';
import {FlashList, type FlashListRef} from '@shopify/flash-list';
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
  scaleMode = 'fit_width',
  cropWhiteBorders = false,
  theme = 'amoled',
  disableTapZones = false,
  translateEnabled = false,
  pageTranslations,
  onRetryTranslation,
}) => {
  const {width: windowWidth} = useWindowDimensions();
  const listRef = useRef<FlashListRef<ReaderPageItem>>(null);
  const isUserScrolling = useRef<boolean>(false);
  const lastReportedIndex = useRef<number>(currentPageIndex);

  // Sync scroll to index when currentPageIndex is changed externally (e.g. from HUD slider)
  useEffect(() => {
    if (!isUserScrolling.current && Math.abs(currentPageIndex - lastReportedIndex.current) > 0) {
      lastReportedIndex.current = currentPageIndex;
      listRef.current?.scrollToIndex({
        index: Math.min(Math.max(currentPageIndex, 0), pages.length - 1),
        animated: false,
      });
    }
  }, [currentPageIndex, pages.length]);

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
      // Left 30% = scroll up / prev page
      // Right 30% = scroll down / next page
      // Center 40% = toggle HUD
      const leftThreshold = windowWidth * 0.3;
      const rightThreshold = windowWidth * 0.7;

      if (tapX < leftThreshold) {
        const prevIdx = Math.max(0, currentPageIndex - 1);
        listRef.current?.scrollToIndex({index: prevIdx, animated: true});
      } else if (tapX > rightThreshold) {
        const nextIdx = Math.min(pages.length - 1, currentPageIndex + 1);
        listRef.current?.scrollToIndex({index: nextIdx, animated: true});
      } else {
        onToggleHUD();
      }
    },
    [disableTapZones, windowWidth, onToggleHUD, currentPageIndex, pages.length],
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
      <FlashList
        ref={listRef}
        data={pages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={currentPageIndex}
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
        showsVerticalScrollIndicator={false}
        drawDistance={windowWidth * 2.5}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
