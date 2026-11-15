import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  DimensionValue,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {Image as ExpoImage, ImageStyle} from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {autoDomainResolver} from '../lib/network/autoDomainResolver';
import {getCookieHeader} from '../lib/services/cookieManager';
import AppText from './ui/Text';

export interface ComicThumbnailProps {
  source?:
    | string
    | {
        uri?: string;
        image?: string;
        poster?: string;
        cover?: string;
        headers?: Record<string, string>;
      };
  uri?: string;
  image?: string;
  poster?: string;
  cover?: string;
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
  placeholder?: ImageSourcePropType;
  onLoad?: () => void;
  onError?: (error: any) => void;
}

// In-memory cache for resolved headers by origin
const headersCache = new Map<string, Record<string, string>>();

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

/**
 * Automatically upgrades low-res image thumbnails to high-res covers
 * - Protocol-relative // -> https://
 * - Preserves MangaDex URLs intact without regex corruption
 * - Generic CDN thumbnail size params
 */
export const upgradeThumbnailUrl = (rawUrl?: string): string => {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();

  // Fix protocol-relative URLs
  if (url.startsWith('//')) {
    url = `https:${url}`;
  }

  // Do NOT corrupt MangaDex cover URLs with broken regex replacements
  if (url.includes('mangadex.org') || url.includes('/covers/')) {
    return url;
  }

  // Upgrade generic thumbnail patterns
  url = url
    .replace(/([?&])(?:w|width)=\d+/gi, '$1width=600')
    .replace(/([?&])(?:h|height)=\d+/gi, '$1height=900');

  return url;
};

const getAttempt1Headers = (
  url?: string,
  initialHeaders?: Record<string, string>,
): Record<string, string> | undefined => {
  if (!url || !url.startsWith('http')) return initialHeaders;
  const isMangaDex =
    url.includes('mangadex.org') || url.includes('uploads.mangadex.org');

  if (isMangaDex) {
    // Attempt 1 for MangaDex: Only standard UA, never send cross-origin Referer
    return {
      'User-Agent': DEFAULT_UA,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      ...(initialHeaders || {}),
    };
  }

  try {
    const origin = new URL(url).origin;
    const cached = headersCache.get(origin);
    if (cached) {
      return {...cached, ...(initialHeaders || {})};
    }
    return {
      Referer: `${origin}/`,
      Origin: origin,
      'User-Agent': DEFAULT_UA,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      ...(initialHeaders || {}),
    };
  } catch {
    return initialHeaders;
  }
};

export const ComicThumbnail: React.FC<ComicThumbnailProps> = ({
  source,
  uri,
  image,
  poster,
  cover,
  width = '100%',
  height,
  aspectRatio = 2 / 3,
  borderRadius = 14,
  style,
  imageStyle,
  contentFit = 'cover',
  priority = 'normal',
  recyclingKey,
  altTitle,
  placeholder,
  onLoad,
  onError,
}) => {
  // Support fallback image props: uri || image || poster || cover
  const rawUri =
    (typeof source === 'string'
      ? source
      : source?.uri || source?.image || source?.poster || source?.cover) ||
    uri ||
    image ||
    poster ||
    cover ||
    '';

  const initialHeaders =
    typeof source === 'object' && source !== null ? source.headers : undefined;

  const upgradedUrl = useMemo(() => upgradeThumbnailUrl(rawUri), [rawUri]);

  const [currentUrl, setCurrentUrl] = useState<string>(upgradedUrl);
  const [retryStage, setRetryStage] = useState<number>(0);
  const [hasError, setHasError] = useState<boolean>(!upgradedUrl);
  const [headers, setHeaders] = useState<Record<string, string> | undefined>(
    () => getAttempt1Headers(upgradedUrl, initialHeaders),
  );

  // Sync state when rawUri or source changes
  useEffect(() => {
    const nextUrl = upgradeThumbnailUrl(rawUri);
    setCurrentUrl(nextUrl);
    setRetryStage(0);
    setHasError(!nextUrl);
    setHeaders(getAttempt1Headers(nextUrl, initialHeaders));
  }, [rawUri, initialHeaders]);

  // Inject cookies from @preeternal/react-native-cookie-manager for scraper providers
  useEffect(() => {
    if (!currentUrl || !currentUrl.startsWith('http')) return;
    if (retryStage > 0) return; // Do not inject custom headers on retry stages

    const isMangaDex =
      currentUrl.includes('mangadex.org') ||
      currentUrl.includes('uploads.mangadex.org');
    if (isMangaDex) return; // Never send cross-origin cookies or referers to MangaDex

    let isMounted = true;
    (async () => {
      try {
        const origin = new URL(currentUrl).origin;
        const cookieHeader = await getCookieHeader(currentUrl);

        if (isMounted) {
          const resolved: Record<string, string> = {
            Referer: `${origin}/`,
            Origin: origin,
            'User-Agent': DEFAULT_UA,
            Accept:
              'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            ...(initialHeaders || {}),
          };

          if (cookieHeader) {
            resolved.Cookie = cookieHeader;
          }

          headersCache.set(origin, resolved);
          setHeaders(resolved);
        }
      } catch {
        // Silently continue
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [currentUrl, initialHeaders, retryStage]);

  // 3-Stage Image Fallback State Machine
  const handleImageError = useCallback(
    (e: any) => {
      if (!currentUrl) {
        setHasError(true);
        onError?.(e);
        return;
      }

      // Stage 0 -> Stage 1: Retry raw original URL with zero custom headers
      if (retryStage === 0) {
        setRetryStage(1);
        setCurrentUrl(rawUri || currentUrl);
        setHeaders(undefined);
        return;
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
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <ExpoImage
        source={{
          uri: currentUrl,
          headers,
        }}
        contentFit={contentFit}
        priority={priority}
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey || currentUrl}
        placeholder={placeholder}
        transition={150}
        onLoad={onLoad}
        onError={handleImageError}
        style={[
          StyleSheet.absoluteFill,
          {borderRadius},
          imageStyle,
        ]}
      />
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
});

export default ComicThumbnail;
