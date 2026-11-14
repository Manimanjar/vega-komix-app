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
  source?: string | {uri?: string; headers?: Record<string, string>};
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

/**
 * Automatically upgrades low-res image thumbnails to high-res covers
 * - MangaDex: .256.jpg -> .512.jpg
 * - Protocol-relative // -> https://
 * - Generic CDN thumbnail size params
 */
export const upgradeThumbnailUrl = (rawUrl?: string): string => {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();

  // Fix protocol-relative URLs
  if (url.startsWith('//')) {
    url = `https:${url}`;
  }

  // Upgrade MangaDex cover sizes
  if (url.includes('mangadex.org') || url.includes('/covers/')) {
    url = url
      .replace(/\.256\.(jpg|png|webp)/gi, '.512.$1')
      .replace(/\.thumb\.(jpg|png|webp)/gi, '.$1');
  }

  // Upgrade generic thumbnail patterns
  url = url
    .replace(/([?&])(?:w|width)=\d+/gi, '$1width=600')
    .replace(/([?&])(?:h|height)=\d+/gi, '$1height=900');

  // Pass through AutoDomainResolver
  return autoDomainResolver.rewriteUrlWithResolvedDomain(url);
};

export const ComicThumbnail: React.FC<ComicThumbnailProps> = ({
  source,
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
  const rawUri = typeof source === 'string' ? source : source?.uri;
  const initialHeaders = typeof source === 'object' ? source?.headers : undefined;

  const upgradedUrl = useMemo(() => upgradeThumbnailUrl(rawUri), [rawUri]);

  const [currentUrl, setCurrentUrl] = useState<string>(upgradedUrl);
  const [retryStage, setRetryStage] = useState<number>(0);
  const [hasError, setHasError] = useState<boolean>(false);
  const [headers, setHeaders] = useState<Record<string, string>>(() => {
    if (!upgradedUrl || !upgradedUrl.startsWith('http')) return initialHeaders || {};
    try {
      const origin = new URL(upgradedUrl).origin;
      const cached = headersCache.get(origin);
      if (cached) {
        return {...cached, ...(initialHeaders || {})};
      }
      return {
        Referer: `${origin}/`,
        Origin: origin,
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        ...(initialHeaders || {}),
      };
    } catch {
      return initialHeaders || {};
    }
  });

  // Keep currentUrl in sync when source changes
  useEffect(() => {
    const nextUrl = upgradeThumbnailUrl(rawUri);
    setCurrentUrl(nextUrl);
    setRetryStage(0);
    setHasError(!nextUrl);
  }, [rawUri]);

  // Inject cookies from @preeternal/react-native-cookie-manager
  useEffect(() => {
    if (!currentUrl || !currentUrl.startsWith('http')) return;

    let isMounted = true;
    (async () => {
      try {
        const origin = new URL(currentUrl).origin;
        const cookieHeader = await getCookieHeader(currentUrl);

        if (isMounted) {
          const resolved: Record<string, string> = {
            Referer: `${origin}/`,
            Origin: origin,
            'User-Agent':
              'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            ...(initialHeaders || {}),
          };

          if (cookieHeader) {
            resolved.Cookie = cookieHeader;
          }

          headersCache.set(origin, resolved);
          setHeaders(resolved);
        }
      } catch (err) {
        // Silently continue with existing headers
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [currentUrl, initialHeaders]);

  const handleImageError = useCallback(
    (e: any) => {
      if (!currentUrl) {
        setHasError(true);
        onError?.(e);
        return;
      }

      // Retry policy:
      // Stage 0: Failed with Origin Referer -> Stage 1: Try without Referer
      // Stage 1: Failed without Referer -> Stage 2: Try original raw URL (un-upgraded)
      // Stage 2: Failed -> Mark hasError
      if (retryStage === 0) {
        setRetryStage(1);
        setHeaders(prev => {
          const updated = {...prev};
          delete updated.Referer;
          delete updated.Origin;
          return updated;
        });
      } else if (retryStage === 1 && rawUri && rawUri !== currentUrl) {
        setRetryStage(2);
        setCurrentUrl(rawUri);
      } else {
        setHasError(true);
        onError?.(e);
      }
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
