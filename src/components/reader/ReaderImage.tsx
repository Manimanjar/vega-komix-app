import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {Image as ExpoImage} from 'expo-image';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Svg, {Circle} from 'react-native-svg';
import AppText from '../ui/Text';
import {resolvePageHeaders} from './usePagePreloader';
import {retryPageImageWithUpdatedHeaders} from '../../lib/aggregator/failoverLoader';
import {autoDomainResolver} from '../../lib/network/autoDomainResolver';
import {cleanHighResImageUrl} from '../../lib/reader/highResImageCleaner';
import type {ImageScale, ReaderTheme} from './types';
import {THEME_COLORS} from './types';
import {TranslatedBubbleOverlay} from './TranslatedBubbleOverlay';
import type {TranslatedBubble} from '../../lib/translator/mangaTranslatorEngine';

interface ReaderImageProps {
  imageUrl: string;
  index: number;
  width?: number;
  height?: number;
  headers?: Record<string, string>;
  scaleMode?: ImageScale;
  zoomScale?: number;
  reloadKey?: number;
  cropWhiteBorders?: boolean;
  theme?: ReaderTheme;
  isWebtoon?: boolean;
  activeBitmap?: boolean;
  translateEnabled?: boolean;
  translationBubbles?: TranslatedBubble[];
  onRetryTranslation?: () => void;
  onDoubleTap?: () => void;
  onSingleTap?: (tapX: number, tapY: number) => void;
}

const CircularProgress = ({
  progress,
  size = 54,
  strokeWidth = 4,
  color = '#7C4DFF',
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - circumference * Math.min(Math.max(progress, 0), 1);

  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <Svg width={size} height={size}>
        <Circle
          stroke="rgba(255, 255, 255, 0.15)"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <Circle
          stroke={color}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <AppText
        role="labelSmall"
        style={{
          position: 'absolute',
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: '700',
        }}>
        {Math.round(progress * 100)}%
      </AppText>
    </View>
  );
};

export const ReaderImage: React.FC<ReaderImageProps> = ({
  imageUrl,
  index,
  width: naturalWidth,
  height: naturalHeight,
  headers,
  scaleMode = 'fit_width',
  zoomScale = 1.0,
  reloadKey = 0,
  cropWhiteBorders = false,
  theme = 'amoled',
  isWebtoon = false,
  activeBitmap = true,
  translateEnabled = false,
  translationBubbles,
  onRetryTranslation,
  onSingleTap,
}) => {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const [currentUrl, setCurrentUrl] = useState<string>(() =>
    cleanHighResImageUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(imageUrl)),
  );
  useEffect(() => {
    setCurrentUrl(cleanHighResImageUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(imageUrl)));
  }, [imageUrl]);

  const [resolvedHeaders, setResolvedHeaders] = useState<Record<string, string> | undefined>();
  const [imageRatio, setImageRatio] = useState<number | undefined>(() => {
    if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
      return naturalWidth / naturalHeight;
    }
    return undefined;
  });
  const [calcHeight, setCalcHeight] = useState<number | undefined>(() => {
    if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
      return (windowWidth * naturalHeight) / naturalWidth;
    }
    return undefined;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [retryKey, setRetryKey] = useState<number>(0);

  // Trigger reload if reloadKey changes
  useEffect(() => {
    if (reloadKey > 0) {
      setLoading(true);
      setLoadError(false);
      setRetryKey(k => k + 1);
    }
  }, [reloadKey]);

  // Reanimated values for double tap zoom and pinch/pan
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translationX = useSharedValue(0);
  const savedTranslationX = useSharedValue(0);
  const translationY = useSharedValue(0);
  const savedTranslationY = useSharedValue(0);

  // Resolve native cookies and headers
  useEffect(() => {
    let active = true;
    resolvePageHeaders(currentUrl, headers).then(res => {
      if (active) {
        setResolvedHeaders(res);
      }
    });
    return () => {
      active = false;
    };
  }, [currentUrl, headers, retryKey]);

  // Compute layout dimensions with zoomScale and scaleMode
  const containerDimensions = useMemo(() => {
    const zoom = zoomScale || 1.0;

    if (isWebtoon) {
      const renderWidth = Math.round(windowWidth * zoom);
      const renderHeight =
        calcHeight ||
        (imageRatio
          ? renderWidth / imageRatio
          : naturalHeight && naturalWidth
          ? (renderWidth * naturalHeight) / naturalWidth
          : windowHeight * 0.8 * zoom);
      return {width: renderWidth, height: renderHeight};
    }

    // Paged mode
    if (scaleMode === 'fit_height') {
      const renderHeight = Math.round(windowHeight * zoom);
      const renderWidth = imageRatio ? Math.round(renderHeight * imageRatio) : Math.round(windowWidth * zoom);
      return {width: renderWidth, height: renderHeight};
    }

    if (scaleMode === 'fit_screen') {
      const maxWidth = Math.round(windowWidth * zoom);
      const maxHeight = Math.round(windowHeight * zoom);
      if (imageRatio) {
        if (maxWidth / imageRatio <= maxHeight) {
          return {width: maxWidth, height: Math.round(maxWidth / imageRatio)};
        } else {
          return {width: Math.round(maxHeight * imageRatio), height: maxHeight};
        }
      }
      return {width: maxWidth, height: maxHeight};
    }

    if (scaleMode === 'original' && naturalWidth && naturalHeight) {
      return {
        width: Math.min(Math.round(naturalWidth * zoom), Math.round(windowWidth * zoom)),
        height: Math.min(Math.round(naturalHeight * zoom), Math.round(windowHeight * zoom)),
      };
    }

    // Default: fit_width
    const renderWidth = Math.round(windowWidth * zoom);
    const renderHeight = imageRatio
      ? Math.min(Math.round(renderWidth / imageRatio), Math.round(windowHeight * zoom))
      : Math.round(windowHeight * zoom);
    return {width: renderWidth, height: renderHeight};
  }, [
    isWebtoon,
    windowWidth,
    windowHeight,
    calcHeight,
    imageRatio,
    naturalWidth,
    naturalHeight,
    scaleMode,
    zoomScale,
  ]);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, {duration: 200});
    translationX.value = withTiming(0, {duration: 200});
    translationY.value = withTiming(0, {duration: 200});
    savedScale.value = 1;
    savedTranslationX.value = 0;
    savedTranslationY.value = 0;
  }, [savedScale, savedTranslationX, savedTranslationY, scale, translationX, translationY]);

  // Single Tap Gesture (triggers tap zone / HUD toggle)
  // CRITICAL: runOnJS(true) ensures onSingleTap executes on JS thread, preventing native Android crash
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .runOnJS(true)
    .onEnd(e => {
      if (onSingleTap) {
        onSingleTap(e.x, e.y);
      }
    });

  // Double Tap Gesture (1x <-> 2x anchored)
  // CRITICAL: runOnJS(true) ensures zoom animation executes safely without worklet crash
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .runOnJS(true)
    .onEnd(e => {
      if (scale.value > 1.2) {
        resetZoom();
      } else {
        const targetScale = 2.0;
        scale.value = withTiming(targetScale, {duration: 250});
        const centerX = windowWidth / 2;
        const centerY = windowHeight / 2;
        const targetX = Math.max(-windowWidth * 0.5, Math.min(windowWidth * 0.5, (centerX - e.x)));
        const targetY = Math.max(-windowHeight * 0.5, Math.min(windowHeight * 0.5, (centerY - e.y)));
        translationX.value = withTiming(targetX, {duration: 250});
        translationY.value = withTiming(targetY, {duration: 250});
        savedScale.value = targetScale;
        savedTranslationX.value = targetX;
        savedTranslationY.value = targetY;
      }
    });

  const gesture = Gesture.Exclusive(doubleTapGesture, singleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {translateX: translationX.value},
      {translateY: translationY.value},
      {scale: scale.value},
    ],
  }));

  const themeColors = THEME_COLORS[theme];

  if (!activeBitmap) {
    return (
      <View
        style={[
          styles.container,
          {
            width: containerDimensions.width,
            height: containerDimensions.height,
            backgroundColor: themeColors.background,
          },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: containerDimensions.width,
          height: containerDimensions.height,
          backgroundColor: '#000000',
        },
      ]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.imageWrapper,
            {
              width: containerDimensions.width,
              height: containerDimensions.height,
              backgroundColor: '#000000',
              overflow: cropWhiteBorders ? 'hidden' : 'visible',
            },
            animatedStyle,
          ]}>
          <ExpoImage
            key={`${currentUrl}-${retryKey}`}
            source={{
              uri: currentUrl,
              headers: resolvedHeaders,
            }}
            contentFit={isWebtoon ? 'fill' : scaleMode === 'fit_height' ? 'contain' : 'contain'}
            priority="high"
            recyclingKey={currentUrl}
            enableLiveTextInteraction={false}
            allowDownscaling={false}
            decodeFormat="argb"
            cachePolicy="memory-disk"
            onProgress={e => {
              if (e.total > 0) {
                setLoadProgress(e.loaded / e.total);
              }
            }}
            onLoad={e => {
              setLoading(false);
              setLoadError(false);
              const src = e.source;
              if (src && src.width > 0 && src.height > 0) {
                setImageRatio(src.width / src.height);
                if (isWebtoon) {
                  setCalcHeight((windowWidth * src.height) / src.width);
                }
              }
            }}
            onError={() => {
              retryPageImageWithUpdatedHeaders({
                index,
                imageUrl: currentUrl,
                headers: resolvedHeaders,
              })
                .then(updated => {
                  if (updated.imageUrl !== currentUrl) {
                    setCurrentUrl(updated.imageUrl);
                    if (updated.headers) setResolvedHeaders(updated.headers);
                    setLoading(true);
                    setLoadError(false);
                    setRetryKey(k => k + 1);
                  } else {
                    setLoading(false);
                    setLoadError(true);
                  }
                })
                .catch(() => {
                  setLoading(false);
                  setLoadError(true);
                });
            }}
            style={[
              StyleSheet.absoluteFill,
              cropWhiteBorders && {
                margin: -4,
              },
            ]}
          />

          {translateEnabled && translationBubbles && translationBubbles.length > 0 && (
            <TranslatedBubbleOverlay
              bubbles={translationBubbles}
              renderedWidth={containerDimensions.width}
              renderedHeight={containerDimensions.height}
              visible={true}
              onRetryBubble={onRetryTranslation}
            />
          )}
        </Animated.View>
      </GestureDetector>

      {/* Loading Progress Overlay */}
      {loading && !loadError && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <CircularProgress progress={loadProgress || 0.15} />
          <AppText
            role="labelMedium"
            style={{color: themeColors.subText, marginTop: 12}}>
            Page {index + 1}
          </AppText>
        </View>
      )}

      {/* Error & Retry State */}
      {loadError && (
        <View style={styles.centerOverlay}>
          <MaterialCommunityIcons
            name="image-broken-variant"
            size={40}
            color="#FF5252"
          />
          <AppText
            role="bodyMedium"
            style={{color: '#FF5252', marginTop: 8, textAlign: 'center'}}>
            Failed to load page {index + 1}
          </AppText>
          <Pressable
            onPress={() => {
              setLoading(true);
              setLoadError(false);
              setLoadProgress(0);
              retryPageImageWithUpdatedHeaders({
                index,
                imageUrl: currentUrl,
                headers: resolvedHeaders,
              })
                .then(updated => {
                  if (updated.imageUrl !== currentUrl) {
                    setCurrentUrl(updated.imageUrl);
                    if (updated.headers) setResolvedHeaders(updated.headers);
                  }
                  setRetryKey(k => k + 1);
                })
                .catch(() => {
                  setRetryKey(k => k + 1);
                });
            }}
            style={styles.retryButton}>
            <MaterialCommunityIcons name="reload" size={16} color="#FFFFFF" />
            <AppText role="labelLargeEmphasized" style={{color: '#FFFFFF'}}>
              Retry
            </AppText>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 5,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: '#7C4DFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
});
