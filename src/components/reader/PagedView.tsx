import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {ReaderImage} from './ReaderImage';
import {turboPreloader} from '../../lib/reader/turboPreloader';
import type {ImageScale, InteractionMode, ReaderPageItem, ReaderTheme, ReadingMode} from './types';
import {THEME_COLORS} from './types';
import {EndOfChapterCard} from './EndOfChapterCard';

import type {PageTranslationResult} from '../../lib/translator/mangaTranslatorEngine';

interface PagedViewProps {
  pages: ReaderPageItem[];
  currentPageIndex: number;
  sliderJumpTarget?: {index: number; timestamp: number} | null;
  onPageChange: (index: number) => void;
  onToggleHUD: () => void;
  onDismissHUD?: () => void;
  onPageLoaded?: (index: number) => void;
  onReachEnd?: () => void;
  hasNextChapter?: boolean;
  nextChapterTitle?: string;
  onNextChapter?: () => void;
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
  splitDoubleSpreads?: boolean;
  highQualityRendering?: boolean;
  onZoomChange?: (newScale: number) => void;
}

interface SpreadPageGroup {
  id: string;
  isPair: boolean;
  pageA?: ReaderPageItem;
  pageB?: ReaderPageItem;
  indexA: number;
  indexB?: number;
  isSplit?: boolean;
  splitHalf?: 'left' | 'right';
  isEndOfChapter?: boolean;
}

export const PagedView: React.FC<PagedViewProps> = ({
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
  splitDoubleSpreads = true,
  highQualityRendering = true,
  onZoomChange,
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const isManga = readingMode === 'manga';
  const isDoubleSpread = readingMode === 'double_spread' && isLandscape;
  const themeColors = THEME_COLORS[theme];

  const [measuredRatios, setMeasuredRatios] = useState<Record<number, number>>({});
  const handleRatioMeasured = useCallback((idx: number, ratio: number) => {
    setMeasuredRatios(prev => {
      if (prev[idx] === ratio) return prev;
      return {...prev, [idx]: ratio};
    });
  }, []);

  const listRef = useRef<FlatList>(null);
  const isUserScrolling = useRef<boolean>(false);
  const isJumpingRef = useRef<boolean>(false);
  const jumpTimerRef = useRef<any>(null);
  const lastTargetIndex = useRef<number>(currentPageIndex);
  // Rotation guard: re-anchor to the same page when the window size changes.
  // Without this, the scroll offset stays at the old pixel value while every
  // page is now a different width — the image vanishes and the next swipe
  // lands on a far-away page. Skipped on first mount (nothing to preserve).
  const prevDimsRef = useRef<{width: number; height: number} | null>(null);

  // Group pages into double spreads when in landscape double_spread mode,
  // or split wide double-spread scans into two portrait pages in portrait mode.
  const spreadGroups: SpreadPageGroup[] = useMemo(() => {
    if (!isDoubleSpread) {
      const groups: SpreadPageGroup[] = [];
      pages.forEach((page, idx) => {
        const ratio =
          measuredRatios[idx] ||
          (page.width && page.height && page.height > 0
            ? page.width / page.height
            : undefined);
        const isWide = ratio ? ratio > 1.2 : false;

        if (isWide && splitDoubleSpreads && !isLandscape) {
          // Double-spread landscape image in portrait mode:
          // Split into two portrait pages.
          // In traditional Manga (RTL), right half is read first, then left half.
          // In Western Comic (LTR), left half is read first, then right half.
          const firstHalf = isManga ? 'right' : 'left';
          const secondHalf = isManga ? 'left' : 'right';

          groups.push({
            id: `split-${idx}-${firstHalf}`,
            isPair: false,
            pageA: page,
            indexA: idx,
            isSplit: true,
            splitHalf: firstHalf,
          });
          groups.push({
            id: `split-${idx}-${secondHalf}`,
            isPair: false,
            pageA: page,
            indexA: idx,
            isSplit: true,
            splitHalf: secondHalf,
          });
        } else {
          groups.push({
            id: `single-${idx}`,
            isPair: false,
            pageA: page,
            indexA: idx,
          });
        }
      });
      // The end-of-chapter card exists only when there IS a next chapter
      // (its "Read Next Chapter" button). When there is none, no card is
      // appended at all — the old "You've caught up!" card flashed into view
      // on every far slider jump and served no navigation purpose.
      if (pages.length > 0 && hasNextChapter) {
        groups.push({
          id: 'spread-end-of-chapter',
          isPair: false,
          indexA: pages.length - 1,
          isEndOfChapter: true,
        });
      }
      return groups;
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
    if (pages.length > 0 && hasNextChapter) {
      groups.push({
        id: 'spread-end-of-chapter',
        isPair: false,
        indexA: pages.length - 1,
        isEndOfChapter: true,
      });
    }
    return groups;
  }, [pages, isDoubleSpread, splitDoubleSpreads, isLandscape, isManga, measuredRatios, hasNextChapter]);

  // Find the group index matching currentPageIndex
  const activeGroupIndex = useMemo(() => {
    const idx = spreadGroups.findIndex(
      g =>
        !g.isEndOfChapter &&
        (g.indexA === currentPageIndex || g.indexB === currentPageIndex),
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
        g =>
          !g.isEndOfChapter &&
          (g.indexA === targetPageIndex || g.indexB === targetPageIndex),
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

  // Stay on the SAME page across an orientation change. The window size
  // change regroups spreads (pairs become singles and back) and resizes every
  // page, so the old pixel offset points at a wrong / empty page. Re-anchor
  // to the group that holds the current page, without animation, once the
  // new layout has settled. The jump lock keeps the momentum handler from
  // fighting it.
  const goToGroupIndexRef = useRef(goToGroupIndex);
  goToGroupIndexRef.current = goToGroupIndex;

  useEffect(() => {
    const prev = prevDimsRef.current;
    prevDimsRef.current = {width: windowWidth, height: windowHeight};
    if (!prev) return;
    if (prev.width === windowWidth && prev.height === windowHeight) return;
    isJumpingRef.current = true;
    if (jumpTimerRef.current) {
      clearTimeout(jumpTimerRef.current);
    }
    jumpTimerRef.current = setTimeout(() => {
      isJumpingRef.current = false;
    }, 400);
    const targetGroup = activeGroupIndex;
    const timer = setTimeout(() => {
      lastTargetIndex.current = targetGroup;
      goToGroupIndexRef.current(targetGroup, false);
    }, 80);
    return () => clearTimeout(timer);
  }, [windowWidth, windowHeight, activeGroupIndex]);

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
        if (!group.isEndOfChapter) {
          onPageChange(group.indexA);
        }

        if (newGroupIdx === spreadGroups.length - 1 && onReachEnd) {
          onReachEnd();
        }
      }
    },
    [windowWidth, spreadGroups, onPageChange, onReachEnd],
  );

  // Safe 3-Zone Edge Tap Handlers (executed on JS thread via Pressable)
  // Same in BOTH paged modes, matching the swipe: Left edge = previous
  // page, Right edge = next page (or next chapter at the end). Manga used
  // to mirror this (Left = next) because its list was inverted; the list
  // is no longer inverted, so the taps follow the swipe, not the mode.
  const handleLeftTap = useCallback(() => {
    if (activeGroupIndex > 0) {
      goToGroupIndex(activeGroupIndex - 1, true);
    }
  }, [activeGroupIndex, goToGroupIndex]);

  const handleRightTap = useCallback(() => {
    if (activeGroupIndex < spreadGroups.length - 1) {
      goToGroupIndex(activeGroupIndex + 1, true);
    } else if (onNextChapter && hasNextChapter) {
      onNextChapter();
    } else if (onReachEnd) {
      onReachEnd();
    }
  }, [activeGroupIndex, spreadGroups.length, onReachEnd, onNextChapter, hasNextChapter, goToGroupIndex]);

  const renderSpreadGroup = useCallback(
    ({item}: {item: SpreadPageGroup}) => {
      const handleImageSingleTap = (tapX: number) => {
        if (interactionMode === 'one_tap') {
          const leftB = windowWidth * 0.28;
          const rightB = windowWidth * 0.72;
          if (tapX >= leftB && tapX <= rightB) {
            onToggleHUD?.();
          } else if (tapX < leftB) {
            handleLeftTap();
          } else {
            handleRightTap();
          }
        } else {
          // In swipe mode: center 44% toggles HUD; edges do not block
          const leftB = windowWidth * 0.28;
          const rightB = windowWidth * 0.72;
          if (tapX >= leftB && tapX <= rightB) {
            onToggleHUD?.();
          }
        }
      };

      if (item.isEndOfChapter) {
        return (
          <View
            style={[
              styles.pageContainer,
              {
                width: windowWidth,
                height: windowHeight,
                backgroundColor: themeColors.background,
                justifyContent: 'center',
                alignItems: 'center',
              },
            ]}>
            <EndOfChapterCard
              hasNextChapter={!!hasNextChapter}
              nextChapterTitle={nextChapterTitle}
              onNextChapter={onNextChapter}
              theme={theme}
              isPaged={true}
            />
          </View>
        );
      }

      if (item.isPair && item.pageA && item.pageB) {
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
              {width: windowWidth, height: windowHeight, flexDirection: 'row', backgroundColor: themeColors.background, overflow: 'hidden'},
            ]}>
            <View style={{width: windowWidth / 2, height: windowHeight, overflow: 'hidden'}}>
              <ReaderImage
                imageUrl={leftPage.imageUrl}
                index={leftIndex}
                width={leftPage.width}
                height={leftPage.height}
                headers={leftPage.headers}
                scaleMode={scaleMode}
                maxWidth={windowWidth / 2}
                zoomScale={zoomScale}
                reloadKey={reloadKey}
                cropWhiteBorders={cropWhiteBorders}
                theme={theme}
                isWebtoon={false}
                activeBitmap={turboPreloader.isPageBitmapActive(leftIndex, currentPageIndex)}
                translateEnabled={translateEnabled}
                translationBubbles={pageTranslations?.[leftIndex]?.bubbles}
                onRetryTranslation={onRetryTranslation ? () => onRetryTranslation(leftIndex) : undefined}
                onPageLoaded={onPageLoaded}
                highQualityRendering={highQualityRendering}
                onSingleTap={handleImageSingleTap}
                onZoomChange={onZoomChange}
                onSwipeNextPage={handleRightTap}
                onSwipePrevPage={handleLeftTap}
              />
            </View>
            <View style={{width: windowWidth / 2, height: windowHeight, overflow: 'hidden'}}>
              <ReaderImage
                imageUrl={rightPage.imageUrl}
                index={rightIndex}
                width={rightPage.width}
                height={rightPage.height}
                headers={rightPage.headers}
                scaleMode={scaleMode}
                maxWidth={windowWidth / 2}
                zoomScale={zoomScale}
                reloadKey={reloadKey}
                cropWhiteBorders={cropWhiteBorders}
                theme={theme}
                isWebtoon={false}
                activeBitmap={turboPreloader.isPageBitmapActive(rightIndex, currentPageIndex)}
                translateEnabled={translateEnabled}
                translationBubbles={pageTranslations?.[rightIndex]?.bubbles}
                onRetryTranslation={onRetryTranslation ? () => onRetryTranslation(rightIndex) : undefined}
                onPageLoaded={onPageLoaded}
                highQualityRendering={highQualityRendering}
                onSingleTap={tapX => handleImageSingleTap(tapX + windowWidth / 2)}
                onZoomChange={onZoomChange}
                onSwipeNextPage={handleRightTap}
                onSwipePrevPage={handleLeftTap}
              />
            </View>
          </View>
        );
      }

      if (item.isSplit && item.pageA) {
        const isFirstHalf = item.splitHalf === (isManga ? 'right' : 'left');
        return (
          <View
            style={[
              styles.pageContainer,
              {
                width: windowWidth,
                height: windowHeight,
                backgroundColor: themeColors.background,
                overflow: 'hidden',
              },
            ]}>
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: windowWidth * 2,
                height: windowHeight,
                ...(item.splitHalf === 'left' ? {left: 0} : {right: 0}),
              }}>
              {/* Split halves keep fit_height on purpose: the image is
                  double-wide and the visible half must fill the viewport
                  height exactly; any other fit mode would misalign the half. */}
              <ReaderImage
                imageUrl={item.pageA.imageUrl}
                index={item.indexA}
                width={windowWidth * 2}
                height={windowHeight}
                headers={item.pageA.headers}
                scaleMode="fit_height"
                zoomScale={zoomScale}
                reloadKey={reloadKey}
                cropWhiteBorders={cropWhiteBorders}
                theme={theme}
                isWebtoon={false}
                activeBitmap={turboPreloader.isPageBitmapActive(item.indexA, currentPageIndex)}
                translateEnabled={translateEnabled}
                translationBubbles={pageTranslations?.[item.indexA]?.bubbles}
                onRetryTranslation={onRetryTranslation ? () => onRetryTranslation(item.indexA) : undefined}
                onRatioMeasured={ratio => handleRatioMeasured(item.indexA, ratio)}
                onPageLoaded={onPageLoaded}
                highQualityRendering={highQualityRendering}
                onSingleTap={handleImageSingleTap}
                onZoomChange={onZoomChange}
                onSwipeNextPage={handleRightTap}
                onSwipePrevPage={handleLeftTap}
              />
            </View>

            {/* Subtle split indicator pill in bottom corner */}
            <View style={styles.splitBadge} pointerEvents="none">
              <Text style={styles.splitBadgeText}>
                {isFirstHalf ? 'Spread 1/2' : 'Spread 2/2'}
              </Text>
            </View>
          </View>
        );
      }

      // Single page view
      if (!item.pageA) return null;
      return (
        <View style={[styles.pageContainer, {width: windowWidth, height: windowHeight, backgroundColor: themeColors.background, overflow: 'hidden'}]}>
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
            onRatioMeasured={ratio => handleRatioMeasured(item.indexA, ratio)}
            onPageLoaded={onPageLoaded}
            highQualityRendering={highQualityRendering}
            onSingleTap={handleImageSingleTap}
            onZoomChange={onZoomChange}
            onSwipeNextPage={handleRightTap}
            onSwipePrevPage={handleLeftTap}
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
      onPageLoaded,
      handleRatioMeasured,
      highQualityRendering,
      interactionMode,
      handleLeftTap,
      handleRightTap,
      onZoomChange,
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

  return (
    <View style={[styles.container, {backgroundColor: themeColors.background}]}>
      <FlatList
        ref={listRef}
        data={spreadGroups}
        renderItem={renderSpreadGroup}
        keyExtractor={item => item.id}
        extraData={`${activeGroupIndex}-${zoomScale}-${reloadKey}-${highQualityRendering}`}
        horizontal
        // Snap instead of pagingEnabled: the snap interval is identical in
        // both directions, so a swipe feels equally fast and smooth whether
        // turning forward or back.
        // The list is never inverted: in BOTH paged modes (Comic and Manga)
        // the next page is a swipe right-to-left, from page 1 onward — the
        // user's habit. Manga keeps its own reading order inside spreads
        // (right page first, right half first), but the page-turn gesture
        // is the same as Comic.
        snapToInterval={windowWidth}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        style={{backgroundColor: themeColors.background}}
        contentContainerStyle={{backgroundColor: themeColors.background}}
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
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        removeClippedSubviews={true}
      />

      {/* Tap & HUD Toggle Overlay: rendered only in one_tap mode; swipe mode delegates single-tap to ReaderImage so pinch/zoom are 100% unrestricted */}
      {interactionMode === 'one_tap' && (
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
    overflow: 'hidden',
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
  splitBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
  },
  splitBadgeText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '700',
  },
});
