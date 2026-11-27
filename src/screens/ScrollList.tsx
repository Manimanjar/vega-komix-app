import ScreenSafeArea from '../components/ui/ScreenSafeArea';
import { View, Pressable, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList, SearchStackParamList } from '../App';
import { Post } from '../lib/providers/types';
import { Image } from 'react-native';
import ComicThumbnail from '../components/ComicThumbnail';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import useContentStore from '../lib/zustand/contentStore';
import { settingsStorage } from '../lib/storage';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import SkeletonLoader from '../components/Skeleton';
import { providerManager } from '../lib/services/ProviderManager';
import { clusterPostsIntoSeriesRooms } from '../lib/aggregator/seriesRoomEngine';
import IconButton from '../components/ui/IconButton';
import AppText from '../components/ui/Text';
import { useM3Colors } from '../theme/M3PaletteContext';
import { parseAspectRatio } from '../components/MediaPosterCard';
import { isTV, useTVRemote } from '../lib/tv';
import { useTVFocusBorderColor } from '../lib/tv/useTVFocusBorderColor';
import {
  useSafeIsNavFocused,
  useTVNavFocusMemory,
} from '../lib/tv/useTVNavFocusMemory';

type Props = NativeStackScreenProps<HomeStackParamList, 'ScrollList'>;

type ListItem = Post | { id: string; isSkeleton: true };

const GRID_POSTER_WIDTH = 100;
const GRID_POSTER_HEIGHT = 150;
const LIST_POSTER_WIDTH = 70;
const LIST_POSTER_HEIGHT = 100;
// Screen container uses p-4 and each grid cell uses m-3 on both sides.
const GRID_SCREEN_PADDING = 16;
const GRID_ITEM_MARGIN = 12;
const GRID_POSTER_ASPECT_RATIO = GRID_POSTER_HEIGHT / GRID_POSTER_WIDTH;

// Sort modes for the category sort chips (user, 2026-11-18): rating and
// views, each high-to-low and low-to-high. Sorting is client-side over
// the posts loaded so far and re-applies as more pages arrive.
type SortMode =
  | 'default'
  | 'rating-desc'
  | 'rating-asc'
  | 'views-desc'
  | 'views-asc';

function numericRating(post: Post): number | undefined {
  const r = (post as any)?.rating;
  const n = typeof r === 'number' ? r : parseFloat(String(r ?? ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function numericViews(post: Post): number | undefined {
  const v = (post as any)?.views;
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Posts with no rating/views are "unknown" and always sort last, in
// both directions, so the top of the list is never an unrated item.
function compareSort(a: Post, b: Post, mode: SortMode): number {
  if (mode === 'rating-desc' || mode === 'rating-asc') {
    const ra = numericRating(a);
    const rb = numericRating(b);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return mode === 'rating-desc' ? rb - ra : ra - rb;
  }
  if (mode === 'views-desc' || mode === 'views-asc') {
    const va = numericViews(a);
    const vb = numericViews(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return mode === 'views-desc' ? vb - va : va - vb;
  }
  return 0;
}

const ScrollListCard = memo(({
  item,
  viewType,
  gridPosterWidth,
  dominantRatio,
  hasTVPreferredFocus,
  onPress,
  onTVFocus,
}: {
  item: Post;
  viewType: number;
  gridPosterWidth: number;
  dominantRatio: number;
  hasTVPreferredFocus: boolean;
  onPress: () => void;
  onTVFocus?: () => void;
}) => {
  const colors = useM3Colors();
  const focusBorderColor = useTVFocusBorderColor();
  const [isFocused, setIsFocused] = useState(false);
  const pressableRef = useRef<View>(null);
  const isNavFocused = useSafeIsNavFocused();
  const {
    preferredFocus,
    onFocus: rememberFocus,
    onBlur: forgetFocus,
  } = useTVNavFocusMemory({
    ref: pressableRef,
    isNavFocused,
    hasTVPreferredFocus,
  });

  const lastPressTime = useRef<number>(0);
  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastPressTime.current < 300) return;
    lastPressTime.current = now;
    onPress();
  }, [onPress]);

  useTVRemote(
    evt => {
      if (
        isFocused &&
        (evt.eventType === 'select' || evt.eventType === 'playPause') &&
        (evt.eventKeyAction === undefined || evt.eventKeyAction === 1)
      ) {
        handlePress();
      }
    },
    isTV && isFocused,
  );

  const itemRatio = parseAspectRatio(item.aspectRatio, dominantRatio);
  const cardHeight = Math.round(gridPosterWidth / itemRatio);
  const activeBorderRadius =
    typeof item.borderRadius === 'number' && item.borderRadius >= 0
      ? item.borderRadius
      : 10;
  const rawTag =
    item.cornerTag ??
    item.tag ??
    (item as any).badge ??
    (item as any).rating;
  const activeTag = rawTag != null ? String(rawTag).trim() : '';
  // Total chapter count for the thumbnail watermark (user, 2026-11-18).
  // Shown as a small pill at the bottom-left of the cover so it never
  // clashes with the tag at the top-right.
  const chapterCount =
    typeof (item as any).chapterCount === 'number' &&
    (item as any).chapterCount > 0
      ? (item as any).chapterCount
      : undefined;

  const listWidth = itemRatio > 1.2 ? 110 : LIST_POSTER_WIDTH;
  const listHeight = Math.round(listWidth / itemRatio);

  return (
    <Pressable
      ref={pressableRef}
      focusable={true}
      isTVSelectable={true}
      hasTVPreferredFocus={preferredFocus}
      onFocus={() => {
        setIsFocused(true);
        rememberFocus();
        onTVFocus?.();
      }}
      onBlur={() => {
        setIsFocused(false);
        forgetFocus();
      }}
      onPress={handlePress}
      style={{
        zIndex: isFocused ? 999 : 1,
        transform: [{scale: isFocused ? 1.05 : 1}],
      }}
      className={
        viewType === 1
          ? 'flex flex-col m-3 items-center'
          : 'flex-row m-3 items-center'
      }>
      <View
        style={{
          position: 'relative',
          width: viewType === 1 ? gridPosterWidth : listWidth,
          height: viewType === 1 ? cardHeight : listHeight,
          borderRadius: activeBorderRadius,
          overflow: 'hidden',
          backgroundColor: colors.surfaceContainerHigh,
          // Fixed width so focus does not shrink the poster.
          borderWidth: isTV ? 3 : 1,
          borderColor: isFocused ? focusBorderColor : 'rgba(255, 255, 255, 0.08)',
        }}>
        <ComicThumbnail
          source={item.image || (item as any).poster || (item as any).cover}
          image={item.image}
          poster={(item as any).poster}
          cover={(item as any).cover}
          borderRadius={activeBorderRadius}
          altTitle={item.title}
          contentFit="cover"
          width="100%"
          height="100%"
          comicLink={item.link}
        />
        {activeTag.length > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: 5,
              right: 5,
              borderRadius: 5,
              overflow: 'hidden',
              zIndex: 10,
              elevation: 6,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.35,
              shadowRadius: 4,
            }}>
            <BlurView
              intensity={45}
              tint="systemMaterialDark"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.20)',
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}>
              <AppText
                role="labelSmallEmphasized"
                style={{
                  color: '#FFFFFF',
                  fontWeight: '800',
                  fontSize: 9.5,
                  letterSpacing: 0.5,
                  textShadowColor: 'rgba(0, 0, 0, 0.85)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 3,
                }}>
                {activeTag.toUpperCase()}
              </AppText>
            </BlurView>
          </View>
        ) : null}
        {chapterCount != null ? (
          <View
            style={{
              position: 'absolute',
              bottom: 5,
              left: 5,
              borderRadius: 5,
              overflow: 'hidden',
              zIndex: 10,
              elevation: 6,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.35,
              shadowRadius: 4,
            }}>
            <View
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.20)',
                paddingHorizontal: 6,
                paddingVertical: 2,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
              }}>
              <MaterialCommunityIcons
                name="book-open-page-variant"
                size={10}
                color="#FFFFFF"
              />
              <AppText
                role="labelSmallEmphasized"
                style={{
                  color: '#FFFFFF',
                  fontWeight: '800',
                  fontSize: 9.5,
                  letterSpacing: 0.5,
                  textShadowColor: 'rgba(0, 0, 0, 0.85)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 3,
                }}>
                {chapterCount === 1 ? '1 Ch' : `${chapterCount} Ch`}
              </AppText>
            </View>
          </View>
        ) : null}
      </View>
      <AppText
        role={viewType === 1 ? 'bodySmall' : 'bodyLargeEmphasized'}
        numberOfLines={2}
        style={
          viewType === 1
            ? { width: gridPosterWidth, marginTop: 6 }
            : undefined
        }
        className={
          viewType === 1
            ? `text-center ${isFocused ? 'text-white font-bold' : 'text-m3-on-surface'}`
            : `ml-3.5 flex-1 ${isFocused ? 'text-white font-bold' : 'text-m3-on-surface'}`
        }>
        {item.title}
      </AppText>
    </Pressable>
  );
});

const ScrollList = ({ route }: Props): React.ReactElement => {
  const colors = useM3Colors();
  const { width: windowWidth } = useWindowDimensions();
  const navigation =
    useNavigation<NativeStackNavigationProp<SearchStackParamList>>();
  const [posts, setPosts] = useState<Post[]>([]);
  const { filter, providerValue } = route.params;
  const [page, setPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEnd, setIsEnd] = useState<boolean>(false);
  // Sort mode for the category sort chips (user, 2026-11-18). 'default'
  // is the site's own order. Reset when the category/search changes.
  const [sort, setSort] = useState<SortMode>('default');
  const provider = useContentStore(state => state.provider);
  const [viewType, setViewType] = useState<number>(
    settingsStorage.getListViewType(),
  );
  // FlashList recycles cells, so "index === 0" turns true again whenever a
  // cell is reused for the first item. Only claim focus until a card has it.
  const [initialCardFocused, setInitialCardFocused] = useState(false);
  const markInitialCardFocused = useCallback(
    () => setInitialCardFocused(true),
    [],
  );

  // Compute dominant aspect ratio from posts to size grid columns appropriately
  const dominantRatio = useMemo(() => {
    const postWithRatio = posts.find(p => p && p.aspectRatio != null);
    return postWithRatio
      ? parseAspectRatio(postWithRatio.aspectRatio, 2 / 3)
      : 2 / 3;
  }, [posts]);

  // Derive the grid from the available width and aspect ratio
  const gridAvailableWidth = windowWidth - GRID_SCREEN_PADDING * 2;
  const isLandscapeCatalog = dominantRatio > 1.2;
  const targetPosterWidth = isLandscapeCatalog ? 160 : GRID_POSTER_WIDTH;
  const minColumns = isLandscapeCatalog
    ? (windowWidth < 360 ? 1 : 2)
    : (windowWidth < 350 ? 2 : 3);
  const gridColumns = Math.max(
    minColumns,
    Math.floor(
      gridAvailableWidth / (targetPosterWidth + GRID_ITEM_MARGIN * 2),
    ),
  );
  const gridPosterWidth =
    Math.floor(gridAvailableWidth / gridColumns) - GRID_ITEM_MARGIN * 2;
  const numColumns = viewType === 1 ? gridColumns : 1;

  const isSearch = Boolean(route.params?.isSearch);
  const activeProviderValue = providerValue || provider?.value || '';

  // Reset the sort when the category or search changes so a previous
  // category's sort does not leak into the new list.
  useEffect(() => {
    setSort('default');
  }, [filter, activeProviderValue, isSearch]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchPosts = async () => {
      if (isEnd) return;

      if (!activeProviderValue) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      // Promise chain instead of try/catch/finally: React Compiler skips any
      // component with a finally clause or conditionals inside a try block.
      const getNewPosts = isSearch
        ? providerManager.getSearchPosts({
            searchQuery: filter,
            page,
            providerValue: activeProviderValue,
            signal,
          })
        : providerManager.getPosts({
            filter,
            page,
            providerValue: activeProviderValue,
            signal,
          });

      await getNewPosts
        .then(newPosts => {
          if (cancelled || signal.aborted) return;

          if (!newPosts || newPosts.length === 0) {
            setIsEnd(true);
            return;
          }

          const clustered = clusterPostsIntoSeriesRooms(newPosts);
          setPosts(prev => (page === 1 ? clustered : clusterPostsIntoSeriesRooms([...prev, ...clustered])));
        })
        .catch(error => {
          if (cancelled || signal.aborted || (error as any)?.name === 'AbortError') return;
          console.error('Error fetching posts:', error);
          setIsEnd(true);
        });

      if (!cancelled) {
        setIsLoading(false);
      }
    };

    fetchPosts();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [page, filter, activeProviderValue, isSearch]);

  const onEndReached = async () => {
    // Don't trigger more loading if we're already loading, at the end, or initial posts haven't arrived
    if (isLoading || isEnd || posts.length === 0) {
      return;
    }
    setPage(prevPage => prevPage + 1);
  };

  const skeletons: ListItem[] = Array.from({
    length: viewType === 1 ? gridColumns * 3 : 6,
  }).map((_, i) => ({ id: `skeleton-${i}`, isSkeleton: true }));

  // Sorted view of the loaded posts. The sort re-applies whenever more
  // pages arrive, so scrolling keeps the chosen order. Only offer the
  // chips when at least one loaded post actually has a rating or views
  // — a provider whose site shows neither has nothing to sort by.
  const sortedPosts = useMemo(() => {
    if (sort === 'default') return posts;
    return [...posts].sort((a, b) => compareSort(a, b, sort));
  }, [posts, sort]);

  const hasSortableData = useMemo(
    () =>
      posts.some(
        post => numericRating(post) != null || numericViews(post) != null,
      ),
    [posts],
  );

  const listData: ListItem[] =
    posts.length === 0 && isLoading ? skeletons : sortedPosts;

  const renderSkeletonItem = () => {
    const defaultSkeletonHeight = Math.round(gridPosterWidth / dominantRatio);
    const listSkeletonWidth = dominantRatio > 1.2 ? 110 : LIST_POSTER_WIDTH;
    const listSkeletonHeight = Math.round(listSkeletonWidth / dominantRatio);

    return (
      <View
        className={
          viewType === 1
            ? 'flex flex-col m-3 items-center'
            : 'flex-row m-3 items-center'
        }>
        <SkeletonLoader
          height={viewType === 1 ? defaultSkeletonHeight : listSkeletonHeight}
          width={viewType === 1 ? gridPosterWidth : listSkeletonWidth}
          marginVertical={0}
        />
        <SkeletonLoader
          height={viewType === 1 ? 12 : 18}
          width={viewType === 1 ? gridPosterWidth : '65%'}
          marginVertical={viewType === 1 ? 8 : 0}
          style={viewType === 1 ? undefined : { marginLeft: 12 }}
        />
      </View>
    );
  };

  // The footer sits outside the grid, so it is not laid out into columns.
  // Render a full row of placeholders instead of a single stray one.
  const renderLoadingMoreSkeletons = () => (
    <View className={viewType === 1 ? 'flex-row flex-wrap' : ''}>
      {Array.from({ length: viewType === 1 ? gridColumns : 2 }).map((_, i) => (
        <View key={`footer-skeleton-${i}`}>{renderSkeletonItem()}</View>
      ))}
    </View>
  );

  return (
    <ScreenSafeArea className="h-full w-full bg-m3-background p-4">
      <View className="w-full px-4 font-semibold my-6 flex-row justify-between items-center">
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1}}>
          <IconButton
            icon="arrow-left"
            label="Back"
            onPress={() => navigation.goBack()}
          />
          <AppText
            role="headlineLargeEmphasized"
            numberOfLines={1}
            className="flex-1 text-m3-on-background">
            {route.params.title}
          </AppText>
        </View>
        <IconButton
          icon={viewType === 1 ? 'view-grid-outline' : 'view-list-outline'}
          label={viewType === 1 ? 'Switch to list view' : 'Switch to grid view'}
          onPress={() => {
            const newViewType = viewType === 1 ? 2 : 1;
            setViewType(newViewType);
            settingsStorage.setListViewType(newViewType);
          }}
        />
      </View>
      {/* Sort chips (user, 2026-11-18): Rating and Views, each in both
          orders. Tapping the active chip again returns to the site's
          own order. Only shown when the loaded posts have rating or
          views data to sort by. */}
      {hasSortableData ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            paddingHorizontal: 4,
            paddingBottom: 12,
          }}>
          {(
            [
              { mode: 'rating-desc', label: 'Rating: High to Low' },
              { mode: 'rating-asc', label: 'Rating: Low to High' },
              { mode: 'views-desc', label: 'Views: High to Low' },
              { mode: 'views-asc', label: 'Views: Low to High' },
            ] as const
          ).map(chip => {
            const active = sort === chip.mode;
            return (
              <Pressable
                key={chip.mode}
                onPress={() =>
                  setSort(active ? 'default' : (chip.mode as SortMode))
                }
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Sort by ${chip.label}`}
                style={{
                  backgroundColor: active
                    ? colors.primaryContainer
                    : colors.surfaceContainerHigh,
                  borderColor: active
                    ? colors.primary
                    : colors.outlineVariant,
                  borderWidth: 1,
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}>
                <AppText
                  role="labelSmallEmphasized"
                  style={{
                    color: active
                      ? colors.onPrimaryContainer
                      : colors.onSurface,
                    fontWeight: active ? '800' : '600',
                    fontSize: 12,
                  }}>
                  {chip.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View className="flex-1 w-full">
        <FlashList
          ListFooterComponent={
            <View className={posts.length > 0 && isLoading ? 'mb-16' : ''}>
              {posts.length > 0 && isLoading
                ? renderLoadingMoreSkeletons()
                : null}
              <View className="h-32" />
            </View>
          }
          data={listData}
          numColumns={numColumns}
          key={`view-type-${viewType}-${numColumns}-${Math.round(dominantRatio * 100)}`}
          contentContainerStyle={{ paddingBottom: 80 }}
          keyExtractor={(item, i) =>
            'isSkeleton' in item ? item.id : `${item.title}-${i}`
          }
          renderItem={({ item, index }) => {
            if ('isSkeleton' in item) {
              return renderSkeletonItem();
            }

            return (
              <ScrollListCard
                item={item}
                viewType={viewType}
                gridPosterWidth={gridPosterWidth}
                dominantRatio={dominantRatio}
                hasTVPreferredFocus={isTV && index === 0 && !initialCardFocused}
                onTVFocus={initialCardFocused ? undefined : markInitialCardFocused}
                onPress={() =>
                  navigation.navigate('Info', {
                    link: item.link,
                    provider: route.params.providerValue || provider.value,
                    poster: item?.image,
                  })
                }
              />
            );
          }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
        />
        {!isLoading && posts.length === 0 ? (
          <View className="w-full h-full flex items-center justify-center">
            <AppText
              role="titleLargeEmphasized"
              className="text-center text-m3-on-surface-variant">
              No Content Found
            </AppText>
          </View>
        ) : null}
      </View>
    </ScreenSafeArea>
  );
};

export default ScrollList;
