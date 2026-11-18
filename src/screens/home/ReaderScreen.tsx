import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  StatusBar,
  StyleSheet,
  ToastAndroid,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Orientation from 'react-native-orientation-locker';
import {activateKeepAwakeAsync, deactivateKeepAwake} from 'expo-keep-awake';
import * as ScreenCapture from 'expo-screen-capture';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type {RootStackParamList} from '../../App';
import type {EpisodeLink} from '../../lib/providers/types';
import {providerManager} from '../../lib/services/ProviderManager';
import {openWebView} from '../../lib/services/wafResolver';
import {fetchPagesWithFailover} from '../../lib/aggregator/failoverLoader';
import {autoDomainResolver} from '../../lib/network/autoDomainResolver';
import {cleanHighResImageUrl} from '../../lib/reader/highResImageCleaner';
import {instantChapterLauncher} from '../../lib/reader/instantChapterLauncher';
import {
  isChapterListDescending,
  getChronologicalNavigation,
} from '../../lib/reader/chapterChronology';
import {
  comicPreferencesStorage,
  toInternalReadingMode,
  fromInternalReadingMode,
  toInternalOrientation,
  fromInternalOrientation,
  toInternalPageFit,
  fromInternalPageFit,
  type ComicPreferences,
} from '../../services/comicPreferencesStorage';
import type {ConsolidatedChapterLink} from '../../lib/aggregator/seriesRoomEngine';
import {
  loadLocalChapterPages,
  getComicChapterDirectory,
} from '../../lib/comicDownloader';
import useDownloadsStore from '../../lib/zustand/downloadsStore';
import {downloadManager} from '../../lib/downloader';
import AppText from '../../components/ui/Text';
import {settingsStorage, watchListStorage} from '../../lib/storage';
import {
  getStoredReaderProgress,
  getStoredReaderSettings,
  saveStoredReaderProgress,
  saveStoredReaderSettings,
} from '../../components/reader/readerStorage';
import type {
  InteractionMode,
  ReaderPageItem,
  ReaderSettings,
  ReadingMode,
  ScreenOrientationMode,
} from '../../components/reader/types';
import {THEME_COLORS} from '../../components/reader/types';
import {turboPreloader, type TurboStats} from '../../lib/reader/turboPreloader';
import {useVolumeKeyTurn} from '../../components/reader/useVolumeKeyTurn';
import {WebtoonContinuousReader} from '../../components/reader/WebtoonView';
import {PagedView} from '../../components/reader/PagedView';
import {nextReadingMode} from '../../components/reader/readerMotion';
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

  // Subscribes this screen to window-dimension changes (rotation): the
  // values themselves are unused — the child views lay out from their own
  // useWindowDimensions — but without this the screen would not re-render
  // when the window size changes.
  useWindowDimensions();

  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(linkIndex);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [pages, setPages] = useState<ReaderPageItem[]>([]);
  const [loadingPages, setLoadingPages] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Chapter load progress for the page-number pill: the set of page indexes
  // whose images have decoded. The count drives a thin transparent green
  // fill inside the pill — no percentage number, the fill level is the
  // estimate. "Loaded" means image decoded, not merely prefetched.
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const [loadedPageCount, setLoadedPageCount] = useState<number>(0);
  const handlePageLoaded = useCallback((index: number) => {
    if (!loadedPagesRef.current.has(index)) {
      loadedPagesRef.current.add(index);
      setLoadedPageCount(loadedPagesRef.current.size);
    }
  }, []);
  const [hudVisible, setHudVisible] = useState<boolean>(false);
  const [settingsSheetVisible, setSettingsSheetVisible] = useState<boolean>(false);
  const [quality, setQuality] = useState<'original' | 'compressed'>('original');
  const [isIncognito, setIsIncognito] = useState<boolean>(false);
  const [turboStats, setTurboStats] = useState<TurboStats>(() =>
    turboPreloader.getStats(),
  );

  const handleToggleIncognito = useCallback(() => {
    setIsIncognito(prev => {
      const next = !prev;
      ToastAndroid.show(
        next
          ? 'Ghost / Incognito Mode ON: History & progress paused'
          : 'Incognito Mode OFF: Reading progress active',
        ToastAndroid.SHORT,
      );
      return next;
    });
  }, []);

  // Android FLAG_SECURE App Masking in Reader & Incognito mode
  useEffect(() => {
    const shouldProtect = settingsStorage.isMaskInRecentsEnabled() || isIncognito;
    if (shouldProtect) {
      ScreenCapture.preventScreenCaptureAsync('reader_content_protection').catch(() => {});
    } else {
      ScreenCapture.allowScreenCaptureAsync('reader_content_protection').catch(() => {});
    }

    return () => {
      ScreenCapture.allowScreenCaptureAsync('reader_content_protection').catch(() => {});
    };
  }, [isIncognito]);

  useEffect(() => {
    return turboPreloader.subscribe(setTurboStats);
  }, []);

  // Detect if chapter list is in descending order (newest/latest at index 0, oldest at end)
  const isDescending = useMemo(() => isChapterListDescending(episodeList), [episodeList]);

  // Compute story-chronological navigation and boundaries
  const {
    hasNext: hasChronologicalNext,
    hasPrev: hasChronologicalPrev,
    nextIndex: chronologicalNextIndex,
    prevIndex: chronologicalPrevIndex,
  } = useMemo(
    () =>
      getChronologicalNavigation({
        currentIndex: currentChapterIndex,
        totalChapters: episodeList.length,
        isDescending,
      }),
    [currentChapterIndex, episodeList.length, isDescending],
  );

  const nextChapter = useMemo(
    () =>
      hasChronologicalNext &&
      chronologicalNextIndex >= 0 &&
      chronologicalNextIndex < episodeList.length
        ? episodeList[chronologicalNextIndex]
        : null,
    [hasChronologicalNext, chronologicalNextIndex, episodeList],
  );

  const nextChapterTitle = useMemo(
    () =>
      nextChapter?.title ||
      (hasChronologicalNext ? `Chapter ${chronologicalNextIndex + 1}` : undefined),
    [nextChapter, hasChronologicalNext, chronologicalNextIndex],
  );

  // Helper to load effective settings (per-comic preferences if present, falling back to global defaults)
  const getEffectiveSettings = useCallback((): ReaderSettings => {
    const globalDefaults = getStoredReaderSettings();
    const targetLink =
      infoUrl ||
      episodeList[currentChapterIndex]?.link ||
      episodeList[linkIndex]?.link ||
      '';
    if (targetLink) {
      const perComic = comicPreferencesStorage.getPreferences(targetLink);
      if (perComic) {
        const mappedMode = toInternalReadingMode(perComic.readingMode);
        const mappedOri = toInternalOrientation(perComic.orientation);
        const mappedFit = toInternalPageFit(perComic.pageFit);
        // No zoomScale here on purpose: the Live Zoom buttons are gone, so
        // a stored per-comic zoom would stick forever with no way to reset
        // it. Zooming is double-tap / pinch now; the setting stays at 1.0.
        return {
          ...globalDefaults,
          ...(mappedMode ? {readingMode: mappedMode} : {}),
          ...(mappedOri ? {orientationMode: mappedOri} : {}),
          ...(mappedFit ? {imageScale: mappedFit} : {}),
        };
      }
    }
    return globalDefaults;
  }, [infoUrl, episodeList, currentChapterIndex, linkIndex]);

  // Load persistent settings with per-comic override
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const globalDefaults = getStoredReaderSettings();
    const targetLink = infoUrl || episodeList[linkIndex]?.link || '';
    if (targetLink) {
      const perComic = comicPreferencesStorage.getPreferences(targetLink);
      if (perComic) {
        const mappedMode = toInternalReadingMode(perComic.readingMode);
        const mappedOri = toInternalOrientation(perComic.orientation);
        const mappedFit = toInternalPageFit(perComic.pageFit);
        return {
          ...globalDefaults,
          ...(mappedMode ? {readingMode: mappedMode} : {}),
          ...(mappedOri ? {orientationMode: mappedOri} : {}),
          ...(mappedFit ? {imageScale: mappedFit} : {}),
        };
      }
    }
    return globalDefaults;
  });

  // Interaction Mode: Continuous default 'scroll', Paged default 'swipe'
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(() => {
    if (settings.readingMode === 'webtoon') {
      return settings.interactionMode === 'one_tap' ? 'one_tap' : 'scroll';
    } else {
      return settings.interactionMode === 'one_tap' ? 'one_tap' : 'swipe';
    }
  });

  const [translateEnabled, setTranslateEnabled] = useState<boolean>(
    () => settings.liveTranslateEnabled ?? false,
  );
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>('idle');
  const [pageTranslations, setPageTranslations] = useState<Record<number, PageTranslationResult>>({});
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [sliderJumpTarget, setSliderJumpTarget] = useState<{index: number; timestamp: number} | null>(null);

  useEffect(() => {
    return mangaTranslatorEngine.subscribeStatus((status) => {
      setTranslationStatus(status);
    });
  }, []);

  // Reload persistent settings on focus (respecting per-comic preferences)
  useFocusEffect(
    useCallback(() => {
      const refreshed = getEffectiveSettings();
      setSettings(refreshed);
      if (typeof refreshed.liveTranslateEnabled === 'boolean') {
        setTranslateEnabled(refreshed.liveTranslateEnabled);
      }
    }, [getEffectiveSettings]),
  );

  useEffect(() => {
    if (typeof settings.liveTranslateEnabled === 'boolean' && settings.liveTranslateEnabled !== translateEnabled) {
      setTranslateEnabled(settings.liveTranslateEnabled);
    }
  }, [settings.liveTranslateEnabled]);

  const currentChapter: EpisodeLink | undefined = episodeList[currentChapterIndex];
  const chapterLink = currentChapter?.link || '';
  const chapterTitle = currentChapter?.title || secondaryTitle || `Chapter ${currentChapterIndex + 1}`;

  // Reset load progress when the chapter (or a manual reload) changes.
  useEffect(() => {
    loadedPagesRef.current = new Set();
    setLoadedPageCount(0);
  }, [chapterLink, reloadKey]);

  // Apply per-comic preferences once chapterLink is resolved if infoUrl was absent
  useEffect(() => {
    const targetLink = infoUrl || chapterLink;
    if (targetLink) {
      const perComic = comicPreferencesStorage.getPreferences(targetLink);
      if (perComic) {
        const mappedMode = toInternalReadingMode(perComic.readingMode);
        const mappedOri = toInternalOrientation(perComic.orientation);
        const mappedFit = toInternalPageFit(perComic.pageFit);
        if (mappedMode || mappedOri || mappedFit) {
          setSettings(prev => ({
            ...prev,
            ...(mappedMode ? {readingMode: mappedMode} : {}),
            ...(mappedOri ? {orientationMode: mappedOri} : {}),
            ...(mappedFit ? {imageScale: mappedFit} : {}),
          }));
        }
      }
    }
  }, [infoUrl, chapterLink]);

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

  // Unlock on screen unmount and restore navigation orientation to default
  useEffect(() => {
    return () => {
      Orientation.unlockAllOrientations();
      navigation.setOptions({orientation: 'default'});
    };
  }, [navigation]);

  // Keep screen orientation strictly locked to the active orientation mode
  useEffect(() => {
    if (settings.orientationMode === 'landscape') {
      Orientation.lockToLandscape();
      navigation.setOptions({orientation: 'landscape'});
    } else {
      Orientation.lockToPortrait();
      navigation.setOptions({orientation: 'portrait'});
    }
  }, [settings.orientationMode, navigation]);

  // Enforce orientation lock against rogue sensor or system events
  useEffect(() => {
    const orientationCallback = (orientation: string) => {
      if (settings.orientationMode === 'landscape' && orientation.includes('PORTRAIT')) {
        Orientation.lockToLandscape();
        navigation.setOptions({orientation: 'landscape'});
      } else if (settings.orientationMode === 'portrait' && orientation.includes('LANDSCAPE')) {
        Orientation.lockToPortrait();
        navigation.setOptions({orientation: 'portrait'});
      }
    };
    Orientation.addOrientationListener(orientationCallback);
    return () => {
      Orientation.removeOrientationListener(orientationCallback);
    };
  }, [settings.orientationMode, navigation]);

  // Auto-Hiding HUD: 3.5s inactivity timer
  const autoHideTimerRef = useRef<any>(null);

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const resetAutoHideTimer = useCallback(() => {
    clearAutoHideTimer();
    if (!settingsSheetVisible) {
      autoHideTimerRef.current = setTimeout(() => {
        setHudVisible(false);
      }, 3500);
    }
  }, [clearAutoHideTimer, settingsSheetVisible]);

  useEffect(() => {
    if (hudVisible && !settingsSheetVisible) {
      resetAutoHideTimer();
    } else {
      clearAutoHideTimer();
    }
    return () => clearAutoHideTimer();
  }, [hudVisible, settingsSheetVisible, resetAutoHideTimer, clearAutoHideTimer]);

  // Center Tap Isolation: ONLY toggles HUD visibility
  const handleToggleHUD = useCallback(() => {
    setHudVisible(prev => !prev);
  }, []);

  // Floating Page Indicator auto-fade timer (2 seconds of inactivity)
  const pageIndicatorOpacity = useRef(new Animated.Value(hudVisible ? 1 : 0)).current;
  const pageIndicatorTimer = useRef<any>(null);

  const showPageIndicator = useCallback(() => {
    Animated.timing(pageIndicatorOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    if (pageIndicatorTimer.current) {
      clearTimeout(pageIndicatorTimer.current);
    }

    if (!hudVisible) {
      pageIndicatorTimer.current = setTimeout(() => {
        Animated.timing(pageIndicatorOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 2000);
    }
  }, [hudVisible, pageIndicatorOpacity]);

  // Sync indicator visibility with hudVisible
  useEffect(() => {
    if (hudVisible) {
      if (pageIndicatorTimer.current) {
        clearTimeout(pageIndicatorTimer.current);
      }
      Animated.timing(pageIndicatorOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      showPageIndicator();
    }
  }, [hudVisible, showPageIndicator, pageIndicatorOpacity]);

  // Clear page indicator timer on unmount
  useEffect(() => {
    return () => {
      if (pageIndicatorTimer.current) {
        clearTimeout(pageIndicatorTimer.current);
      }
    };
  }, []);

  // Dismiss HUD on comic scroll
  const handleDismissHUD = useCallback(() => {
    clearAutoHideTimer();
    setHudVisible(false);
    showPageIndicator();
  }, [clearAutoHideTimer, showPageIndicator]);

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
    const targetLink = infoUrl || chapterLink;
    const perComic = targetLink ? comicPreferencesStorage.getPreferences(targetLink) : null;
    const saved = getStoredReaderProgress(targetLink);
    if (saved && saved.chapterIndex === currentChapterIndex) {
      setCurrentPageIndex(saved.currentPageIndex);
      if (saved.readingMode && !perComic?.readingMode) {
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
      // Instant progressive chunking helper: renders first 5 pages immediately, then streams rest
      const applyPagesProgressively = (rawPages: any[]) => {
        if (!active) return;
        const normalize = (item: any, idx: number): ReaderPageItem => {
          const rawUrl = item.imageUrl || item.link || item.url || '';
          const imgUrl = cleanHighResImageUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(rawUrl));
          return {
            index: typeof item.index === 'number' ? item.index : idx,
            imageUrl: imgUrl,
            width: item.width,
            height: item.height,
            headers: item.headers,
          };
        };

        if (rawPages.length <= 5) {
          const normalized = rawPages.map(normalize);
          setPages(normalized);
          setLoadingPages(false);
          instantChapterLauncher.preloadPageImages(rawPages);
          instantChapterLauncher.preloadSerialSequence(
            episodeList,
            currentChapterIndex,
            providerValue,
            isDescending,
          );
        } else {
          // Instant initial render (< 300ms): Mount first 5 pages immediately
          const initialChunk = rawPages.slice(0, 5).map(normalize);
          setPages(initialChunk);
          setLoadingPages(false);
          instantChapterLauncher.preloadPageImages(initialChunk);

          // Stream / append the full chapter on the next frame without dropping 60fps
          setTimeout(() => {
            if (active) {
              const fullList = rawPages.map(normalize);
              setPages(fullList);
              instantChapterLauncher.preloadPageImages(rawPages);
              instantChapterLauncher.preloadSerialSequence(
                episodeList,
                currentChapterIndex,
                providerValue,
                isDescending,
              );
            }
          }, 16);
        }
      };

      try {
        // 1. Direct local file/folder check
        if (
          chapterLink.startsWith('/') ||
          chapterLink.startsWith('file://') ||
          chapterLink.includes('/downloads/')
        ) {
          const offlinePages = await loadLocalChapterPages(chapterLink);
          if (offlinePages && offlinePages.length > 0 && active) {
            applyPagesProgressively(offlinePages);
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
            applyPagesProgressively(offlinePages);
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
          applyPagesProgressively(dirPages);
          return;
        }

        const cbzPages = await loadLocalChapterPages(`${expectedDir}.cbz`);
        if (cbzPages && cbzPages.length > 0 && active) {
          applyPagesProgressively(cbzPages);
          return;
        }

        // 4. Instant Chapter Launcher Cache Check (0ms cached open)
        const cachedManifest = instantChapterLauncher.getCachedPages(chapterLink, providerValue);
        if (cachedManifest && cachedManifest.length > 0 && active) {
          applyPagesProgressively(cachedManifest);
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
          applyPagesProgressively(pageList);
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
    showPageIndicator();
  }, [showPageIndicator]);

  const handleNextPage = useCallback(() => {
    setCurrentPageIndex(prev => Math.min(pages.length - 1, prev + 1));
    showPageIndicator();
  }, [pages.length, showPageIndicator]);

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

  const saveProgressTimer = useRef<any>(null);

  // Clear pending progress save on unmount
  useEffect(() => {
    return () => {
      if (saveProgressTimer.current) {
        clearTimeout(saveProgressTimer.current);
      }
    };
  }, []);

  // Save Progress on page turn (Debounced 400ms to eliminate storage I/O lag during fast scrolling)
  const handlePageChange = useCallback(
    (newPageIndex: number) => {
      setCurrentPageIndex(newPageIndex);
      showPageIndicator();
      if (!isIncognito) {
        if (saveProgressTimer.current) {
          clearTimeout(saveProgressTimer.current);
        }
        saveProgressTimer.current = setTimeout(() => {
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
          watchListStorage.recordLastReadChapter(infoUrl || chapterLink, currentChapterIndex + 1);
          watchListStorage.acknowledgeChapters(infoUrl || chapterLink);
        }, 400);
      }
    },
    [
      isIncognito,
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

  // Handle direct slider commit (jump directly to target page with animated: false)
  const handlePageSliderCommit = useCallback(
    (targetIndex: number) => {
      const clamped = Math.max(0, Math.min(targetIndex, pages.length - 1));
      setCurrentPageIndex(clamped);
      setSliderJumpTarget({index: clamped, timestamp: Date.now()});
      if (!isIncognito) {
        saveStoredReaderProgress({
          comicLink: infoUrl || chapterLink,
          chapterId: chapterLink,
          chapterTitle,
          chapterIndex: currentChapterIndex,
          currentPageIndex: clamped,
          totalPages: pages.length,
          readingMode: settings.readingMode,
          comicTitle: primaryTitle,
          poster: poster?.poster || poster?.background,
          providerValue,
        });
      }
    },
    [
      isIncognito,
      pages.length,
      infoUrl,
      chapterLink,
      chapterTitle,
      currentChapterIndex,
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

  // Navigate to Next Chapter in story
  const handleNextChapter = useCallback(() => {
    if (hasChronologicalNext) {
      ToastAndroid.show('Loading Next Chapter...', ToastAndroid.SHORT);
      setCurrentChapterIndex(chronologicalNextIndex);
      setCurrentPageIndex(0);
    } else {
      ToastAndroid.show('You reached the latest chapter!', ToastAndroid.SHORT);
    }
  }, [hasChronologicalNext, chronologicalNextIndex]);

  // Navigate to Prev Chapter in story
  const handlePrevChapter = useCallback(() => {
    if (hasChronologicalPrev) {
      ToastAndroid.show('Loading Previous Chapter...', ToastAndroid.SHORT);
      setCurrentChapterIndex(chronologicalPrevIndex);
      setCurrentPageIndex(0);
    } else {
      ToastAndroid.show('You are at the first chapter!', ToastAndroid.SHORT);
    }
  }, [hasChronologicalPrev, chronologicalPrevIndex]);

  // Select Chapter from Dropdown Modal
  const handleSelectChapter = useCallback((index: number) => {
    if (index >= 0 && index < episodeList.length) {
      setCurrentChapterIndex(index);
      setCurrentPageIndex(0);
    }
  }, [episodeList.length]);

  // 1-Tap Toggle Reading Mode: cycles Continuous -> Page by Page ->
  // Manga -> Continuous. The first tap out of Continuous always lands on
  // the left-to-right paged mode, so a Western comic never opens in the
  // manga direction by accident — that was the reversed swipe (next page on
  // a left-to-right swipe). Manga stays one more tap away, and in both
  // paged modes the next page is a swipe right-to-left from page 1 onward.
  const handleToggleReadingMode = useCallback(() => {
    const nextMode: ReadingMode = nextReadingMode(settings.readingMode);
    if (nextMode === 'webtoon') {
      setInteractionMode(prev => (prev === 'one_tap' ? 'one_tap' : 'scroll'));
    } else {
      setInteractionMode(prev => (prev === 'one_tap' ? 'one_tap' : 'swipe'));
    }
    setSettings(prev => {
      const updated = {...prev, readingMode: nextMode};
      saveStoredReaderSettings(updated);
      return updated;
    });

    const targetComicLink = infoUrl || chapterLink;
    if (targetComicLink) {
      const prefMode = fromInternalReadingMode(nextMode);
      if (prefMode) {
        comicPreferencesStorage.savePreferences(targetComicLink, {
          readingMode: prefMode,
        });
      }
    }

    ToastAndroid.show(
      nextMode === 'webtoon'
        ? 'Reading Mode: Continuous Webtoon'
        : nextMode === 'manga'
        ? 'Reading Mode: Page by Page (Manga)'
        : 'Reading Mode: Page by Page',
      ToastAndroid.SHORT,
    );
  }, [settings.readingMode, infoUrl, chapterLink]);

  // Quick Tools: Jump to First Page
  const handleJumpToFirstPage = useCallback(() => {
    handlePageSliderCommit(0);
    ToastAndroid.show('Jumped to Page 1', ToastAndroid.SHORT);
  }, [handlePageSliderCommit]);

  // Quick Tools: Reload Current Page
  const handleReloadCurrentPage = useCallback(() => {
    setReloadKey(k => k + 1);
    ToastAndroid.show('Reloading Page...', ToastAndroid.SHORT);
  }, []);

  // Quick Tools: Download Current Chapter
  const handleDownloadChapter = useCallback(() => {
    if (!chapterLink) return;
    downloadManager({
      downloadId: `comic-${primaryTitle}-${currentChapter?.id || currentChapterIndex}`,
      title: primaryTitle,
      showName: primaryTitle,
      episodeName: chapterTitle || `Chapter ${currentChapterIndex + 1}`,
      mediaType: 'series',
      fileType: 'comic',
      fileName: `${primaryTitle}_${chapterTitle || `Chapter_${currentChapterIndex + 1}`}.cbz`,
      url: chapterLink,
      sourceLink: chapterLink,
      infoUrl,
      provider: providerValue,
      poster: poster?.poster || poster?.background,
      background: poster?.background,
      deleteDownload: () => {},
    }).catch(() => {});
    ToastAndroid.show('Downloading Chapter for offline reading...', ToastAndroid.SHORT);
  }, [
    chapterLink,
    primaryTitle,
    currentChapter?.id,
    currentChapterIndex,
    chapterTitle,
    infoUrl,
    providerValue,
    poster,
  ]);

  // Toggle Screen Orientation: strictly between PORTRAIT and LANDSCAPE
  const handleToggleOrientation = useCallback(() => {
    const nextOrientation: ScreenOrientationMode =
      settings.orientationMode === 'portrait' ? 'landscape' : 'portrait';
    if (nextOrientation === 'landscape') {
      Orientation.lockToLandscape();
      navigation.setOptions({orientation: 'landscape'});
      ToastAndroid.show('Orientation: Landscape', ToastAndroid.SHORT);
    } else {
      Orientation.lockToPortrait();
      navigation.setOptions({orientation: 'portrait'});
      ToastAndroid.show('Orientation: Portrait', ToastAndroid.SHORT);
    }
    setSettings(prev => {
      const updated = {...prev, orientationMode: nextOrientation};
      saveStoredReaderSettings(updated);
      return updated;
    });

    const targetComicLink = infoUrl || chapterLink;
    if (targetComicLink) {
      const prefOri = fromInternalOrientation(nextOrientation);
      if (prefOri) {
        comicPreferencesStorage.savePreferences(targetComicLink, {
          orientation: prefOri,
        });
      }
    }
  }, [settings.orientationMode, navigation, infoUrl, chapterLink]);

  // Toggle Interaction Mode:
  // Continuous (webtoon): cycles 'scroll' <-> 'one_tap'
  // Paged: cycles 'swipe' <-> 'one_tap'
  const handleToggleInteractionMode = useCallback(() => {
    if (settings.readingMode === 'webtoon') {
      const next: InteractionMode = interactionMode === 'scroll' ? 'one_tap' : 'scroll';
      setInteractionMode(next);
      setSettings(s => {
        const u = {...s, interactionMode: next};
        saveStoredReaderSettings(u);
        return u;
      });
      ToastAndroid.show(
        next === 'scroll' ? 'Scroll Mode (Free flick & drag)' : 'One-Tap Mode (Tap edges to scroll)',
        ToastAndroid.SHORT,
      );
    } else {
      const next: InteractionMode = interactionMode === 'swipe' ? 'one_tap' : 'swipe';
      setInteractionMode(next);
      setSettings(s => {
        const u = {...s, interactionMode: next};
        saveStoredReaderSettings(u);
        return u;
      });
      ToastAndroid.show(
        next === 'swipe' ? 'Swipe Mode (Natural swipe turn)' : 'One-Tap Mode (Tap edges to turn)',
        ToastAndroid.SHORT,
      );
    }
  }, [settings.readingMode, interactionMode]);

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

    const targetComicLink = infoUrl || chapterLink;
    if (targetComicLink) {
      const prefsUpdate: Partial<ComicPreferences> = {};
      if (newPartial.readingMode) {
        const m = fromInternalReadingMode(newPartial.readingMode);
        if (m) prefsUpdate.readingMode = m;
      }
      if (newPartial.orientationMode) {
        const o = fromInternalOrientation(newPartial.orientationMode);
        if (o) prefsUpdate.orientation = o;
      }
      if (newPartial.imageScale) {
        const f = fromInternalPageFit(newPartial.imageScale);
        if (f) prefsUpdate.pageFit = f;
      }
      if (typeof newPartial.zoomScale === 'number') {
        prefsUpdate.zoomScale = newPartial.zoomScale;
      }
      if (Object.keys(prefsUpdate).length > 0) {
        comicPreferencesStorage.savePreferences(targetComicLink, prefsUpdate);
      }
    }
  }, [infoUrl, chapterLink]);

  const handleZoomChange = useCallback(
    (newZoom: number) => {
      const clamped = Math.round(Math.max(0.6, Math.min(3.5, newZoom)) * 100) / 100;
      handleUpdateSettings({zoomScale: clamped});
    },
    [handleUpdateSettings],
  );

  const themeColors = THEME_COLORS[settings.theme];

  return (
    <View style={[styles.root, {backgroundColor: themeColors.background}]}>
      <StatusBar
        hidden={!hudVisible}
        translucent={true}
        barStyle="light-content"
        backgroundColor="transparent"
      />

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
          <View style={{flexDirection: 'row', gap: 12, marginTop: 20}}>
            <TouchableOpacity
              onPress={() => setReloadKey(k => k + 1)}
              style={styles.retryButton}>
              <MaterialCommunityIcons name="reload" size={18} color="#FFFFFF" />
              <AppText role="labelLargeEmphasized" style={{color: '#FFFFFF'}}>
                Retry
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleOpenWafBypass}
              style={styles.wafRetryButton}>
              <MaterialCommunityIcons name="shield-check" size={18} color="#FFFFFF" />
              <AppText role="labelLargeEmphasized" style={{color: '#FFFFFF'}}>
                WAF WebView
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      ) : settings.readingMode === 'webtoon' ? (
        <WebtoonContinuousReader
          pages={pages}
          currentPageIndex={currentPageIndex}
          sliderJumpTarget={sliderJumpTarget}
          onPageChange={handlePageChange}
          onToggleHUD={handleToggleHUD}
          onDismissHUD={handleDismissHUD}
          onPageLoaded={handlePageLoaded}
          onReachEnd={settingsStorage.isAutoAdvanceChapter() && hasChronologicalNext ? handleNextChapter : undefined}
          hasNextChapter={hasChronologicalNext}
          nextChapterTitle={nextChapterTitle}
          onNextChapter={handleNextChapter}
          scaleMode={settings.imageScale}
          zoomScale={settings.zoomScale}
          onZoomChange={handleZoomChange}
          reloadKey={reloadKey}
          cropWhiteBorders={settings.cropWhiteBorders}
          theme={settings.theme}
          disableTapZones={settings.disableTapZonesInWebtoon}
          interactionMode={interactionMode}
          translateEnabled={translateEnabled}
          pageTranslations={pageTranslations}
          onRetryTranslation={handleRetryTranslation}
          highQualityRendering={settings.highQualityRendering ?? true}
        />
      ) : (
        <PagedView
          pages={pages}
          currentPageIndex={currentPageIndex}
          sliderJumpTarget={sliderJumpTarget}
          onPageChange={handlePageChange}
          onToggleHUD={handleToggleHUD}
          onDismissHUD={handleDismissHUD}
          onPageLoaded={handlePageLoaded}
          onReachEnd={settingsStorage.isAutoAdvanceChapter() && hasChronologicalNext ? handleNextChapter : undefined}
          hasNextChapter={hasChronologicalNext}
          nextChapterTitle={nextChapterTitle}
          onNextChapter={handleNextChapter}
          readingMode={settings.readingMode}
          scaleMode={settings.imageScale}
          zoomScale={settings.zoomScale}
          onZoomChange={handleZoomChange}
          reloadKey={reloadKey}
          cropWhiteBorders={settings.cropWhiteBorders}
          theme={settings.theme}
          interactionMode={interactionMode}
          splitDoubleSpreads={settings.splitDoubleSpreads ?? true}
          highQualityRendering={settings.highQualityRendering ?? true}
          translateEnabled={translateEnabled}
          pageTranslations={pageTranslations}
          onRetryTranslation={handleRetryTranslation}
        />
      )}

      {/* Warm Night Filter Overlay */}
      {settings.warmFilterEnabled && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(255, 170, 0, 0.12)',
              zIndex: 16,
            },
          ]}
        />
      )}

      {/* Floating Page Number indicator (stays visible with HUD; fades out smoothly after 2s inactivity when HUD hidden) */}
      {settings.showFloatingPageNumber && pages.length > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.floatingPagePill,
            {
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              opacity: pageIndicatorOpacity,
            },
          ]}>
          {/* Chapter load progress: a thin transparent green fill that grows
              as pages decode. No percentage number — the fill level itself is
              the estimate. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${(loadedPageCount / pages.length) * 100}%`,
              backgroundColor: 'rgba(0, 230, 118, 0.30)',
              borderRadius: 14,
            }}
          />
          <AppText
            role="labelSmall"
            style={{color: '#FFFFFF', fontWeight: '700', fontSize: 11}}>
            Page {currentPageIndex + 1} / {pages.length}
          </AppText>
        </Animated.View>
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
        interactionMode={interactionMode}
        quality={quality}
        theme={settings.theme}
        turboBadgeText={turboStats.statusText}
        translateEnabled={translateEnabled}
        translationStatus={translationStatus}
        zoomScale={settings.zoomScale}
        onZoomChange={handleZoomChange}
        onToggleTranslate={settingsStorage.isLiveTranslatorButtonEnabled() ? handleToggleTranslate : undefined}
        onBack={navigation.goBack}
        onSelectChapter={handleSelectChapter}
        onPrevChapter={handlePrevChapter}
        onNextChapter={handleNextChapter}
        hasPrevChapter={hasChronologicalPrev}
        hasNextChapter={hasChronologicalNext}
        onPageSliderCommit={handlePageSliderCommit}
        onPageSliderChange={handlePageChange}
        onToggleReadingMode={handleToggleReadingMode}
        onToggleOrientation={handleToggleOrientation}
        onToggleInteractionMode={handleToggleInteractionMode}
        onToggleQuality={handleToggleQuality}
        onOpenWafBypass={handleOpenWafBypass}
        onOpenSettings={() => setSettingsSheetVisible(true)}
        onTouchActivity={resetAutoHideTimer}
        incognitoEnabled={isIncognito}
        onToggleIncognito={handleToggleIncognito}
      />

      {/* Reader Settings Bottom Sheet */}
      <ReaderSettingsSheet
        visible={settingsSheetVisible}
        settings={settings}
        quality={quality}
        onUpdateSettings={handleUpdateSettings}
        onClose={() => setSettingsSheetVisible(false)}
        onJumpToFirstPage={handleJumpToFirstPage}
        onReloadCurrentPage={handleReloadCurrentPage}
        onToggleQuality={handleToggleQuality}
        onDownloadChapter={handleDownloadChapter}
        incognitoEnabled={isIncognito}
        onToggleIncognito={handleToggleIncognito}
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
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#00E676',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  wafRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    overflow: 'hidden',
  },
});
