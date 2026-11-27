import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {useEffect, useMemo, useState} from 'react';
import {
  Image,
  Text,
  TouchableOpacity,
  View,
  findNodeHandle,
} from 'react-native';
import {useM3Colors} from '../../../theme/M3PaletteContext';
import SkeletonLoader from '../../../components/Skeleton';
import ComicThumbnail from '../../../components/ComicThumbnail';
import AppText from '../../../components/ui/Text';
import SynopsisText from './SynopsisText';
import {isTV} from '../../../lib/tv';
import useTVNavigationStore from '../../../lib/zustand/tvNavigationStore';
import {TVFocusable} from '../../../components/tv';

interface ContentOverviewProps {
  backgroundImage?: string;
  posterImage?: string;
  headerPoster?: string;
  headerPosterAspectRatio?: number;
  genres?: string[];
  inLibrary: boolean;
  isLoading: boolean;
  logo?: string;
  onBack: () => void;
  onOpenMenu?: () => void;
  backButtonRef?: React.RefObject<View | null>;
  onBackButtonLayout?: () => void;
  exploreRef?: React.RefObject<View | null>;
  onOpenWeb?: () => void;
  onSearchTitle: () => void;
  onToggleLibrary: () => void;
  onToggleSynopsis: () => void;
  providerName: string;
  rating?: string;
  // Real view count from the provider site (user, 2026-11-18). Shown
  // as an eye badge next to the rating; hidden when the site does not
  // show views.
  views?: number;
  readMore: boolean;
  synopsis: string;
  synopsisLoading: boolean;
  tags?: string[];
  title?: string;
  /** Original-language title, shown below the translated headline in small
      grey letters when the two differ. */
  originalTitle?: string;
  // Comic specific props
  author?: string;
  artist?: string;
  status?: string;
  parody?: string[] | string;
  characters?: string[] | string;
  language?: string;
  onTapTag?: (tag: string) => void;
  onStartReading?: () => void;
  resumeChapter?: string | number;
  resumeText?: string;
}

const HeaderIconButton = ({
  icon,
  label,
  onPress,
  focusRef,
  onLayout,
  preferredFocus = true,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  focusRef?: React.RefObject<View | null>;
  onLayout?: () => void;
  preferredFocus?: boolean;
}) => {
  const colors = useM3Colors();

  return (
    <TVFocusable
      ref={focusRef}
      onLayout={onLayout}
      onFocus={() => {
        if (isTV && focusRef?.current) {
          const handle = findNodeHandle(focusRef.current);
          if (handle) useTVNavigationStore.getState().setActiveScreenFocusHandle(handle);
        }
      }}
      hasTVPreferredFocus={isTV && preferredFocus}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        alignItems: 'center',
        height: 44,
        justifyContent: 'center',
        width: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
      }}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.primary} />
    </TVFocusable>
  );
};

const TagChip = ({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color?: string;
  onPress?: () => void;
}) => {
  const colors = useM3Colors();
  const textColor = color || colors.primary;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={!onPress}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }}>
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={14}
          color={textColor}
          style={{marginRight: 4}}
        />
      )}
      <AppText role="labelSmallEmphasized" style={{color: textColor, fontSize: 11.5}}>
        {label}
      </AppText>
    </TouchableOpacity>
  );
};

const ContentOverview: React.FC<ContentOverviewProps> = ({
  backgroundImage,
  posterImage,
  headerPoster,
  genres = [],
  inLibrary,
  isLoading,
  logo,
  onBack,
  onOpenMenu,
  backButtonRef,
  onBackButtonLayout,
  onOpenWeb,
  onToggleLibrary,
  onToggleSynopsis,
  providerName,
  rating,
  views,
  readMore,
  synopsis,
  synopsisLoading,
  tags = [],
  title,
  originalTitle,
  author,
  artist,
  status,
  parody,
  characters,
  language,
  onTapTag,
  onStartReading,
  resumeChapter,
  resumeText,
}) => {
  const insets = useSafeAreaInsets();
  const colors = useM3Colors();
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  const displayCover = posterImage || headerPoster || backgroundImage;

  // Status configuration
  const normalizedStatus = (status || '').toLowerCase().trim();
  const statusInfo = useMemo(() => {
    if (normalizedStatus.includes('ongoing')) {
      return {label: 'Ongoing', text: '#81C784', bg: 'rgba(76, 175, 80, 0.18)', border: 'rgba(76, 175, 80, 0.35)'};
    }
    if (normalizedStatus.includes('complete')) {
      return {label: 'Completed', text: '#64B5F6', bg: 'rgba(33, 150, 243, 0.18)', border: 'rgba(33, 150, 243, 0.35)'};
    }
    if (normalizedStatus.includes('one') || normalizedStatus.includes('shot')) {
      return {label: 'One-Shot', text: '#FFD54F', bg: 'rgba(255, 193, 7, 0.18)', border: 'rgba(255, 193, 7, 0.35)'};
    }
    if (status) {
      return {label: status, text: colors.primary, bg: 'rgba(255, 255, 255, 0.08)', border: 'rgba(255, 255, 255, 0.15)'};
    }
    return null;
  }, [normalizedStatus, status, colors.primary]);

  // Rating clean up
  const normalizedRating = rating?.replace(/\s*\/\s*10$/i, '').trim();

  // All metadata tags
  const parodyList = useMemo(() => {
    if (!parody) return [];
    if (Array.isArray(parody)) return parody;
    return [parody];
  }, [parody]);

  const characterList = useMemo(() => {
    if (!characters) return [];
    if (Array.isArray(characters)) return characters;
    return [characters];
  }, [characters]);

  return (
    <View style={{position: 'relative', backgroundColor: '#000000'}}>

      {/* Top Header Navigation Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: isTV ? 32 : insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 8,
          zIndex: 10,
        }}>
        <HeaderIconButton
          focusRef={backButtonRef}
          onLayout={onBackButtonLayout}
          icon="arrow-left"
          label="Go back"
          onPress={onBack}
        />
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          {onOpenMenu && (
            <HeaderIconButton
              icon="dots-vertical"
              label="More options"
              onPress={onOpenMenu}
              preferredFocus={false}
            />
          )}
        </View>
      </View>

      {/* Main Comic Header: 2:3 vertical cover on left, Details on right */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
          gap: 16,
        }}>
        {/* Left: 2:3 Vertical Cover */}
        <View
          style={{
            width: 124,
            height: 186,
            borderRadius: 14,
            overflow: 'hidden',
            backgroundColor: colors.surfaceContainerHigh,
            shadowColor: '#000',
            shadowOffset: {width: 0, height: 4},
            shadowOpacity: 0.5,
            shadowRadius: 8,
            elevation: 8,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
          }}>
          {displayCover ? (
            <ComicThumbnail
              source={displayCover}
              contentFit="cover"
              borderRadius={16}
              altTitle={title}
              width="100%"
              height="100%"
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceContainerHighest,
              }}>
              <MaterialCommunityIcons
                name="book-open-page-variant"
                size={36}
                color={colors.onSurfaceVariant}
              />
            </View>
          )}
        </View>

        {/* Right: Title, Author, Artist, Status, Rating, Provider */}
        <View style={{flex: 1, minWidth: 0, justifyContent: 'space-between'}}>
          <View>
            {isLoading ? (
              <SkeletonLoader show height={32} width={180} marginVertical={0} />
            ) : logo && !logoFailed ? (
              <Image
                source={{uri: logo}}
                onError={() => setLogoFailed(true)}
                resizeMode="contain"
                resizeMethod="resize"
                style={{height: 48, width: 180, marginBottom: 4}}
              />
            ) : (
              <AppText
                role="headlineSmallEmphasized"
                numberOfLines={3}
                style={{
                  color: colors.onBackground,
                  fontSize: 20,
                  lineHeight: 25,
                }}>
                {title || 'Unknown title'}
              </AppText>
            )}

            {/* Original-language title, in small low-contrast grey letters
                under the translated headline. */}
            {originalTitle && originalTitle !== title ? (
              <AppText
                role="labelSmall"
                numberOfLines={2}
                style={{
                  color: colors.onSurfaceVariant,
                  fontSize: 12,
                  marginTop: 2,
                }}>
                {originalTitle}
              </AppText>
            ) : null}

            {author ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 6,
                  gap: 4,
                }}>
                <MaterialCommunityIcons
                  name="account-edit-outline"
                  size={14}
                  color={colors.primary}
                />
                <AppText
                  role="bodySmall"
                  numberOfLines={1}
                  style={{color: colors.onSurfaceVariant, fontSize: 12.5}}>
                  Author: <AppText role="labelSmallEmphasized" style={{color: colors.onSurface}}>{author}</AppText>
                </AppText>
              </View>
            ) : null}

            {artist && artist !== author ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 3,
                  gap: 4,
                }}>
                <MaterialCommunityIcons
                  name="palette-outline"
                  size={14}
                  color={colors.secondary}
                />
                <AppText
                  role="bodySmall"
                  numberOfLines={1}
                  style={{color: colors.onSurfaceVariant, fontSize: 12.5}}>
                  Artist: <AppText role="labelSmallEmphasized" style={{color: colors.onSurface}}>{artist}</AppText>
                </AppText>
              </View>
            ) : null}
          </View>

          {/* Badges: Status Pill & Rating */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 10,
            }}>
            {statusInfo && (
              <View
                style={{
                  backgroundColor: statusInfo.bg,
                  borderColor: statusInfo.border,
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}>
                <AppText
                  role="labelSmallEmphasized"
                  style={{
                    color: statusInfo.text,
                    fontWeight: '800',
                    fontSize: 11,
                  }}>
                  {statusInfo.label}
                </AppText>
              </View>
            )}

            {normalizedRating ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255, 179, 0, 0.16)',
                  borderColor: 'rgba(255, 179, 0, 0.4)',
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  gap: 3,
                }}>
                <MaterialCommunityIcons name="star" size={13} color="#FFB300" />
                <AppText
                  role="labelSmallEmphasized"
                  style={{color: '#FFB300', fontWeight: '800', fontSize: 11}}>
                  {normalizedRating}
                </AppText>
              </View>
            ) : null}

            {typeof views === 'number' && views > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderColor: 'rgba(255, 255, 255, 0.16)',
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  gap: 4,
                }}>
                <MaterialCommunityIcons
                  name="eye"
                  size={13}
                  color={colors.onSurfaceVariant}
                />
                <AppText
                  role="labelSmallEmphasized"
                  style={{
                    color: colors.onSurface,
                    fontWeight: '800',
                    fontSize: 11,
                  }}>
                  {views.toLocaleString()}
                </AppText>
              </View>
            ) : null}

            {providerName ? (
              <View
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                }}>
                <AppText
                  role="labelSmall"
                  style={{color: colors.onSurfaceVariant, fontSize: 10.5}}>
                  {providerName}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* Action Bar */}
      <View
        style={{
          paddingHorizontal: 20,
          width: '100%',
        }}>
        {/* Primary Action Button: "Start Reading" or "Resume Ch. X" */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onStartReading}
          style={{
            backgroundColor: '#F1F5F9',
            minHeight: 48,
            borderRadius: 24,
            paddingHorizontal: 24,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginVertical: 12,
            width: '100%',
          }}>
          <MaterialCommunityIcons
            name="book-open-page-variant"
            size={22}
            color="#0F172A"
          />
          <Text
            style={{
              color: '#0F172A',
              fontSize: 16,
              fontWeight: '700',
              marginLeft: 8,
            }}>
            {resumeChapter
              ? `Resume Ch. ${resumeChapter}`
              : resumeText || 'Start Reading'}
          </Text>
        </TouchableOpacity>

        {/* Two Secondary Buttons Row */}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            width: '100%',
            marginBottom: 16,
          }}>
          {/* Button 1 (Library) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onToggleLibrary}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: inLibrary ? '#38BDF8' : '#475569',
              backgroundColor: '#1E293B',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 12,
            }}>
            <MaterialCommunityIcons
              name={inLibrary ? 'bookmark-check' : 'bookmark-plus-outline'}
              size={18}
              color="#F8FAFC"
            />
            <Text
              style={{
                color: '#F8FAFC',
                fontSize: 14,
                fontWeight: '600',
                marginLeft: 6,
              }}>
              {inLibrary ? 'In Library' : 'Add to Library'}
            </Text>
          </TouchableOpacity>

          {/* Button 2 (WebView / Bypass) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onOpenWeb}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: '#475569',
              backgroundColor: '#1E293B',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 12,
              opacity: onOpenWeb ? 1 : 0.6,
            }}>
            <MaterialCommunityIcons
              name="earth"
              size={18}
              color="#F8FAFC"
            />
            <Text
              style={{
                color: '#F8FAFC',
                fontSize: 14,
                fontWeight: '600',
                marginLeft: 6,
              }}>
              WebView
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Metadata Tags: Genres, Tags, Parody, Characters, Language */}
      <View style={{paddingHorizontal: 20, paddingTop: 16}}>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
          {language ? (
            <TagChip
              label={`LANG: ${language.toUpperCase()}`}
              color="#94A3B8"
              onPress={onTapTag ? () => onTapTag(language) : undefined}
            />
          ) : null}

          {genres.map(genre => (
            <TagChip
              key={genre}
              label={genre}
              icon="tag-outline"
              color={colors.primary}
              onPress={onTapTag ? () => onTapTag(genre) : undefined}
            />
          ))}

          {tags.map(tag => (
            <TagChip
              key={tag}
              label={tag}
              color={colors.secondary}
              onPress={onTapTag ? () => onTapTag(tag) : undefined}
            />
          ))}

          {parodyList.map(p => (
            <TagChip
              key={p}
              label={`Parody: ${p}`}
              icon="book-sync-outline"
              color="#FF80AB"
              onPress={onTapTag ? () => onTapTag(p) : undefined}
            />
          ))}

          {characterList.map(c => (
            <TagChip
              key={c}
              label={c}
              icon="account-outline"
              color="#80D8FF"
              onPress={onTapTag ? () => onTapTag(c) : undefined}
            />
          ))}
        </View>
      </View>

      {/* Synopsis */}
      <View style={{paddingHorizontal: 20, paddingTop: 16}}>
        <AppText
          role="titleMediumEmphasized"
          style={{color: colors.onBackground, marginBottom: 8}}>
          Synopsis
        </AppText>
        {synopsisLoading ? (
          <View style={{gap: 6}}>
            <SkeletonLoader show height={16} width="100%" marginVertical={0} />
            <SkeletonLoader show height={16} width="90%" marginVertical={0} />
            <SkeletonLoader show height={16} width="60%" marginVertical={0} />
          </View>
        ) : (
          <SynopsisText
            synopsis={synopsis}
            expanded={readMore}
            onToggle={onToggleSynopsis}
          />
        )}
      </View>
    </View>
  );
};

export default React.memo(ContentOverview);
