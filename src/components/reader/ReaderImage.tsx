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
    autoDomainResolver.rewriteUrlWithResolvedDomain(imageUrl),
  );
  useEffect(() => {
    setCurrentUrl(autoDomainResolver.rewriteUrlWithResolvedDomain(imageUrl));
  }, [imageUrl]);

  const [resolvedHeaders, setResolvedHeaders] = useState<Record<string, string> | undefined>();
  const [imageRatio, setImageRatio] = useState<number | undefined>(() => {
    if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
      return naturalWidth / naturalHeight;
    }
    return undefined;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [retryKey, setRetryKey] = useState<number>(0);

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

  // Compute layout dimensions
  const containerDimensions = useMemo(() => {
    if (isWebtoon) {
      const renderWidth = windowWidth;
      const renderHeight = imageRatio
        ? windowWidth / imageRatio
        : (naturalHeight && naturalWidth
            ? (windowWidth * naturalHeight) / naturalWidth
            : windowHeight * 0.85);
      return {width: renderWidth, height: renderHeight};
    }

    // Paged mode
    if (scaleMode === 'fit_height') {
      const renderHeight = windowHeight;
      const renderWidth = imageRatio ? windowHeight * imageRatio : windowWidth;
      return {width: renderWidth, height: renderHeight};
    }

    if (scaleMode === 'original' && naturalWidth && naturalHeight) {
      return {
        width: Math.min(naturalWidth, windowWidth),
        height: Math.min(naturalHeight, windowHeight),
      };
    }

    // Default: fit_width
    const renderWidth = windowWidth;
    const renderHeight = imageRatio
      ? Math.min(windowWidth / imageRatio, windowHeight)
      : windowHeight;
    return {width: renderWidth, height: renderHeight};
  }, [
    isWebtoon,
    windowWidth,
    windowHeight,
    imageRatio,
    naturalWidth,
    naturalHeight,
    scaleMode,
  ]);

  const resetZoom = useCallback(() => {
    'worklet';
    scale.value = withTiming(1, {duration: 200});
    translationX.value = withTiming(0, {duration: 200});
    translationY.value = withTiming(0, {duration: 200});
    savedScale.value = 1;
    savedTranslationX.value = 0;
    savedTranslationY.value = 0;
  }, [savedScale, savedTranslationX, savedTranslationY, scale, translationX, translationY]);

  // Single Tap Gesture (triggers tap zone / HUD toggle)
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(e => {
      if (onSingleTap) {
        onSingleTap(e.x, e.y);
      }
    });

  // Double Tap Gesture (1x <-> 2.5x anchored)
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(e => {
      if (scale.value > 1.2) {
        resetZoom();
      } else {
        const targetScale = 2.5;
        scale.value = withTiming(targetScale, {duration: 250});
        const centerX = containerDimensions.width / 2;
        const centerY = containerDimensions.height / 2;
        const targetX = (centerX - e.x) * (targetScale - 1);
        const targetY = (centerY - e.y) * (targetScale - 1);
        translationX.value = withTiming(targetX, {duration: 250});
        translationY.value = withTiming(targetY, {duration: 250});
        savedScale.value = targetScale;
        savedTranslationX.value = targetX;
        savedTranslationY.value = targetY;
      }
    });

  // Pinch Gesture
  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.max(0.8, Math.min(savedScale.value * e.scale, 4.5));
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
      }
    });

  // Pan Gesture (only pans when zoomed in)
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .onUpdate(e => {
      if (scale.value > 1.1) {
        translationX.value = savedTranslationX.value + e.translationX;
        translationY.value = savedTranslationY.value + e.translationY;
      }
    })
    .onEnd(() => {
      if (scale.value <= 1.1) {
        resetZoom();
      } else {
        savedTranslationX.value = translationX.value;
        savedTranslationY.value = translationY.value;
      }
    });

  const gesture = isWebtoon
    ? Gesture.Exclusive(doubleTapGesture, singleTapGesture)
    : Gesture.Race(
        Gesture.Exclusive(doubleTapGesture, singleTapGesture),
        Gesture.Simultaneous(pinchGesture, panGesture),
      );

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
          backgroundColor: themeColors.background,
        },
      ]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.imageWrapper,
            {
              width: containerDimensions.width,
              height: containerDimensions.height,
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
            cachePolicy="memory-disk"
            recyclingKey={currentUrl}
            onProgress={e => {
              if (e.total > 0) {
                setLoadProgress(e.loaded / e.total);
              }
            }}
            onLoad={e => {
              setLoading(false);
              setLoadError(false);
              if (e.source.width > 0 && e.source.height > 0) {
                setImageRatio(e.source.width / e.source.height);
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
