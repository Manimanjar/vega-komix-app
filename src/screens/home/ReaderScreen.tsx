import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  StatusBar,
  StyleSheet,
  ToastAndroid,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import {NativeStackNavigationProp, NativeStackScreenProps} from '@react-navigation/native-stack';
import Orientation from 'react-native-orientation-locker';
import {activateKeepAwakeAsync, deactivateKeepAwake} from 'expo-keep-awake';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type {HomeStackParamList, RootStackParamList} from '../../App';
import type {EpisodeLink, PageImage, Stream} from '../../lib/providers/types';
import {providerManager} from '../../lib/services/ProviderManager';
import {openWebView} from '../../lib/services/wafResolver';
import {fetchPagesWithFailover} from '../../lib/aggregator/failoverLoader';
import {autoDomainResolver} from '../../lib/network/autoDomainResolver';
import {instantChapterLauncher} from '../../lib/reader/instantChapterLauncher';
import type {ConsolidatedChapterLink} from '../../lib/aggregator/seriesRoomEngine';
import {
  loadLocalChapterPages,
  getComicChapterDirectory,
} from '../../lib/comicDownloader';
import useDownloadsStore from '../../lib/zustand/downloadsStore';
import AppText from '../../components/ui/Text';
import {settingsStorage} from '../../lib/storage';
import {
  DEFAULT_READER_SETTINGS,
  getStoredReaderProgress,
  getStoredReaderSettings,
  saveStoredReaderProgress,
  saveStoredReaderSettings,
} from '../../components/reader/readerStorage';
import type {
  ReaderPageItem,
  ReaderSettings,
  ReadingMode,
  ScreenOrientationMode,
} from '../../components/reader/types';
import {THEME_COLORS} from '../../components/reader/types';
import {turboPreloader, type TurboStats} from '../../lib/reader/turboPreloader';
import {useVolumeKeyTurn} from '../../components/reader/useVolumeKeyTurn';
import {WebtoonView} from '../../components/reader/WebtoonView';
import {PagedView} from '../../components/reader/PagedView';
import {ReaderHUD} from '../../components/reader/ReaderHUD';
import {ReaderSettingsSheet} from '../../components/reader/ReaderSettingsSheet';
import CrashGuardBoundary from '../../components/CrashGuardBoundary';
import {
  mangaTranslatorEngine,
  type PageTranslationResult,
  type TranslationStatus,
} from '../../lib/translator/mangaTranslatorEngine';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;

export const ReaderScreen: React.FC<Props> = ({route, navigation}) => {
  const {
    linkIndex = 0,
    episodeList = [],
    primaryTitle = 'Comic',
    secondaryTitle,
    poster,
    providerValue = '',
    infoUrl = '',
  } = route.params;

  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(linkIndex);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [pages, setPages] = useState<ReaderPageItem[]>([]);
  const [loadingPages, setLoadingPages] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [hudVisible, setHudVisible] = useState<boolean>(false);
  const [settingsSheetVisible, setSettingsSheetVisible] = useState<boolean>(false);
  const [quality, setQuality] = useState<'original' | 'compressed'>('original');
  const [turboStats, setTurboStats] = useState<TurboStats>(() =>
    turboPreloader.getStats(),
  );

  useEffect(() => {
    return turboPreloader.subscribe(setTurboStats);
  }, []);

  // Load persistent settings
  const [settings, setSettings] = useState<ReaderSettings>(() =>
    getStoredReaderSettings(),
  );

  const [translateEnabled, setTranslateEnabled] = useState<boolean>(
    () => settings.liveTranslateEnabled ?? false,
  );
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>('idle');
  const [pageTranslations, setPageTranslations] = useState<Record<number, PageTranslationResult>>({});

  useEffect(() => {
    return mangaTranslatorEngine.subscribeStatus((status) => {
      setTranslationStatus(status);
    });
  }, []);

  useEffect(() => {
    if (typeof settings.liveTranslateEnabled === 'boolean' && settings.liveTranslateEnabled !== translateEnabled) {
      setTranslateEnabled(settings.liveTranslateEnabled);
    }
  }, [settings.liveTranslateEnabled]);

  const currentChapter: EpisodeLink | undefined = episodeList[currentChapterIndex];
  const chapterLink = currentChapter?.link || '';
  const chapterTitle = currentChapter?.title || secondaryTitle || `Chapter ${currentChapterIndex + 1}`;

  // Keep screen awake effect
  useEffect(() => {
    if (settings.keepScreenAwake) {
      activateKeepAwakeAsync().catch(() => {});
    } else {
      deactivateKeepAwake().catch(() => {});
    }
    return () => {
      deactivateKeepAwake().catch(() => {});
    };
  }, [settings.keepScreenAwake]);

  // Orientation locker
  useEffect(() => {
    if (settings.orientationMode === 'portrait') {
      Orientation.lockToPortrait();
    } else if (settings.orientationMode === 'landscape') {
      Orientation.lockToLandscape();
    } else {
      Orientation.unlockAllOrientations();
    }
    return () => {
      Orientation.unlockAllOrientations();
    };
  }, [settings.orientationMode]);

  // Handle hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (settingsSheetVisible) {
          setSettingsSheetVisible(false);
          return true;
        }
        if (hudVisible) {
          setHudVisible(false);
          return true;
        }
        navigation.goBack();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [settingsSheetVisible, hudVisible, navigation]),
  );

  // Restore saved progress on mount or chapter change
  useEffect(() => {
    const saved = getStoredReaderProgress(infoUrl || chapterLink);
    if (saved && saved.chapterIndex === currentChapterIndex) {
      setCurrentPageIndex(saved.currentPageIndex);
      if (saved.readingMode) {
        setSettings(s => ({...s, readingMode: saved.readingMode}));
      }
    } else {
      setCurrentPageIndex(0);
    }
  }, [currentChapterIndex, infoUrl, chapterLink]);

  // Fetch Chapter Pages
  useEffect(() => {
    if (!chapterLink) return;

    let active = true;
    setLoadingPages(true);
    setPageError(null);

    const loadPages = async () => {
      try {
        // 1. Direct local file/folder check
        if (
          chapterLink.startsWith('/') ||
          chapterLink.startsWith('file://') ||
          chapterLink.includes('/downloads/')
        ) {
          const offlinePages = await loadLocalChapterPages(chapterLink);
          if (offlinePages && offlinePages.length > 0 && active) {
            setPages(offlinePages);
            setLoadingPages(false);
            return;
          }
        }

        // 2. Check downloads store for completed chapter
        const downloads = useDownloadsStore.getState().downloads;
        const matchingDownload = Object.values(downloads).find(
          d =>
            d.status === 'completed' &&
            (d.sourceLink === chapterLink ||
              d.url === chapterLink ||
              d.id === currentChapter?.id ||
              (d.showName === primaryTitle && d.episodeName === chapterTitle)),
        );

        if (matchingDownload?.filePath) {
          const offlinePages = await loadLocalChapterPages(
            matchingDownload.filePath,
          );
          if (offlinePages && offlinePages.length > 0 && active) {
            setPages(offlinePages);
            setLoadingPages(false);
            return;
          }
        }

        // 3. Check filesystem downloads convention path
        const expectedDir = getComicChapterDirectory({
          providerValue,
          comicTitle: primaryTitle,
          chapterTitle,
        });

        const dirPages = await loadLocalChapterPages(expectedDir);
        if (dirPages && dirPages.length > 0 && active) {
          setPages(dirPages);
          setLoadingPages(false);
          return;
        }

        const cbzPages = await loadLocalChapterPages(`${expectedDir}.cbz`);
        if (cbzPages && cbzPages.length > 0 && active) {
          setPages(cbzPages);
          setLoadingPages(false);
          return;
        }

        // 4. Instant Chapter Launcher Cache Check (0ms cached open)
        const cachedManifest = instantChapterLauncher.getCachedPages(chapterLink, providerValue);
        if (cachedManifest && cachedManifest.length > 0 && active) {
          const normalized: ReaderPageItem[] = cachedManifest.map(
            (item: any, idx: number) => {
              const rawUrl = item.imageUrl || item.link || item.url || '';
              const imgUrl = autoDomainResolver.rewriteUrlWithResolvedDomain(rawUrl);
              return {
                index: typeof item.index === 'number' ? item.index : idx,
                imageUrl: imgUrl,
                width: item.width,
                height: item.height,
                headers: item.headers,
              };
            },
          );
          setPages(normalized);
          setLoadingPages(false);
          instantChapterLauncher.preloadSerialSequence(
            episodeList,
            currentChapterIndex,
            providerValue,
          );
          return;
        }

        // 5. Fallback to online provider with failover support
        let rawResult: any = null;
        try {
          const failoverOutcome = await fetchPagesWithFailover(
            (currentChapter as ConsolidatedChapterLink) || {
              id: currentChapter?.id || chapterLink,
              title: chapterTitle,
              chapterNumber: currentChapterIndex + 1,
              link: chapterLink,
            },
            providerValue,
          );
          rawResult = failoverOutcome.pages;
        } catch {
          rawResult = await providerManager.getPages({
            link: chapterLink,
            providerValue,
            type: 'comic',
          });
        }

        if (!active) return;

        // Unroll rawResult whether provider returns PageImage[] directly or { pages: PageImage[] }
        let pageList: any[] = [];
        if (Array.isArray(rawResult)) {
          pageList = rawResult;
        } else if (rawResult && typeof rawResult === 'object') {
          if (Array.isArray(rawResult.pages)) {
            pageList = rawResult.pages;
          } else if (Array.isArray(rawResult.images)) {
            pageList = rawResult.images;
          } else if (Array.isArray(rawResult.stream)) {
            pageList = rawResult.stream;
          }
        }

        if (pageList.length > 0) {
          // Normalize to ReaderPageItem and apply autoDomainResolver
          const normalized: ReaderPageItem[] = pageList.map(
            (item: any, idx: number) => {
              const rawUrl = item.imageUrl || item.link || item.url || '';
              const imgUrl = autoDomainResolver.rewriteUrlWithResolvedDomain(rawUrl);
              return {
                index: typeof item.index === 'number' ? item.index : idx,
                imageUrl: imgUrl,
                width: item.width,
                height: item.height,
                headers: item.headers,
              };
            },
          );
          setPages(normalized);
          instantChapterLauncher.preloadPageImages(pageList);
          instantChapterLauncher.preloadSerialSequence(
            episodeList,
            currentChapterIndex,
            providerValue,
          );
        } else {
          setPageError('No pages returned by provider');
        }
      } catch (err: any) {
        if (!active) return;
        console.error('[ReaderScreen] Error loading pages:', err);
        setPageError(err.message || 'Failed to load chapter pages');
      } finally {
        if (active) setLoadingPages(false);
      }
    };

    loadPages();
    return () => {
      active = false;
    };
  }, [chapterLink, providerValue, primaryTitle, chapterTitle, currentChapter?.id]);

  // Hardware Volume Keys: Turn pages
  const handlePrevPage = useCallback(() => {
    setCurrentPageIndex(prev => Math.max(0, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPageIndex(prev => Math.min(pages.length - 1, prev + 1));
  }, [pages.length]);

  useVolumeKeyTurn({
    enabled: settings.volumeKeysEnabled,
    onPrevPage: handlePrevPage,
    onNextPage: handleNextPage,
  });

  // Turbo Sliding-Window 8-Page Preloader & Next Chapter Handoff
  useEffect(() => {
    if (pages.length > 0) {
      turboPreloader.scheduleWindowPrefetch({
        pages,
        currentPageIndex,
        allChapters: episodeList,
        currentChapterIndex,
        providerValue,
      });
    }
  }, [pages, currentPageIndex, episodeList, currentChapterIndex, providerValue]);

  // Save Progress on every page turn
  const handlePageChange = useCallback(
    (newPageIndex: number) => {
      setCurrentPageIndex(newPageIndex);
      saveStoredReaderProgress({
        comicLink: infoUrl || chapterLink,
        chapterId: chapterLink,
        chapterTitle,
        chapterIndex: currentChapterIndex,
        currentPageIndex: newPageIndex,
        totalPages: pages.length,
        readingMode: settings.readingMode,
        comicTitle: primaryTitle,
        poster: poster?.poster || poster?.background,
        providerValue,
      });
    },
    [
      infoUrl,
      chapterLink,
      chapterTitle,
      currentChapterIndex,
      pages.length,
      settings.readingMode,
      primaryTitle,
      poster,
      providerValue,
    ],
  );

  // Trigger single page translation with instant MMKV cache check
  const triggerPageTranslation = useCallback(
    async (pageIdx: number) => {
      if (!pages[pageIdx] || !chapterLink) return;

      const page = pages[pageIdx];
      const langHint = mangaTranslatorEngine.detectLanguageHint(
        `${primaryTitle} ${secondaryTitle || ''}`,
      );

      // Check instant MMKV cache first (0ms)
      const cached = mangaTranslatorEngine.getCachedPageTranslation(chapterLink, pageIdx);
      if (cached) {
        setPageTranslations(prev => ({...prev, [pageIdx]: cached}));
        return;
      }

      try {
        const result = await mangaTranslatorEngine.translatePage(
          chapterLink,
          pageIdx,
          page.imageUrl,
          page.width,
          page.height,
          langHint,
          page.headers,
        );
        if (result && result.bubbles) {
          setPageTranslations(prev => ({...prev, [pageIdx]: result}));
        }
      } catch {}
    },
    [pages, chapterLink, primaryTitle, secondaryTitle],
  );

  // Live Translate auto-trigger: translate current page immediately and next page in background
  useEffect(() => {
    if (!translateEnabled || pages.length === 0) return;

    // 1. Immediately translate current page
    triggerPageTranslation(currentPageIndex);

    // 2. Pre-translate next page in background
    if (currentPageIndex + 1 < pages.length) {
      triggerPageTranslation(currentPageIndex + 1);
    }
  }, [translateEnabled, currentPageIndex, pages, triggerPageTranslation]);

  // Toggle Live Translate
  const handleToggleTranslate = useCallback(() => {
    setTranslateEnabled(prev => {
      const next = !prev;
      setSettings(s => {
        const updated = {...s, liveTranslateEnabled: next};
        saveStoredReaderSettings(updated);
        return updated;
      });
      ToastAndroid.show(
        next ? 'Live Manga Translation ON [A/文]' : 'Live Manga Translation OFF',
        ToastAndroid.SHORT,
      );
      return next;
    });
  }, []);

  // Retry translation for current page
  const handleRetryTranslation = useCallback(
    (pageIdx: number) => {
      if (!chapterLink) return;
      mangaTranslatorEngine.clearPageTranslation(chapterLink, pageIdx);
      setPageTranslations(prev => {
        const copy = {...prev};
        delete copy[pageIdx];
        return copy;
      });
      triggerPageTranslation(pageIdx);
    },
    [chapterLink, triggerPageTranslation],
  );

  // Navigate to Next Chapter
  const handleNextChapter = useCallback(() => {
    if (currentChapterIndex < episodeList.length - 1) {
      ToastAndroid.show('Loading Next Chapter...', ToastAndroid.SHORT);
      setCurrentChapterIndex(idx => idx + 1);
      setCurrentPageIndex(0);
    } else {
      ToastAndroid.show('You reached the latest chapter!', ToastAndroid.SHORT);
    }
  }, [currentChapterIndex, episodeList.length]);

  // Navigate to Prev Chapter
  const handlePrevChapter = useCallback(() => {
    if (currentChapterIndex > 0) {
      ToastAndroid.show('Loading Previous Chapter...', ToastAndroid.SHORT);
      setCurrentChapterIndex(idx => idx - 1);
      setCurrentPageIndex(0);
    }
  }, [currentChapterIndex]);

  // Select Chapter from Dropdown Modal
  const handleSelectChapter = useCallback((index: number) => {
    if (index >= 0 && index < episodeList.length) {
      setCurrentChapterIndex(index);
      setCurrentPageIndex(0);
    }
  }, [episodeList.length]);

  // Toggle Reading Modes
  const handleToggleReadingMode = useCallback(() => {
    const modes: ReadingMode[] = ['webtoon', 'manga', 'comic', 'double_spread'];
    const currentIdx = modes.indexOf(settings.readingMode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    setSettings(prev => {
      const updated = {...prev, readingMode: nextMode};
      saveStoredReaderSettings(updated);
      return updated;
    });
  }, [settings.readingMode]);

  // Toggle Screen Orientation
  const handleToggleOrientation = useCallback(() => {
    const orientations: ScreenOrientationMode[] = ['auto', 'portrait', 'landscape'];
    const currentIdx = orientations.indexOf(settings.orientationMode);
    const nextOrientation = orientations[(currentIdx + 1) % orientations.length];
    setSettings(prev => {
      const updated = {...prev, orientationMode: nextOrientation};
      saveStoredReaderSettings(updated);
      return updated;
    });
  }, [settings.orientationMode]);

  // Toggle Quality (Original vs Compressed / Data Saver)
  const handleToggleQuality = useCallback(() => {
    setQuality(q => (q === 'original' ? 'compressed' : 'original'));
    ToastAndroid.show(
      quality === 'original' ? 'Switched to Compressed (Data Saver)' : 'Switched to Original Quality',
      ToastAndroid.SHORT,
    );
  }, [quality]);

  // Open WAF WebView Bypass
  const handleOpenWafBypass = useCallback(() => {
    if (chapterLink) {
      openWebView(chapterLink, undefined, 'user', undefined, providerValue).catch(() => {});
    }
  }, [chapterLink, providerValue]);

  // Update Settings from Sheet
  const handleUpdateSettings = useCallback((newPartial: Partial<ReaderSettings>) => {
    setSettings(prev => {
      const updated = {...prev, ...newPartial};
      saveStoredReaderSettings(updated);
      return updated;
    });
  }, []);

  const themeColors = THEME_COLORS[settings.theme];

  return (
    <View style={[styles.root, {backgroundColor: themeColors.background}]}>
      <StatusBar hidden={!hudVisible} barStyle="light-content" />

      {/* Main Reading View */}
      {loadingPages ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#7C4DFF" />
          <AppText
            role="titleMedium"
            style={{color: themeColors.subText, marginTop: 16}}>
            Loading Chapter Pages...
          </AppText>
        </View>
      ) : pageError ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color="#FF5252"
          />
          <AppText
            role="headlineSmall"
            style={{color: '#FF5252', marginTop: 12, textAlign: 'center'}}>
            Unable to load chapter
          </AppText>
          <AppText
            role="bodyMedium"
            style={{
              color: themeColors.subText,
              marginTop: 6,
              textAlign: 'center',
              paddingHorizontal: 32,
            }}>
            {pageError}
          </AppText>
          <TouchableOpacity
            onPress={handleOpenWafBypass}
            style={styles.wafRetryButton}>
            <MaterialCommunityIcons name="shield-check" size={18} color="#FFFFFF" />
            <AppText role="labelLargeEmphasized" style={{color: '#FFFFFF'}}>
              Open in WAF WebView
            </AppText>
          </TouchableOpacity>
        </View>
      ) : settings.readingMode === 'webtoon' ? (
        <WebtoonView
          pages={pages}
          currentPageIndex={currentPageIndex}
          onPageChange={handlePageChange}
          onToggleHUD={() => setHudVisible(v => !v)}
          onReachEnd={settingsStorage.isAutoAdvanceChapter() ? handleNextChapter : undefined}
          scaleMode={settings.imageScale}
          cropWhiteBorders={settings.cropWhiteBorders}
          theme={settings.theme}
          disableTapZones={settings.disableTapZonesInWebtoon}
          translateEnabled={translateEnabled}
          pageTranslations={pageTranslations}
          onRetryTranslation={handleRetryTranslation}
        />
      ) : (
        <PagedView
          pages={pages}
          currentPageIndex={currentPageIndex}
          onPageChange={handlePageChange}
          onToggleHUD={() => setHudVisible(v => !v)}
          onReachEnd={settingsStorage.isAutoAdvanceChapter() ? handleNextChapter : undefined}
          readingMode={settings.readingMode}
          scaleMode={settings.imageScale}
          cropWhiteBorders={settings.cropWhiteBorders}
          theme={settings.theme}
          translateEnabled={translateEnabled}
          pageTranslations={pageTranslations}
          onRetryTranslation={handleRetryTranslation}
        />
      )}

      {/* Floating Page Number indicator (when HUD is hidden) */}
      {!hudVisible && settings.showFloatingPageNumber && pages.length > 0 && (
        <View
          style={[
            styles.floatingPagePill,
            {backgroundColor: 'rgba(0, 0, 0, 0.65)'},
          ]}>
          <AppText
            role="labelSmall"
            style={{color: '#FFFFFF', fontWeight: '700', fontSize: 11}}>
            {currentPageIndex + 1} / {pages.length}
          </AppText>
        </View>
      )}

      {/* Reader HUD (Top & Bottom Controls) */}
      <ReaderHUD
        visible={hudVisible}
        title={primaryTitle}
        chapterTitle={chapterTitle}
        currentPage={currentPageIndex}
        totalPages={pages.length}
        allChapters={episodeList}
        currentChapterIndex={currentChapterIndex}
        readingMode={settings.readingMode}
        orientationMode={settings.orientationMode}
        quality={quality}
        theme={settings.theme}
        turboBadgeText={turboStats.statusText}
        translateEnabled={translateEnabled}
        translationStatus={translationStatus}
        onToggleTranslate={handleToggleTranslate}
        onBack={navigation.goBack}
        onSelectChapter={handleSelectChapter}
        onPrevChapter={handlePrevChapter}
        onNextChapter={handleNextChapter}
        onPageSliderChange={handlePageChange}
        onToggleReadingMode={handleToggleReadingMode}
        onToggleOrientation={handleToggleOrientation}
        onToggleQuality={handleToggleQuality}
        onOpenWafBypass={handleOpenWafBypass}
        onOpenSettings={() => setSettingsSheetVisible(true)}
      />

      {/* Reader Settings Bottom Sheet */}
      <ReaderSettingsSheet
        visible={settingsSheetVisible}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onClose={() => setSettingsSheetVisible(false)}
      />
    </View>
  );
};

const WrappedReaderScreen: React.FC<Props> = (props) => (
  <CrashGuardBoundary screenName="Comic Reader" onGoBack={props.navigation.goBack}>
    <ReaderScreen {...props} />
  </CrashGuardBoundary>
);

export default WrappedReaderScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  wafRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    backgroundColor: '#7C4DFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  floatingPagePill: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
  },
});
