import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  FlatList,
  Pressable,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {ChapterLink, EpisodeLink, Link} from '../lib/providers/types';
import {useEpisodes} from '../lib/hooks/useEpisodes';
import {
  ConsolidatedChapterLink,
  collectAllSeriesChapters,
  sortAndMergeChapters,
} from '../lib/aggregator/seriesRoomEngine';
import {settingsStorage, watchProgressStorage} from '../lib/storage';
import {
  chapterUpdateTracker,
  extractChapterId,
  useNewChapterIds,
} from '../lib/storage/chapterUpdateTracker';
import {useM3Colors} from '../theme/M3PaletteContext';
import AppText from './ui/Text';
import Downloader from './Downloader';
import DropdownField from './ui/DropdownField';
import SkeletonLoader from './Skeleton';
import {createDesktopCompatibleFileName, createSeriesDownloadId} from '../lib/downloadId';
import {instantChapterLauncher} from '../lib/reader/instantChapterLauncher';

interface ChapterListProps {
  chapters?: (EpisodeLink | ChapterLink)[];
  LinkList?: Link[];
  providerValue: string;
  metaTitle: string;
  poster: {
    logo?: string;
    poster: string;
    background?: string;
  };
  type?: string;
  synopsis?: string;
  routeParams: {link: string; provider?: string; poster?: string};
  refreshing?: boolean;
  refreshVersion?: number;
  quickDownload?: boolean;
  onChapterPress: (
    chapter: EpisodeLink | ChapterLink,
    index: number,
    allChapters: (EpisodeLink | ChapterLink)[],
  ) => void;
}

export const parseChapterNumber = (title?: string): number => {
  if (!title) return 0;
  const match = title.match(/(?:chapter|ch\.?|ep\.?|episode)\s*([\d.]+)/i);
  if (match && match[1]) {
    const parsed = parseFloat(match[1]);
    if (!isNaN(parsed)) return parsed;
  }
  const numMatch = title.match(/([\d.]+)/);
  if (numMatch && numMatch[1]) {
    const parsed = parseFloat(numMatch[1]);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
};

const ChapterList: React.FC<ChapterListProps> = ({
  chapters: directChapters,
  LinkList = [],
  providerValue,
  metaTitle,
  poster,
  type = 'comic',
  synopsis = '',
  routeParams,
  refreshing = false,
  refreshVersion = 0,
  quickDownload = false,
  onChapterPress,
}) => {
  const colors = useM3Colors();
  const [activeLink, setActiveLink] = useState<Link | undefined>(() => LinkList[0]);
  const [searchText, setSearchText] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [selectedScanlator, setSelectedScanlator] = useState<string>('all');
  const [progressVersion, setProgressVersion] = useState<number>(0);

  useEffect(() => {
    if (LinkList.length > 0 && !activeLink) {
      setActiveLink(LinkList[0]);
    }
  }, [LinkList, activeLink]);

  // If direct chapters are not supplied, fetch via useEpisodes
  const episodesQuery = useEpisodes(
    directChapters ? undefined : activeLink?.episodesLink,
    providerValue,
    !directChapters && !!activeLink?.episodesLink,
  );

  useEffect(() => {
    if (refreshing && !directChapters && activeLink?.episodesLink) {
      episodesQuery.refetch();
    }
  }, [refreshing, refreshVersion, directChapters, activeLink?.episodesLink, episodesQuery]);

  const rawChapters = useMemo<(EpisodeLink | ChapterLink)[]>(() => {
    if (directChapters && directChapters.length > 0) {
      return directChapters;
    }
    if (activeLink?.directLinks && activeLink.directLinks.length > 0) {
      return activeLink.directLinks as (EpisodeLink | ChapterLink)[];
    }
    for (const linkItem of LinkList) {
      if (linkItem.directLinks && linkItem.directLinks.length > 0) {
        return linkItem.directLinks as (EpisodeLink | ChapterLink)[];
      }
    }
    if (episodesQuery.data && episodesQuery.data.length > 0) {
      return episodesQuery.data;
    }
    // Universal single-chapter fallback
    if (routeParams?.link) {
      return [
        {
          id: 'single-1',
          title: metaTitle || 'Read Full Comic',
          chapterNumber: 1,
          link: routeParams.link,
          type: 'comic' as const,
        },
      ];
    }
    return [];
  }, [directChapters, activeLink?.directLinks, LinkList, episodesQuery.data, routeParams?.link, metaTitle]);

  const newChapterIds = useNewChapterIds(routeParams?.link);

  useEffect(() => {
    const comicLink = routeParams?.link;
    if (!comicLink || rawChapters.length === 0) return;
    const isSyntheticSingle =
      rawChapters.length === 1 && (rawChapters[0] as any)?.id === 'single-1';
    if (isSyntheticSingle) return;
    chapterUpdateTracker.recordChapterListSnapshot(comicLink, rawChapters);
    chapterUpdateTracker.acknowledgeComicUpdates(comicLink, rawChapters);
  }, [routeParams?.link, rawChapters]);

  const [deepChapters, setDeepChapters] = useState<ConsolidatedChapterLink[]>([]);

  useEffect(() => {
    let active = true;
    if (metaTitle && providerValue && providerValue !== 'local') {
      collectAllSeriesChapters({
        baseTitle: metaTitle,
        providerValue,
        currentChapters: rawChapters,
      })
        .then(res => {
          if (active && res && res.length > rawChapters.length) {
            setDeepChapters(res);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [metaTitle, providerValue, rawChapters]);

  const mergedBaseChapters = useMemo<ConsolidatedChapterLink[]>(() => {
    const list = deepChapters.length > 0 ? deepChapters : rawChapters;
    return sortAndMergeChapters(list, sortOrder);
  }, [deepChapters, rawChapters, sortOrder]);

  // Extract distinct languages & scanlators
  const {languages, scanlators} = useMemo(() => {
    const langSet = new Set<string>();
    const scanSet = new Set<string>();
    for (const ch of mergedBaseChapters) {
      const c = ch as ChapterLink;
      if (c.language && c.language.trim()) {
        langSet.add(c.language.trim().toUpperCase());
      }
      if (c.scanlator && c.scanlator.trim()) {
        scanSet.add(c.scanlator.trim());
      }
    }
    return {
      languages: Array.from(langSet),
      scanlators: Array.from(scanSet),
    };
  }, [mergedBaseChapters]);

  // Filter & sort chapters
  const filteredChapters = useMemo(() => {
    let result = [...mergedBaseChapters];

    // Language filter
    if (selectedLanguage !== 'all') {
      result = result.filter(ch => {
        const lang = (ch as ChapterLink).language?.trim()?.toUpperCase();
        return lang === selectedLanguage;
      });
    }

    // Scanlator filter
    if (selectedScanlator !== 'all') {
      result = result.filter(ch => {
        const scan = (ch as ChapterLink).scanlator?.trim();
        return scan === selectedScanlator;
      });
    }

    // Text search filter
    const query = searchText.trim().toLowerCase();
    if (query) {
      result = result.filter(ch => {
        const title = (ch.title || '').toLowerCase();
        const chNum = String((ch as ChapterLink).chapterNumber ?? parseChapterNumber(ch.title));
        return title.includes(query) || chNum.includes(query);
      });
    }

    return result;
  }, [mergedBaseChapters, selectedLanguage, selectedScanlator, searchText]);

  const triggerHaptic = useCallback(() => {
    if (settingsStorage.isHapticFeedbackEnabled()) {
      ReactNativeHapticFeedback.trigger('effectClick', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    }
  }, []);

  const toggleSort = useCallback(() => {
    triggerHaptic();
    setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
  }, [triggerHaptic]);

  const toggleReadStatus = useCallback(
    (chapter: EpisodeLink | ChapterLink) => {
      triggerHaptic();
      const current = watchProgressStorage.getProgress(chapter.link);
      const isAlreadyRead =
        current && current.duration > 0 && current.position >= current.duration;

      if (isAlreadyRead) {
        watchProgressStorage.setProgress(chapter.link, 0, 100);
      } else {
        watchProgressStorage.setProgress(chapter.link, 100, 100);
      }
      setProgressVersion(v => v + 1);
    },
    [triggerHaptic],
  );

  const renderChapterRow = useCallback(
    ({item, index}: {item: EpisodeLink | ChapterLink; index: number}) => {
      const chapterItem = item as ChapterLink;
      const chNum = chapterItem.chapterNumber ?? parseChapterNumber(item.title);
      const scanlator = chapterItem.scanlator;
      const releaseDate = chapterItem.releaseDate;

      // Progress check
      const progress = watchProgressStorage.getProgress(item.link);
      const isRead =
        progress && progress.duration > 0 && progress.position >= progress.duration;
      const hasProgress = progress && progress.position > 0 && !isRead;
      const progressBadgeText = isRead
        ? 'Completed'
        : hasProgress
          ? `p. ${Math.round(progress.position)}${progress.duration > 0 ? `/${Math.round(progress.duration)}` : ''}`
          : null;

      const downloadId = createSeriesDownloadId(metaTitle, activeLink?.title || 'Chapters', index);
      const downloadFileName = createDesktopCompatibleFileName(
        `${metaTitle} ${item.title || `Chapter ${chNum}`}`,
        'series',
      );

      return (
        <Pressable
          onPress={() => onChapterPress(item, index, filteredChapters)}
          onPressIn={() => {
            const effProvider = (item as any).provider || providerValue;
            if (item.link && effProvider) {
              instantChapterLauncher.preloadChapter(item.link, effProvider, {
                chapterTitle: item.title,
                chapterNumber: (item as any).chapterNumber || chNum,
                failoverItem: (item as ConsolidatedChapterLink).sources ? (item as ConsolidatedChapterLink) : undefined,
              });
            }
          }}
          style={({pressed}) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#1E293B',
            backgroundColor: pressed
              ? colors.surfaceContainerHigh
              : 'transparent',
          })}>
          {/* Left side: Read/Unread eye button + Chapter Info */}
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              minWidth: 0,
            }}>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => toggleReadStatus(item)}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isRead
                  ? 'rgba(76, 175, 80, 0.15)'
                  : colors.surfaceContainerHighest,
                marginRight: 12,
                flexShrink: 0,
              }}>
              <MaterialCommunityIcons
                name={isRead ? 'eye-check' : 'eye-outline'}
                size={20}
                color={isRead ? '#4CAF50' : colors.onSurfaceVariant}
              />
            </TouchableOpacity>

            <View style={{flex: 1, minWidth: 0}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                <AppText
                  role="bodyLargeEmphasized"
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    color: isRead ? colors.onSurfaceVariant : colors.onSurface,
                    fontSize: 15,
                    fontWeight: '600',
                  }}>
                  {item.title || `Chapter ${chNum}`}
                </AppText>
                {(Boolean((item as any).isNew) ||
                  newChapterIds.has(extractChapterId(item, index))) && (
                  <View
                    style={{
                      backgroundColor: '#00E676',
                      borderRadius: 6,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                    }}>
                    <AppText
                      role="labelSmall"
                      style={{
                        color: '#000000',
                        fontSize: 9,
                        fontWeight: '800',
                        letterSpacing: 0.4,
                      }}>
                      NEW
                    </AppText>
                  </View>
                )}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: 4,
                }}>
                {scanlator ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: 4,
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                    }}>
                    <MaterialCommunityIcons
                      name="account-group"
                      size={11}
                      color={colors.primary}
                      style={{marginRight: 3}}
                    />
                    <AppText
                      role="labelSmall"
                      numberOfLines={1}
                      style={{color: colors.onSurfaceVariant, fontSize: 11}}>
                      {scanlator}
                    </AppText>
                  </View>
                ) : null}

                {(item as ConsolidatedChapterLink).sources &&
                (item as ConsolidatedChapterLink).sources!.length > 1 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.secondaryContainer,
                      borderRadius: 4,
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                    }}>
                    <MaterialCommunityIcons
                      name="layers-triple"
                      size={11}
                      color={colors.onSecondaryContainer}
                      style={{marginRight: 3}}
                    />
                    <AppText
                      role="labelSmall"
                      style={{
                        color: colors.onSecondaryContainer,
                        fontSize: 10.5,
                        fontWeight: '700',
                      }}>
                      {(item as ConsolidatedChapterLink).sources!.length} Sources
                    </AppText>
                  </View>
                ) : null}

                {releaseDate ? (
                  <AppText
                    role="labelSmall"
                    style={{color: colors.outline, fontSize: 11}}>
                    {releaseDate}
                  </AppText>
                ) : null}

                {progressBadgeText ? (
                  <View
                    style={{
                      backgroundColor: isRead
                        ? 'rgba(76, 175, 80, 0.2)'
                        : colors.primaryContainer,
                      borderRadius: 4,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                    }}>
                    <AppText
                      role="labelSmallEmphasized"
                      style={{
                        color: isRead ? '#81C784' : colors.onPrimaryContainer,
                        fontSize: 10.5,
                        fontWeight: '700',
                      }}>
                      {progressBadgeText}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* Right side: Circular Download icon button */}
          <View
            style={{
              marginLeft: 12,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Downloader
              downloadId={downloadId}
              episodeIndex={index}
              providerValue={providerValue}
              link={item.link}
              type={type}
              mediaType="series"
              showName={metaTitle}
              seasonTitle={activeLink?.title || 'Chapters'}
              episodeName={item.title || `Chapter ${chNum}`}
              poster={poster.poster}
              background={poster.background}
              synopsis={synopsis}
              infoUrl={routeParams.link}
              quickDownload={quickDownload}
              title={`${metaTitle} ${item.title || `Chapter ${chNum}`}`}
              fileName={downloadFileName}
            />
          </View>
        </Pressable>
      );
    },
    [
      colors,
      metaTitle,
      activeLink?.title,
      type,
      poster,
      synopsis,
      routeParams.link,
      quickDownload,
      providerValue,
      onChapterPress,
      filteredChapters,
      toggleReadStatus,
      progressVersion,
    ],
  );

  return (
    <View style={{gap: 14}}>
      {/* Group / Volume Dropdown if multiple links exist */}
      {LinkList.length > 1 && (
        <DropdownField
          options={LinkList}
          value={activeLink}
          getKey={option => option.episodesLink || option.title}
          getLabel={option => option.title}
          onChange={option => setActiveLink(option)}
          placeholder="Select volume or group"
        />
      )}

      {/* Chapter Search & Sort Bar */}
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surfaceContainerHigh,
            borderRadius: 14,
            paddingHorizontal: 12,
            height: 44,
          }}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={colors.onSurfaceVariant}
            style={{marginRight: 8}}
          />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search chapters..."
            placeholderTextColor={colors.onSurfaceVariant}
            style={{
              flex: 1,
              color: colors.onSurface,
              fontSize: 14,
              paddingVertical: 0,
            }}
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchText('')}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={colors.onSurfaceVariant}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Sort Order Button */}
        <TouchableOpacity
          onPress={toggleSort}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surfaceContainerHigh,
            borderRadius: 14,
            height: 44,
            paddingHorizontal: 12,
            gap: 6,
          }}>
          <MaterialCommunityIcons
            name={sortOrder === 'desc' ? 'sort-numeric-descending' : 'sort-numeric-ascending'}
            size={20}
            color={colors.primary}
          />
          <AppText role="labelMediumEmphasized" style={{color: colors.primary}}>
            {sortOrder === 'desc' ? 'Desc' : 'Asc'}
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Filter Chips (Languages & Scanlators) */}
      {(languages.length > 1 || scanlators.length > 1) && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
          {languages.length > 1 && (
            <>
              <TouchableOpacity
                onPress={() => setSelectedLanguage('all')}
                style={{
                  backgroundColor:
                    selectedLanguage === 'all'
                      ? colors.primary
                      : colors.surfaceContainerHigh,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}>
                <AppText
                  role="labelSmallEmphasized"
                  style={{
                    color:
                      selectedLanguage === 'all'
                        ? colors.onPrimary
                        : colors.onSurfaceVariant,
                  }}>
                  All Lang
                </AppText>
              </TouchableOpacity>
              {languages.map(lang => (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setSelectedLanguage(lang)}
                  style={{
                    backgroundColor:
                      selectedLanguage === lang
                        ? colors.primary
                        : colors.surfaceContainerHigh,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}>
                  <AppText
                    role="labelSmallEmphasized"
                    style={{
                      color:
                        selectedLanguage === lang
                          ? colors.onPrimary
                          : colors.onSurfaceVariant,
                    }}>
                    {lang}
                  </AppText>
                </TouchableOpacity>
              ))}
            </>
          )}

          {scanlators.length > 1 && (
            <>
              <TouchableOpacity
                onPress={() => setSelectedScanlator('all')}
                style={{
                  backgroundColor:
                    selectedScanlator === 'all'
                      ? colors.secondary
                      : colors.surfaceContainerHigh,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}>
                <AppText
                  role="labelSmallEmphasized"
                  style={{
                    color:
                      selectedScanlator === 'all'
                        ? colors.onSecondary
                        : colors.onSurfaceVariant,
                  }}>
                  All Groups
                </AppText>
              </TouchableOpacity>
              {scanlators.slice(0, 4).map(group => (
                <TouchableOpacity
                  key={group}
                  onPress={() => setSelectedScanlator(group)}
                  style={{
                    backgroundColor:
                      selectedScanlator === group
                        ? colors.secondary
                        : colors.surfaceContainerHigh,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}>
                  <AppText
                    role="labelSmallEmphasized"
                    numberOfLines={1}
                    style={{
                      color:
                        selectedScanlator === group
                          ? colors.onSecondary
                          : colors.onSurfaceVariant,
                      maxWidth: 100,
                    }}>
                    {group}
                  </AppText>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      )}

      {/* Chapter Count */}
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2}}>
        <AppText role="titleMediumEmphasized" style={{color: colors.onBackground}}>
          Chapters ({filteredChapters.length})
        </AppText>
      </View>

      {/* Chapters Virtualized List */}
      {episodesQuery.isLoading && !directChapters ? (
        <View style={{gap: 8}}>
          <SkeletonLoader show height={54} width="100%" />
          <SkeletonLoader show height={54} width="100%" />
          <SkeletonLoader show height={54} width="100%" />
        </View>
      ) : filteredChapters.length === 0 ? (
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 36,
            backgroundColor: colors.surfaceContainerLow,
            borderRadius: 16,
          }}>
          <MaterialCommunityIcons
            name="book-open-page-variant-outline"
            size={36}
            color={colors.outline}
          />
          <AppText
            role="bodyMedium"
            style={{color: colors.onSurfaceVariant, marginTop: 8}}>
            {searchText ? 'No chapters matching search' : 'No chapters available'}
          </AppText>
        </View>
      ) : (
        <FlatList
          data={filteredChapters}
          keyExtractor={(item, idx) => item.link || (item as any).id || String(idx)}
          renderItem={renderChapterRow}
          scrollEnabled={false}
          initialNumToRender={20}
          maxToRenderPerBatch={25}
        />
      )}
    </View>
  );
};

export default React.memo(ChapterList);
