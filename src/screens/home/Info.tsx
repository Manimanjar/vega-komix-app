import {useFocusEffect, useIsFocused, useNavigation} from '@react-navigation/native';
import {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {StatusBar} from 'expo-status-bar';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  FlatList,
  Linking,
  RefreshControl,
  ToastAndroid,
  View,
  findNodeHandle,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {HomeStackParamList, RootStackParamList, TabStackParamList} from '../../App';
import {isSafeExternalUrl} from '../../lib/sandbox/urlGuard';
import Button from '../../components/ui/Button';
import AppText from '../../components/ui/Text';
import {QueryErrorBoundary} from '../../components/ErrorBoundary';
import ChapterList from '../../components/ChapterList';
import {instantChapterLauncher} from '../../lib/reader/instantChapterLauncher';
import ScreenOverlayHost from '../../components/ScreenOverlayHost';
import LocalEpisodeList from '../../components/local-content/LocalEpisodeList';
import SkeletonLoader from '../../components/Skeleton';
import {useContentDetails} from '../../lib/hooks/useContentInfo';
import {useArtworkShape} from '../../lib/hooks/useHomePageData';
import {useInfoAccent} from '../../lib/hooks/useInfoAccent';
import type {ChapterLink, EpisodeLink} from '../../lib/providers/types';
import {
  chapterUpdateTracker,
  settingsStorage,
  watchListStorage,
} from '../../lib/storage';
import useContentStore from '../../lib/zustand/contentStore';
import useWatchListStore from '../../lib/zustand/watchListStore';
import useContinueWatchingStore from '../../lib/zustand/continueWatchingStore';
import {M3PaletteContext, useM3Colors} from '../../theme/M3PaletteContext';
import type {MaterialColors} from '../../theme/colors';
import {buildDetailPalette} from '../../theme/detailPalette';
import ContentOverview from './components/ContentOverview';
import {useTranslatedTitle} from '../../lib/translator/useTranslatedTitle';
import LibraryCollectionDialog from '../../components/library/LibraryCollectionDialog';
import ProviderMetadataDialog from '../../components/metadata/ProviderMetadataDialog';
import LocalMetadataDialog from '../../components/metadata/LocalMetadataDialog';
import InfoSkeleton from './components/InfoSkeleton';
import StatusBarScrim from '../../components/ui/StatusBarScrim';
import {TVFocusGuide} from '../../components/tv';
import {isTV} from '../../lib/tv';
import useTVNavigationStore from '../../lib/zustand/tvNavigationStore';
import CrashGuardBoundary from '../../components/CrashGuardBoundary';

type Props = NativeStackScreenProps<HomeStackParamList, 'Info'>;

function InfoContent({route, navigation}: Props): React.JSX.Element {
  const colors = useM3Colors();
  const searchNavigation =
    useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const provider = useContentStore(state => state.provider);
  const installedProviders = useContentStore(state => state.installedProviders);
  const setItemCollections = useWatchListStore(
    state => state.setItemCollections,
  );
  const removeItem = useWatchListStore(state => state.removeItem);
  // Id of the only category, or undefined when there are none or several.
  const onlyCollectionId = useWatchListStore(state =>
    state.collections.length === 1 ? state.collections[0].id : undefined,
  );
  const providerValue = route.params.provider || provider.value;
  const {
    info,
    meta,
    isLoading,
    isMetaLoading,
    isSynopsisLoading,
    error,
    refetch,
    localTitle,
  } = useContentDetails(route.params.link, providerValue);
  const remoteInLibrary = useWatchListStore(state =>
    state.watchList.some(item => item.link === route.params.link),
  );
  const inLibrary = localTitle ? localTitle.inLibrary !== false : remoteInLibrary;
  const [collectionPickerVisible, setCollectionPickerVisible] = useState(false);
  const [metadataMenuVisible, setMetadataMenuVisible] = useState(false);
  const [readMore, setReadMore] = useState(false);
  const screenFocused = useIsFocused();
  const backButtonRef = useRef<View>(null);
  const registerBackFocus = useCallback(() => {
    if (!isTV || !screenFocused) return;
    const handle = findNodeHandle(backButtonRef.current);
    if (handle) useTVNavigationStore.getState().setActiveScreenFocusHandle(handle);
  }, [screenFocused]);

  useFocusEffect(useCallback(() => {
    if (!isTV) return;
    // The back button takes first focus through hasTVPreferredFocus. On return
    // from Player, the focused episode restores itself, so do not move focus.
    return () => {
      const handle = findNodeHandle(backButtonRef.current);
      const store = useTVNavigationStore.getState();
      if (handle && store.activeScreenFocusHandle === handle) {
        store.setActiveScreenFocusHandle(null);
      }
    };
  }, []));
  const exploreRef = useRef<View>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshInFlight = useRef(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isAtTop, setIsAtTop] = useState(true);
  const [statusBarScrimVisible, setStatusBarScrimVisible] = useState(false);
  const dynamicInfoAccentEnabled = settingsStorage.isDynamicInfoAccentEnabled();
  const {accent: imageAccent, ready: initialAccentReady} = useInfoAccent({
    poster: route.params.poster,
    background: isMetaLoading ? undefined : meta?.background || info?.image,
    pageKey: JSON.stringify([providerValue, route.params.link]),
    enabled: dynamicInfoAccentEnabled,
  });
  const contentProviderName = useMemo(
    () =>
      providerValue === 'local' ? 'Local content' : installedProviders.find(item => item.value === providerValue)
        ?.display_name || providerValue,
    [installedProviders, providerValue],
  );

  const optTitle = route.params.title;
  const optImage = route.params.image;
  const optTags = route.params.tags;
  const optSynopsis = route.params.synopsis;
  const hasOptimisticData = Boolean(optTitle || optImage || route.params.poster);

  const displayTitle = meta?.name || info?.title || optTitle;
  // Translated title is the headline on the detail screen; the original
  // shows below it in small grey letters when it differs. Search, library
  // and navigation keep using displayTitle (the providers index originals).
  const {translated: translatedTitle, needsTranslation: titleNeedsTranslation} =
    useTranslatedTitle(displayTitle);
  const displayLogo = meta?.logo || info?.logo;
  const synopsis =
    meta?.description || info?.synopsis || optSynopsis || 'No synopsis available';
  const posterImage =
    info?.poster ||
    (info as any)?.cover ||
    info?.image ||
    meta?.poster ||
    (meta as any)?.cover ||
    optImage ||
    route.params.poster ||
    (route.params as any)?.cover ||
    (route.params as any)?.image;
  const backgroundImage =
    meta?.background ||
    info?.image ||
    info?.poster ||
    (info as any)?.cover ||
    optImage ||
    route.params.poster ||
    (route.params as any)?.cover;
  // Posters and small images are blurred behind the page, with the sharp
  // poster shown in the header instead of stretched across it.
  const {posterLike: backdropPosterLike, aspectRatio: backdropAspectRatio} =
    useArtworkShape(backgroundImage);

  // Register only while this screen is focused. A hidden screen in a
  // mounted tab or stack must not swallow back presses.
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        navigation.goBack();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation]),
  );

  const detailColors = useMemo<MaterialColors>(
    () => (imageAccent ? buildDetailPalette(colors, imageAccent) : colors),
    [colors, imageAccent],
  );

  const webUrl = info?.webUrl?.trim();
  const linkList = info?.linkList;
  // No quality filtering here: this is a comic app, chapters have no video
  // quality to exclude. (The old excluded-qualities filter and its setting
  // were video logic; both are removed.)

  // Promise chain instead of try/finally: React Compiler skips any component
  // that contains a finally clause.
  const handleRefresh = useCallback(() => {
    if (refreshInFlight.current) return Promise.resolve();
    refreshInFlight.current = true;
    setRefreshing(true);
    setRefreshVersion(version => version + 1);
    const refresh = localTitle ? refetch() : Promise.race([
      refetch(),
      new Promise(resolve => setTimeout(resolve, 10000)),
    ]);
    return refresh.catch(cause => {
      ToastAndroid.show(cause instanceof Error ? cause.message : 'Unable to refresh this title', ToastAndroid.LONG);
    }).finally(() => {
      refreshInFlight.current = false;
      setTimeout(() => {
        setRefreshing(false);
      }, 50);
    });
  }, [refetch, localTitle]);

  const handleScroll = useCallback((event: any) => {
    const offsetY = event.nativeEvent?.contentOffset?.y ?? 0;
    setStatusBarScrimVisible(offsetY > 12);
    setIsAtTop(offsetY <= 0);
  }, []);

  const toggleLibrary = useCallback(() => {
    if (settingsStorage.isHapticFeedbackEnabled()) {
      ReactNativeHapticFeedback.trigger('effectClick', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    }
    // With one category, save to it or remove directly. With none or several,
    // ask where to save.
    if (localTitle || !onlyCollectionId) {
      setCollectionPickerVisible(true);
      return;
    }
    if (inLibrary) {
      removeItem(route.params.link);
      return;
    }
    setItemCollections(
      {
        title: displayTitle,
        poster: posterImage,
        link: route.params.link,
        provider: providerValue,
      },
      [onlyCollectionId],
    );
  }, [
    displayTitle,
    localTitle,
    inLibrary,
    onlyCollectionId,
    posterImage,
    providerValue,
    removeItem,
    route.params.link,
    setItemCollections,
  ]);

  const searchTitle = useCallback(() => {
    if (!displayTitle) {
      return;
    }
    searchNavigation.navigate('SearchStack', {
      screen: 'SearchResults',
      params: {filter: displayTitle},
    } as never);
  }, [displayTitle, searchNavigation]);

  const handleOpenWeb = useCallback(() => {
    if (!webUrl) {
      return;
    }
    if (settingsStorage.isSkipInAppWebview()) {
      if (!isSafeExternalUrl(webUrl)) {
        ToastAndroid.show('Unsupported link', ToastAndroid.SHORT);
        return;
      }
      Linking.openURL(webUrl).catch(() => {
        ToastAndroid.show('Failed to open browser', ToastAndroid.SHORT);
      });
    } else {
      navigation.navigate('Webview', {link: webUrl});
    }
  }, [navigation, webUrl]);

  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const continueWatchingItems = useContinueWatchingStore(state => state.items);
  const resumeItem = useMemo(() => {
    return continueWatchingItems.find(
      item => item.infoUrl === route.params.link,
    );
  }, [continueWatchingItems, route.params.link]);

  const resumeText = useMemo(() => {
    if (!resumeItem) return undefined;
    const ch = resumeItem.chapterNumber || resumeItem.episodeTitle || '1';
    const page = resumeItem.page || Math.round(resumeItem.position) || 1;
    return `Resume Ch. ${ch} • Page ${page}`;
  }, [resumeItem]);

  const resumeChapter = useMemo(() => {
    if (!resumeItem) return undefined;
    return resumeItem.chapterNumber || resumeItem.episodeTitle;
  }, [resumeItem]);

  const handleTapTag = useCallback(
    (tag: string) => {
      searchNavigation.navigate('SearchStack', {
        screen: 'SearchResults',
        params: {filter: tag},
      } as never);
    },
    [searchNavigation],
  );

  const handleChapterPress = useCallback(
    (
      chapter: EpisodeLink | ChapterLink,
      index: number,
      allChapters: (EpisodeLink | ChapterLink)[],
    ) => {
      rootNavigation.navigate('Player', {
        linkIndex: index,
        episodeList: allChapters as EpisodeLink[],
        type: info?.type || 'comic',
        primaryTitle: displayTitle,
        secondaryTitle: chapter.title,
        poster: {
          logo: displayLogo,
          poster: posterImage,
          background: backgroundImage,
        },
        providerValue: providerValue,
        infoUrl: route.params.link,
      });
    },
    [
      rootNavigation,
      info?.type,
      displayTitle,
      displayLogo,
      posterImage,
      backgroundImage,
      providerValue,
      route.params.link,
    ],
  );

  // Derive chapters from info.chapters or info.linkList
  const derivedChapters = useMemo<(EpisodeLink | ChapterLink)[]>(() => {
    if (info?.chapters && info.chapters.length > 0) {
      return info.chapters;
    }
    const links = info?.linkList || [];
    for (const linkItem of links) {
      if (linkItem.directLinks && linkItem.directLinks.length > 0) {
        return linkItem.directLinks as (EpisodeLink | ChapterLink)[];
      }
    }
    // Universal App-Side Single-File Fallback:
    // If chapters.length === 0 after getMeta completes, automatically synthesize 1 single playable chapter row
    if (!isLoading || info || hasOptimisticData) {
      const fallbackTitle = displayTitle || optTitle || route.params.title || 'Read Full Comic';
      return [
        {
          id: 'single-1',
          title: fallbackTitle,
          chapterNumber: 1,
          link: route.params.link,
          type: 'comic',
        } as any,
      ];
    }
    return [];
  }, [
    info?.chapters,
    info?.linkList,
    isLoading,
    info,
    hasOptimisticData,
    displayTitle,
    optTitle,
    route.params.title,
    route.params.link,
  ]);

  // Acknowledge new chapters when opening Info screen so the +N badge clears
  // (sessionNewIds keeps newly added chapters highlighted during this session).
  useEffect(() => {
    if (route.params.link) {
      const totalCount = derivedChapters.length > 0 ? derivedChapters.length : undefined;
      watchListStorage.acknowledgeChapters(route.params.link, totalCount);
      if (derivedChapters.length > 0) {
        const isSyntheticSingle =
          derivedChapters.length === 1 && (derivedChapters[0] as any)?.id === 'single-1';
        if (!isSyntheticSingle) {
          chapterUpdateTracker.acknowledgeComicUpdates(route.params.link, derivedChapters);
        }
      }
      useWatchListStore.getState().syncFromStorage();
    }
  }, [route.params.link, derivedChapters]);

  const handleStartReading = useCallback(() => {
    const chapters = derivedChapters;
    let targetIndex = 0;
    if (resumeItem && chapters.length > 0) {
      const targetLink = resumeItem.episode?.link;
      const idx = chapters.findIndex(
        ch => ch.link === targetLink || ch.title === resumeItem.episodeTitle,
      );
      if (idx !== -1) {
        targetIndex = idx;
      }
    }
    const targetChapter = chapters[targetIndex] || resumeItem?.episode || {
      id: 'single-1',
      title: displayTitle || 'Read Full Comic',
      chapterNumber: 1,
      link: route.params.link,
    };
    rootNavigation.navigate('Player', {
      linkIndex: targetIndex,
      episodeList: (chapters.length > 0 ? chapters : [targetChapter]) as EpisodeLink[],
      type: info?.type || 'comic',
      primaryTitle: displayTitle,
      secondaryTitle: targetChapter.title,
      poster: {
        logo: displayLogo,
        poster: posterImage,
        background: backgroundImage,
      },
      providerValue: providerValue,
      infoUrl: route.params.link,
    });
  }, [
    derivedChapters,
    resumeItem,
    displayTitle,
    route.params.link,
    rootNavigation,
    info?.type,
    displayLogo,
    posterImage,
    backgroundImage,
    providerValue,
  ]);

  React.useEffect(() => {
    const chapters = info?.chapters;
    if (Array.isArray(chapters) && chapters.length > 0) {
      let resumeIndex = 0;
      if (resumeItem) {
        const targetLink = resumeItem.episode?.link;
        const idx = chapters.findIndex(
          ch => ch.link === targetLink || ch.title === resumeItem.episodeTitle,
        );
        if (idx !== -1) {
          resumeIndex = idx;
        }
      }
      instantChapterLauncher.preloadSerialSequence(
        chapters,
        resumeIndex,
        providerValue,
      );
    }
  }, [info?.chapters, resumeItem, providerValue]);

  if (error && !info && !hasOptimisticData) {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.background,
          flex: 1,
          justifyContent: 'center',
          padding: 24,
        }}>
        <StatusBar style="light" />
        <AppText
          role="headlineSmallEmphasized"
          style={{color: colors.error, textAlign: 'center'}}>
          Failed to load content
        </AppText>
        <AppText
          role="bodyMedium"
          style={{
            color: colors.onSurfaceVariant,
            marginTop: 8,
            textAlign: 'center',
          }}>
          {error.message || 'An unexpected error occurred'}
        </AppText>
        <View style={{flexDirection: 'row', gap: 10, marginTop: 22}}>
          <Button variant="destructive" onPress={handleRefresh}>
            Try again
          </Button>
          <Button variant="tonal" onPress={navigation.goBack}>
            Go back
          </Button>
        </View>
      </View>
    );
  }

  const isContentLoading =
    (!info && !hasOptimisticData) ||
    (dynamicInfoAccentEnabled && !initialAccentReady && !hasOptimisticData);
  if (isContentLoading) {
    return (
      <View style={{backgroundColor: '#000000', flex: 1}}>
        <StatusBar style="light" />
        <InfoSkeleton onBack={navigation.goBack} />
      </View>
    );
  }

  return (
    <QueryErrorBoundary>
      <M3PaletteContext.Provider value={detailColors}>
        <View style={{backgroundColor: '#000000', flex: 1}}>
          <StatusBarScrim visible={statusBarScrimVisible} />
          <StatusBar style="light" />
          <TVFocusGuide autoFocus={true} trapFocusDown={true} trapFocusRight={true} style={{flex: 1}}>
          <ScreenOverlayHost>
          <FlatList
            style={{backgroundColor: '#000000'}}
            data={[]}
            keyExtractor={(_, index) => String(index)}
            renderItem={() => null}
            ListHeaderComponent={
              <>
                <ContentOverview
                  backgroundImage={backgroundImage}
                  posterImage={posterImage}
                  headerPoster={backdropPosterLike ? backgroundImage : undefined}
                  headerPosterAspectRatio={backdropAspectRatio}
                  genres={info?.genres || meta?.genres || optTags}
                  inLibrary={inLibrary}
                  isLoading={isLoading && !info && !hasOptimisticData}
                  logo={displayLogo}
                  onBack={navigation.goBack}
                  onOpenMenu={() => setMetadataMenuVisible(true)}
                  backButtonRef={backButtonRef}
                  onBackButtonLayout={registerBackFocus}
                  exploreRef={exploreRef}
                  onOpenWeb={webUrl ? handleOpenWeb : undefined}
                  onSearchTitle={searchTitle}
                  onToggleLibrary={toggleLibrary}
                  onToggleSynopsis={() => setReadMore(value => !value)}
                  providerName={contentProviderName}
                  rating={meta?.imdbRating || info?.rating}
                  views={info?.views}
                  readMore={readMore}
                  synopsis={synopsis}
                  synopsisLoading={isSynopsisLoading}
                  tags={info?.tags || optTags}
                  title={translatedTitle}
                  originalTitle={titleNeedsTranslation ? displayTitle : undefined}
                  needsTranslation={titleNeedsTranslation}
                  totalChapters={derivedChapters.length}
                  author={
                    info?.author ||
                    (meta as any)?.author ||
                    (info as any)?.uploader ||
                    (meta as any)?.uploader
                  }
                  uploader={(info as any)?.uploader || (meta as any)?.uploader}
                  artist={info?.artist}
                  status={info?.status}
                  parody={info?.parody}
                  characters={info?.characters}
                  language={info?.language}
                  onTapTag={handleTapTag}
                  onStartReading={handleStartReading}
                  resumeChapter={resumeChapter}
                  resumeText={resumeText}
                />
                <View
                  style={{
                    backgroundColor: '#000000',
                    paddingHorizontal: 18,
                    paddingTop: 24,
                  }}>
                  {isLoading && !info && !hasOptimisticData ? (
                    <View style={{gap: 12}}>
                      <SkeletonLoader show height={28} width={120} />
                      <SkeletonLoader show height={72} width="100%" />
                    </View>
                  ) : localTitle ? (
                    <LocalEpisodeList title={localTitle} />
                  ) : (
                    <ChapterList
                      chapters={derivedChapters}
                      LinkList={linkList}
                      providerValue={providerValue}
                      metaTitle={displayTitle || ''}
                      poster={{
                        logo: displayLogo,
                        poster: posterImage,
                        background: backgroundImage,
                      }}
                      type={info?.type || 'comic'}
                      synopsis={synopsis}
                      routeParams={route.params}
                      refreshing={refreshing}
                      refreshVersion={refreshVersion}
                      quickDownload={info?.quickDownload}
                      onChapterPress={handleChapterPress}
                    />
                  )}
                </View>
              </>
            }
            ListFooterComponent={
              <View
                style={{
                  backgroundColor: '#000000',
                  height: 110,
                }}
              />
            }
            onScroll={handleScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                colors={[detailColors.primary]}
                progressBackgroundColor={detailColors.surfaceContainer}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                enabled={isAtTop || refreshing}
              />
            }
          />
          </ScreenOverlayHost>
          </TVFocusGuide>
          <LibraryCollectionDialog
            visible={collectionPickerVisible}
            onClose={() => setCollectionPickerVisible(false)}
            item={{
              title: displayTitle,
              poster: posterImage,
              link: route.params.link,
              provider: providerValue,
            }}
          />
          {localTitle && <LocalMetadataDialog
            visible={metadataMenuVisible}
            onClose={() => setMetadataMenuVisible(false)}
            title={localTitle}
            onRescan={handleRefresh}
            rescanning={refreshing}
          />}
          {info && !localTitle && <ProviderMetadataDialog
            visible={metadataMenuVisible}
            onClose={() => setMetadataMenuVisible(false)}
            info={info}
            provider={providerValue}
            link={route.params.link}
          />}
        </View>
      </M3PaletteContext.Provider>
    </QueryErrorBoundary>
  );
}

export default function Info(props: Props): React.JSX.Element {
  return (
    <CrashGuardBoundary screenName="Comic Details" onGoBack={props.navigation.goBack}>
      <InfoContent {...props} />
    </CrashGuardBoundary>
  );
}
