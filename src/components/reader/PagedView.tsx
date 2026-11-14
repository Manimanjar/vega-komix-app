import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {ReaderImage} from './ReaderImage';
import {turboPreloader} from '../../lib/reader/turboPreloader';
import type {ImageScale, ReaderPageItem, ReaderTheme, ReadingMode} from './types';
import {THEME_COLORS} from './types';

interface PagedViewProps {
  pages: ReaderPageItem[];
  currentPageIndex: number;
  onPageChange: (index: number) => void;
  onToggleHUD: () => void;
  onReachEnd?: () => void;
  readingMode: ReadingMode;
  scaleMode?: ImageScale;
  cropWhiteBorders?: boolean;
  theme?: ReaderTheme;
}

interface SpreadPageGroup {
  id: string;
  isPair: boolean;
  pageA: ReaderPageItem;
  pageB?: ReaderPageItem;
  indexA: number;
  indexB?: number;
}

export const PagedView: React.FC<PagedViewProps> = ({
  pages,
  currentPageIndex,
  onPageChange,
  onToggleHUD,
  onReachEnd,
  readingMode,
  scaleMode = 'fit_width',
  cropWhiteBorders = false,
  theme = 'amoled',
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const isManga = readingMode === 'manga';
  const isDoubleSpread = readingMode === 'double_spread' && isLandscape;

  const listRef = useRef<FlatList>(null);
  const isUserScrolling = useRef<boolean>(false);
  const lastTargetIndex = useRef<number>(currentPageIndex);

  // Group pages into double spreads when in landscape double_spread mode
  const spreadGroups: SpreadPageGroup[] = useMemo(() => {
    if (!isDoubleSpread) {
      return pages.map((page, idx) => ({
        id: `single-${idx}`,
        isPair: false,
        pageA: page,
        indexA: idx,
      }));
    }

    const groups: SpreadPageGroup[] = [];
    let i = 0;
    while (i < pages.length) {
      const pageA = pages[i];
      const isAWide =
        (pageA.width && pageA.height && pageA.width > pageA.height * 1.1) || false;

      if (isAWide || i === 0 || i === pages.length - 1) {
        // Wide landscape spread or cover page (page 0) stands alone
        groups.push({
          id: `spread-single-${i}`,
          isPair: false,
          pageA,
          indexA: i,
        });
        i++;
      } else {
        const pageB = pages[i + 1];
        const isBWide =
          (pageB?.width && pageB?.height && pageB.width > pageB.height * 1.1) ||
          false;

        if (pageB && !isBWide) {
          groups.push({
            id: `spread-pair-${i}-${i + 1}`,
            isPair: true,
            pageA,
            pageB,
            indexA: i,
            indexB: i + 1,
          });
          i += 2;
        } else {
          groups.push({
            id: `spread-single-${i}`,
            isPair: false,
            pageA,
            indexA: i,
          });
          i++;
        }
      }
    }
    return groups;
  }, [pages, isDoubleSpread]);

  // Find the group index matching currentPageIndex
  const activeGroupIndex = useMemo(() => {
    const idx = spreadGroups.findIndex(
      g => g.indexA === currentPageIndex || g.indexB === currentPageIndex,
    );
    return idx !== -1 ? idx : 0;
  }, [spreadGroups, currentPageIndex]);

  // Sync scroll position when activeGroupIndex updates externally
  useEffect(() => {
    if (!isUserScrolling.current && Math.abs(activeGroupIndex - lastTargetIndex.current) > 0) {
      lastTargetIndex.current = activeGroupIndex;
      listRef.current?.scrollToIndex({
        index: activeGroupIndex,
        animated: false,
      });
    }
  }, [activeGroupIndex]);

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isUserScrolling.current = false;
      const offsetX = e.nativeEvent.contentOffset.x;
      const newGroupIdx = Math.round(offsetX / windowWidth);

      if (newGroupIdx >= 0 && newGroupIdx < spreadGroups.length) {
        const group = spreadGroups[newGroupIdx];
        lastTargetIndex.current = newGroupIdx;
        onPageChange(group.indexA);

        if (newGroupIdx === spreadGroups.length - 1 && onReachEnd) {
          onReachEnd();
        }
      }
    },
    [windowWidth, spreadGroups, onPageChange, onReachEnd],
  );

  // 9-Grid Tap Handler:
  // In Manga: Left = Next page, Right = Prev page
  // In Comic / Double spread: Left = Prev page, Right = Next page
  // Center = Toggle HUD
  const handleTap = useCallback(
    (tapX: number, _tapY: number) => {
      const leftThreshold = windowWidth * 0.3;
      const rightThreshold = windowWidth * 0.7;

      if (tapX < leftThreshold) {
        // Left tap
        if (isManga) {
          // Next page in Manga
          if (activeGroupIndex < spreadGroups.length - 1) {
            const nextIdx = activeGroupIndex + 1;
            listRef.current?.scrollToIndex({index: nextIdx, animated: true});
          } else if (onReachEnd) {
            onReachEnd();
          }
        } else {
          // Prev page in Comic
          if (activeGroupIndex > 0) {
            const prevIdx = activeGroupIndex - 1;
            listRef.current?.scrollToIndex({index: prevIdx, animated: true});
          }
        }
      } else if (tapX > rightThreshold) {
        // Right tap
        if (isManga) {
          // Prev page in Manga
          if (activeGroupIndex > 0) {
            const prevIdx = activeGroupIndex - 1;
            listRef.current?.scrollToIndex({index: prevIdx, animated: true});
          }
        } else {
          // Next page in Comic
          if (activeGroupIndex < spreadGroups.length - 1) {
            const nextIdx = activeGroupIndex + 1;
            listRef.current?.scrollToIndex({index: nextIdx, animated: true});
          } else if (onReachEnd) {
            onReachEnd();
          }
        }
      } else {
        // Center tap toggles HUD
        onToggleHUD();
      }
    },
    [windowWidth, isManga, activeGroupIndex, spreadGroups.length, onReachEnd, onToggleHUD],
  );

  const renderSpreadGroup = useCallback(
    ({item}: {item: SpreadPageGroup}) => {
      if (item.isPair && item.pageB) {
        // In Manga mode, right page is page A (first read), left is page B (second read).
        // In Comic mode, left page is page A, right is page B.
        const leftPage = isManga ? item.pageB : item.pageA;
        const rightPage = isManga ? item.pageA : item.pageB;
        const leftIndex = isManga ? item.indexB! : item.indexA;
        const rightIndex = isManga ? item.indexA : item.indexB!;

        return (
          <View
            style={[
              styles.pageContainer,
              {width: windowWidth, height: windowHeight, flexDirection: 'row'},
            ]}>
            <View style={{width: windowWidth / 2, height: windowHeight}}>
              <ReaderImage
                imageUrl={leftPage.imageUrl}
                index={leftIndex}
                width={leftPage.width}
                height={leftPage.height}
                headers={leftPage.headers}
                scaleMode="fit_height"
                cropWhiteBorders={cropWhiteBorders}
                theme={theme}
                isWebtoon={false}
                activeBitmap={turboPreloader.isPageBitmapActive(leftIndex, currentPageIndex)}
                onSingleTap={handleTap}
              />
            </View>
            <View style={{width: windowWidth / 2, height: windowHeight}}>
              <ReaderImage
                imageUrl={rightPage.imageUrl}
                index={rightIndex}
                width={rightPage.width}
                height={rightPage.height}
                headers={rightPage.headers}
                scaleMode="fit_height"
                cropWhiteBorders={cropWhiteBorders}
                theme={theme}
                isWebtoon={false}
                activeBitmap={turboPreloader.isPageBitmapActive(rightIndex, currentPageIndex)}
                onSingleTap={handleTap}
              />
            </View>
          </View>
        );
      }

      // Single page view
      return (
        <View style={[styles.pageContainer, {width: windowWidth, height: windowHeight}]}>
          <ReaderImage
            imageUrl={item.pageA.imageUrl}
            index={item.indexA}
            width={item.pageA.width}
            height={item.pageA.height}
            headers={item.pageA.headers}
            scaleMode={scaleMode}
            cropWhiteBorders={cropWhiteBorders}
            theme={theme}
            isWebtoon={false}
            activeBitmap={turboPreloader.isPageBitmapActive(item.indexA, currentPageIndex)}
            onSingleTap={handleTap}
          />
        </View>
      );
    },
    [windowWidth, windowHeight, isManga, cropWhiteBorders, theme, handleTap, scaleMode, currentPageIndex],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: windowWidth,
      offset: windowWidth * index,
      index,
    }),
    [windowWidth],
  );

  const themeColors = THEME_COLORS[theme];

  return (
    <View style={[styles.container, {backgroundColor: themeColors.background}]}>
      <FlatList
        ref={listRef}
        data={spreadGroups}
        renderItem={renderSpreadGroup}
        keyExtractor={item => item.id}
        extraData={currentPageIndex}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={activeGroupIndex}
        onScrollBeginDrag={() => {
          isUserScrolling.current = true;
        }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        windowSize={7}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        removeClippedSubviews={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
