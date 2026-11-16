import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  DimensionValue,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {Image as ExpoImage} from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {autoDomainResolver} from '../lib/network/autoDomainResolver';
import {watchListStorage} from '../lib/storage/WatchListStorage';
import AppText from './ui/Text';

export interface ComicThumbnailProps {
  source?:
    | string
    | {
        uri?: string;
        image?: string;
        poster?: string;
        cover?: string;
        url?: string;
        headers?: Record<string, string>;
      };
  uri?: string;
  image?: string;
  poster?: string;
  cover?: string;
  url?: string;
  width?: DimensionValue;
  height?: DimensionValue;
  aspectRatio?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string;
  altTitle?: string;
  blurhash?: string;
  newChaptersCount?: number;
  isNew?: boolean;
  comicLink?: string;
  onLoad?: () => void;
  onError?: (error: any) => void;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

/**
 * Extracts raw URL from any props format
 */
export const extractThumbnailUrl = (props: ComicThumbnailProps): string => {
  const {source, uri, image, poster, cover, url} = props;
  if (typeof source === 'string' && source.trim()) {
    return source.trim();
  }
  if (typeof source === 'object' && source !== null) {
    const sUri =
      source.uri ||
      (source as any).url ||
      source.image ||
      source.poster ||
      source.cover;
    if (sUri && typeof sUri === 'string' && sUri.trim()) {
      return sUri.trim();
    }
  }
  const direct = uri || image || poster || cover || url;
  if (direct && typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  return '';
};

/**
 * Automatically upgrades low-res image thumbnails to high-res covers
 * - Protocol-relative // -> https://
 * - Preserves MangaDex URLs intact without regex corruption
 * - Generic CDN thumbnail size params
 */
export const upgradeThumbnailUrl = (rawUrl?: string): string => {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let cleanUrl = rawUrl.trim();

  // Fix protocol-relative URLs
  if (cleanUrl.startsWith('//')) {
    cleanUrl = `https:${cleanUrl}`;
  }

  // Do NOT corrupt MangaDex cover URLs with broken regex replacements
  if (cleanUrl.includes('mangadex.org') || cleanUrl.includes('/covers/')) {
    return cleanUrl;
  }

  // Upgrade generic thumbnail patterns (never strip .jpg/.png)
  cleanUrl = cleanUrl
    .replace(/([?&])(?:w|width)=\d+/gi, '$1width=600')
    .replace(/([?&])(?:h|height)=\d+/gi, '$1height=900');

  return cleanUrl;
};

export const ComicThumbnail: React.FC<ComicThumbnailProps> = props => {
  const {
    width = '100%',
    height,
    aspectRatio = 2 / 3,
    borderRadius = 14,
    style,
    imageStyle,
    contentFit = 'cover',
    altTitle,
    newChaptersCount,
    isNew,
    comicLink,
    onLoad,
    onError,
  } = props;

  const isZeroProgress = useMemo(() => {
    if (comicLink) {
      const item = watchListStorage.getWatchList().find(i => i.link === comicLink);
      if (item) {
        const read = item.lastReadChapterIndex ?? item.lastReadChapterNumber ?? 0;
        return read === 0;
      }
    }
    return true;
  }, [comicLink]);

  const showNewBadge = useMemo(() => {
    if (typeof isNew === 'boolean') return isNew && isZeroProgress;
    if (comicLink) return watchListStorage.getNewComicStatus(comicLink);
    return false;
  }, [isNew, comicLink, isZeroProgress]);

  const unreadCount = useMemo(() => {
    if (typeof newChaptersCount === 'number') return newChaptersCount;
    if (comicLink) return watchListStorage.getUnreadChapterCount(comicLink);
    return 0;
  }, [newChaptersCount, comicLink]);

  const badgeInfo = useMemo(() => {
    if (showNewBadge && (!newChaptersCount || newChaptersCount === 0)) {
      return {text: 'NEW'};
    }
    if (unreadCount > 0) {
      return {text: `+${unreadCount}`};
    }
    if (showNewBadge) {
      return {text: 'NEW'};
    }
    return null;
  }, [showNewBadge, newChaptersCount, unreadCount]);

  const rawUri = extractThumbnailUrl(props);
  const upgradedUrl = useMemo(() => upgradeThumbnailUrl(rawUri), [rawUri]);

  // Stage 0: Attempt 1 (clean, zero custom Referer, identical to Hero banner)
  // Stage 1: Attempt 2 (with Referer: origin + '/')
  // Stage 2: Attempt 3 (rewritten via autoDomainResolver)
  const [currentUrl, setCurrentUrl] = useState<string>(upgradedUrl);
  const [headers, setHeaders] = useState<Record<string, string> | undefined>(
    undefined,
  );
  const [retryStage, setRetryStage] = useState<number>(0);
  const [hasError, setHasError] = useState<boolean>(!upgradedUrl);

  // Sync state when rawUri changes
  useEffect(() => {
    const nextUrl = upgradeThumbnailUrl(rawUri);
    setCurrentUrl(nextUrl);
    setHeaders(undefined); // Attempt 1: Always clean, NO Referer header
    setRetryStage(0);
    setHasError(!nextUrl);
  }, [rawUri]);

  // 3-Stage Image Fallback State Machine
  const handleImageError = useCallback(
    (e: any) => {
      if (!currentUrl) {
        setHasError(true);
        onError?.(e);
        return;
      }

      // Stage 0 -> Stage 1: Retry with Referer: apex domain + '/'
      if (retryStage === 0) {
        setRetryStage(1);
        try {
          const parsed = new URL(currentUrl);
          const parts = parsed.hostname.split('.');
          const apex = parts.length > 2 ? parts.slice(-2).join('.') : parsed.hostname;
          setHeaders({
            Referer: `${parsed.protocol}//${apex}/`,
            Origin: `${parsed.protocol}//${apex}`,
            'User-Agent': DEFAULT_UA,
          });
          return;
        } catch {
          // If URL parsing fails, proceed directly to stage 2
        }
      }

      // Stage 1 -> Stage 2: Retry through autoDomainResolver
      if (retryStage === 1) {
        setRetryStage(2);
        try {
          const resolved = autoDomainResolver.rewriteUrlWithResolvedDomain(
            rawUri || currentUrl,
          );
          if (resolved && resolved !== currentUrl) {
            setCurrentUrl(resolved);
            setHeaders(undefined);
            return;
          }
        } catch {}
      }

      // Stage 2 (or unrecoverable): All 3 attempts failed -> Show fallback icon
      setHasError(true);
      onError?.(e);
    },
    [currentUrl, rawUri, retryStage, onError],
  );

  const resizeMode = useMemo(() => {
    if (contentFit === 'contain') return 'contain';
    if (contentFit === 'fill') return 'stretch';
    return 'cover';
  }, [contentFit]);

  const containerStyle: StyleProp<ViewStyle> = useMemo(
    () => [
      styles.container,
      {
        width,
        borderRadius,
        aspectRatio: height ? undefined : aspectRatio,
        height,
      },
      style,
    ],
    [width, borderRadius, height, aspectRatio, style],
  );

  if (hasError || !currentUrl) {
    return (
      <View style={[containerStyle, styles.fallbackContainer]}>
        <MaterialCommunityIcons
          name="book-open-page-variant-outline"
          size={32}
          color="rgba(255, 255, 255, 0.3)"
        />
        {altTitle ? (
          <AppText
            numberOfLines={2}
            role="labelSmall"
            style={styles.fallbackTitle}>
            {altTitle}
          </AppText>
        ) : null}

        {/* Green +X New Chapters Badge or NEW Comic Badge */}
        {badgeInfo ? (
          <View style={styles.neonBadgeContainer}>
            <AppText role="labelSmallEmphasized" style={styles.neonBadgeText}>
              {badgeInfo.text}
            </AppText>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <ExpoImage
        source={{
          uri: currentUrl,
          ...(headers ? {headers} : {}),
        }}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        onLoad={onLoad}
        onError={handleImageError}
        style={[
          StyleSheet.absoluteFill,
          {width: '100%', height: '100%', borderRadius},
          imageStyle,
        ]}
      />

      {/* Green +X New Chapters Badge or NEW Comic Badge */}
      {badgeInfo ? (
        <View style={styles.neonBadgeContainer}>
          <AppText role="labelSmallEmphasized" style={styles.neonBadgeText}>
            {badgeInfo.text}
          </AppText>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#161618',
  },
  fallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#202024',
    padding: 8,
  },
  fallbackTitle: {
    color: 'rgba(255, 255, 255, 0.45)',
    textAlign: 'center',
    marginTop: 6,
    fontSize: 11,
  },
  neonBadgeContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    zIndex: 10,
    shadowColor: '#10B981',
    shadowOpacity: 0.55,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 5,
    elevation: 5,
  },
  neonBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 10.5,
    letterSpacing: 0.2,
  },
});

export default ComicThumbnail;
