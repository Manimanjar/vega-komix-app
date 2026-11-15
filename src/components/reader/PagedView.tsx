import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {ReaderImage} from './ReaderImage';
import {turboPreloader} from '../../lib/reader/turboPreloader';
import type {ImageScale, InteractionMode, ReaderPageItem, ReaderTheme, ReadingMode} from './types';
import {THEME_COLORS} from './types';

import type {PageTranslationResult} from '../../lib/translator/mangaTranslatorEngine';

interface PagedViewProps {
  pages: ReaderPageItem[];
  currentPageIndex: number;
  sliderJumpTarget?: {index: number; timestamp: number} | null;
  onPageChange: (index: number) => void;
  onToggleHUD: () => void;
  onDismissHUD?: () => void;
  onReachEnd?: () => void;
  readingMode: ReadingMode;
  scaleMode?: ImageScale;
  zoomScale?: number;
  reloadKey?: number;
  cropWhiteBorders?: boolean;
  theme?: ReaderTheme;
  interactionMode?: InteractionMode;
  translateEnabled?: boolean;
  pageTranslations?: Record<number, PageTranslationResult>;
  onRetryTranslation?: (pageIndex: number) => void;
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
  sliderJumpTarget,
  onPageChange,
  onToggleHUD,
  onDismissHUD,
  onReachEnd,
  readingMode,
  scaleMode = 'fit_width',
  zoomScale = 1.0,
  reloadKey = 0,
  cropWhiteBorders = false,
  theme = 'amoled',
  interactionMode = 'swipe',
  translateEnabled = false,
  pageTranslations,
  onRetryTranslation,
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const isManga = readingMode === 'manga';
  const isDoubleSpread = readingMode === 'double_spread' && isLandscape;

  const listRef = useRef<FlatList>(null);
  const isUserScrolling = useRef<boolean>(false);
  const isJumpingRef = useRef<boolean>(false);
  const jumpTimerRef = useRef<any>(null);
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

  const goToGroupIndex = useCallback(
    (targetIndex: number, animated = true) => {
      if (spreadGroups.length === 0) return;
      const clampedIndex = Math.min(Math.max(0, targetIndex), spreadGroups.length - 1);
      try {
        listRef.current?.scrollToIndex({ index: clampedIndex, animated });
      } catch {
        try {
          listRef.current?.scrollToOffset({ offset: clampedIndex * windowWidth, animated });
        } catch {}
      }
    },
    [spreadGroups.length, windowWidth],
  );

  const jumpToPage = useCallback(
    (targetPageIndex: number) => {
      if (spreadGroups.length === 0) return;
      const targetGroupIdx = spreadGroups.findIndex(
        g => g.indexA === targetPageIndex || g.indexB === targetPageIndex,
      );
      const clampedGroupIdx = Math.min(
        Math.max(0, targetGroupIdx !== -1 ? targetGroupIdx : targetPageIndex),
        spreadGroups.length - 1,
      );

      isJumpingRef.current = true;
      if (jumpTimerRef.current) {
        clearTimeout(jumpTimerRef.current);
      }
      jumpTimerRef.current = setTimeout(() => {
        isJumpingRef.current = false;
      }, 400);

      lastTargetIndex.current = clampedGroupIdx;
      goToGroupIndex(clampedGroupIdx, false);
    },
    [spreadGroups, goToGroupIndex],
  );

  // Jump when slider commit is received
  useEffect(() => {
    if (sliderJumpTarget) {
      jumpToPage(sliderJumpTarget.index);
    }
  }, [sliderJumpTarget, jumpToPage]);

  // Sync scroll position when activeGroupIndex updates externally
  useEffect(() => {
    if (
      !isUserScrolling.current &&
      !isJumpingRef.current &&
      Math.abs(activeGroupIndex - lastTargetIndex.current) > 0
    ) {
      lastTargetIndex.current = activeGroupIndex;
      goToGroupIndex(activeGroupIndex, false);
    }
  }, [activeGroupIndex, goToGroupIndex]);

  // Clean up jump timer on unmount
  useEffect(() => {
    return () => {
      if (jumpTimerRef.current) {
        clearTimeout(jumpTimerRef.current);
      }
    };
  }, []);

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isUserScrolling.current = false;
      if (isJumpingRef.current) return;
      const offsetX = e.nativeEvent.contentOffset.x;
      const rawIdx = Math.round(offsetX / windowWidth);
      const newGroupIdx = Math.min(Math.max(0, rawIdx), spreadGroups.length - 1);

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

  // Safe 3-Zone Edge Tap Handlers (executed on JS thread via Pressable)
  // In Manga (RTL): Left = Next page, Right = Prev page
  // In Comic / Double spread (LTR): Left = Prev page, Right = Next page
  const handleLeftTap = useCallback(() => {
    if (isManga) {
      if (activeGroupIndex < spreadGroups.length - 1) {
        goToGroupIndex(activeGroupIndex + 1, true);
      } else if (onReachEnd) {
        onReachEnd();
      }
    } else {
      if (activeGroupIndex > 0) {
        goToGroupIndex(activeGroupIndex - 1, true);
      }
    }
  }, [isManga, activeGroupIndex, spreadGroups.length, onReachEnd, goToGroupIndex]);

  const handleRightTap = useCallback(() => {
    if (isManga) {
      if (activeGroupIndex > 0) {
        goToGroupIndex(activeGroupIndex - 1, true);
      }
    } else {
      if (activeGroupIndex < spreadGroups.length - 1) {
        goToGroupIndex(activeGroupIndex + 1, true);
      } else if (onReachEnd) {
        onReachEnd();
      }
    }
  }, [isManga, activeGroupIndex, spreadGroups.length, onReachEnd, goToGroupIndex]);

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
              {width: windowWidth, height: windowHeight, flexDirection: 'row', backgroundColor: '#000000'},
            ]}>
            <View style={{width: windowWidth / 2, height: windowHeight}}>
              <ReaderImage
                imageUrl={leftPage.imageUrl}
                index={leftIndex}
                width={leftPage.width}
                height={leftPage.height}
                headers={leftPage.headers}
                scaleMode="fit_height"
                zoomScale={zoomScale}
                reloadKey={reloadKey}
                cropWhiteBorders={cropWhiteBorders}
                theme={theme}
                isWebtoon={false}
                activeBitmap={turboPreloader.isPageBitmapActive(leftIndex, currentPageIndex)}
                translateEnabled={translateEnabled}
                translationBubbles={pageTranslations?.[leftIndex]?.bubbles}
                onRetryTranslation={onRetryTranslation ? () => onRetryTranslation(leftIndex) : undefined}
                onSingleTap={onToggleHUD}
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
                zoomScale={zoomScale}
                reloadKey={reloadKey}
                cropWhiteBorders={cropWhiteBorders}
                theme={theme}
                isWebtoon={false}
                activeBitmap={turboPreloader.isPageBitmapActive(rightIndex, currentPageIndex)}
                translateEnabled={translateEnabled}
                translationBubbles={pageTranslations?.[rightIndex]?.bubbles}
                onRetryTranslation={onRetryTranslation ? () => onRetryTranslation(rightIndex) : undefined}
                onSingleTap={onToggleHUD}
              />
            </View>
          </View>
        );
      }

      // Single page view
      return (
        <View style={[styles.pageContainer, {width: windowWidth, height: windowHeight, backgroundColor: '#000000'}]}>
          <ReaderImage
            imageUrl={item.pageA.imageUrl}
            index={item.indexA}
            width={item.pageA.width}
            height={item.pageA.height}
            headers={item.pageA.headers}
            scaleMode={scaleMode}
            zoomScale={zoomScale}
            reloadKey={reloadKey}
            cropWhiteBorders={cropWhiteBorders}
            theme={theme}
            isWebtoon={false}
            activeBitmap={turboPreloader.isPageBitmapActive(item.indexA, currentPageIndex)}
            translateEnabled={translateEnabled}
            translationBubbles={pageTranslations?.[item.indexA]?.bubbles}
            onRetryTranslation={onRetryTranslation ? () => onRetryTranslation(item.indexA) : undefined}
            onSingleTap={onToggleHUD}
          />
        </View>
      );
    },
    [
      windowWidth,
      windowHeight,
      isManga,
      cropWhiteBorders,
      theme,
      scaleMode,
      zoomScale,
      reloadKey,
      currentPageIndex,
      translateEnabled,
      pageTranslations,
      onRetryTranslation,
      onToggleHUD,
    ],
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
    <View style={[styles.container, {backgroundColor: '#000000'}]}>
      <FlatList
        ref={listRef}
        data={spreadGroups}
        renderItem={renderSpreadGroup}
        keyExtractor={item => item.id}
        extraData={`${currentPageIndex}-${zoomScale}-${reloadKey}`}
        horizontal
        pagingEnabled
        inverted={isManga}
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={activeGroupIndex}
        onScrollToIndexFailed={(info: any) => {
          const offset =
            typeof info.offset === 'number'
              ? info.offset
              : Math.min(Math.max(0, info.index), spreadGroups.length - 1) * windowWidth;
          setTimeout(() => {
            try {
              listRef.current?.scrollToOffset({ offset, animated: false });
            } catch {}
          }, 50);
        }}
        onScrollBeginDrag={() => {
          isUserScrolling.current = true;
          onDismissHUD?.();
        }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        windowSize={7}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        removeClippedSubviews={true}
      />

      {/* Tap & HUD Toggle Overlay */}
      {interactionMode === 'one_tap' ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {/* Left Edge: 28% width */}
          <Pressable
            style={styles.leftTapZone}
            onPress={handleLeftTap}
          />

          {/* Center Zone: 44% width -> Toggle HUD */}
          <Pressable
            style={styles.centerTapZone}
            onPress={onToggleHUD}
          />

          {/* Right Edge: 28% width */}
          <Pressable
            style={styles.rightTapZone}
            onPress={handleRightTap}
          />
        </View>
      ) : (
        /* In SWIPE mode: Center 44% tap toggles HUD; edges are 100% free for natural swiping */
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Pressable
            style={styles.centerTapZone}
            onPress={onToggleHUD}
          />
        </View>
      )}
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
});
