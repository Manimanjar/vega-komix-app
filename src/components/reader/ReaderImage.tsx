import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
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
  onRatioMeasured?: (ratio: number) => void;
  highQualityRendering?: boolean;
  /** Called when this page's image has decoded. ReaderScreen counts these
      for the chapter load progress shown in the page-number pill. */
  onPageLoaded?: (index: number) => void;
  /** Width the image may occupy in paged mode (full window by default;
      half the window for double-spread pairs). */
  maxWidth?: number;
  onZoomChange?: (newScale: number) => void;
  onSwipeNextPage?: () => void;
  onSwipePrevPage?: () => void;
  hudVisible?: boolean;
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
  onRatioMeasured,
  highQualityRendering = true,
  onPageLoaded,
  maxWidth,
  onZoomChange,
  onSwipeNextPage,
  onSwipePrevPage,
  hudVisible = false,
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
  // Soft fade-in when the image decodes, so a page turn melts in instead of
  // popping — part of the fluid page-turn feel.
  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = 0;
  }, [currentUrl, retryKey, fade]);

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
    // Paged frame width: the full window for single pages, half the window
    // for double-spread pairs (passed in as maxWidth).
    const frameWidth = maxWidth ?? windowWidth;

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
    // Full Screen fills the whole physical display edge to edge; the image
    // cover-crops to the frame (see contentFit below).
    if (scaleMode === 'full_screen') {
      return {
        width: Math.round(frameWidth * zoom),
        height: Math.round(windowHeight * zoom),
      };
    }

    if (scaleMode === 'fit_height') {
      const renderHeight = Math.round(windowHeight * zoom);
      const renderWidth = imageRatio ? Math.round(renderHeight * imageRatio) : Math.round(frameWidth * zoom);
      return {width: renderWidth, height: renderHeight};
    }

    // 'original' shares this branch with 'fit_screen': never stretched,
    // never cropped, never a small image lost in the centre — the only box
    // that satisfies all three is a proportional fit inside the frame.
    if (scaleMode === 'fit_screen' || scaleMode === 'original') {
      const fitMaxWidth = Math.round(frameWidth * zoom);
      const maxHeight = Math.round(windowHeight * zoom);
      if (imageRatio) {
        if (fitMaxWidth / imageRatio <= maxHeight) {
          return {width: fitMaxWidth, height: Math.round(fitMaxWidth / imageRatio)};
        } else {
          return {width: Math.round(maxHeight * imageRatio), height: maxHeight};
        }
      }
      return {width: fitMaxWidth, height: maxHeight};
    }

    // Default: fit_width — width fills the frame and the height follows the
    // aspect ratio, even if that runs taller than the screen (the page then
    // centre-crops top and bottom). It is NOT clamped to the screen height:
    // clamping made fit-width identical to fit-screen for tall pages.
    const renderWidth = Math.round(frameWidth * zoom);
    const renderHeight = imageRatio
      ? Math.round(renderWidth / imageRatio)
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
    maxWidth,
  ]);

  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  // Layout boundaries: available frame width vs scaled content
  const frameWidth = maxWidth ?? windowWidth;
  const totalWidth = containerDimensions.width * scale.value;
  const totalHeight = containerDimensions.height * scale.value;
  const maxTransX = Math.max(0, (totalWidth - frameWidth) / 2);
  const maxTransY = Math.max(0, (totalHeight - windowHeight) / 2);
  const isMagnified = maxTransX > 6 || maxTransY > 6 || (zoomScale ?? 1.0) > 1.05 || scale.value > 1.05 || isZoomed;

  const atRightBorder = useSharedValue<boolean>(false);
  const atLeftBorder = useSharedValue<boolean>(false);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, {duration: 200});
    translationX.value = withTiming(0, {duration: 200});
    translationY.value = withTiming(0, {duration: 200});
    savedScale.value = 1;
    savedTranslationX.value = 0;
    savedTranslationY.value = 0;
    setIsZoomed(false);
  }, [savedScale, savedTranslationX, savedTranslationY, scale, translationX, translationY]);

  // Two-Finger Pinch-to-Zoom Gesture (website-grade smooth zoom)
  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate(e => {
      const target = Math.max(0.6, Math.min(4.0, savedScale.value * e.scale));
      scale.value = target;
      if (target > 1.05 && !isZoomed) {
        setIsZoomed(true);
      }
    })
    .onEnd(() => {
      const base = zoomScale || 1.0;
      const committed = Math.round(Math.max(0.6, Math.min(3.5, base * scale.value)) * 100) / 100;
      scale.value = withTiming(1, {duration: 150});
      savedScale.value = 1;
      if (Math.abs(committed - base) > 0.05) {
        onZoomChange?.(committed);
      } else if (committed <= 1.05) {
        resetZoom();
      }
    });

  // Pan Gesture: requires 2 fingers to scroll/pan towards borders,
  // reserving 1-finger swipe strictly for page-turning in PagedView without gesture conflict.
  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    .maxPointers(2)
    .enabled(isMagnified)
    .onStart(() => {
      savedTranslationX.value = translationX.value;
      savedTranslationY.value = translationY.value;
      // Record if we are already resting at or near the image border
      atRightBorder.value = maxTransX > 0 && translationX.value <= -maxTransX + 10;
      atLeftBorder.value = maxTransX > 0 && translationX.value >= maxTransX - 10;
    })
    .onUpdate(e => {
      const nextX = savedTranslationX.value + e.translationX;
      const nextY = savedTranslationY.value + e.translationY;

      // Horizontal panning with resistance past image boundaries
      if (maxTransX > 0) {
        if (nextX < -maxTransX) {
          translationX.value = -maxTransX + (nextX - (-maxTransX)) * 0.25;
        } else if (nextX > maxTransX) {
          translationX.value = maxTransX + (nextX - maxTransX) * 0.25;
        } else {
          translationX.value = nextX;
        }
      } else {
        translationX.value = e.translationX * 0.25;
      }

      // Vertical panning with resistance past image boundaries
      if (maxTransY > 0) {
        if (nextY < -maxTransY) {
          translationY.value = -maxTransY + (nextY - (-maxTransY)) * 0.25;
        } else if (nextY > maxTransY) {
          translationY.value = maxTransY + (nextY - maxTransY) * 0.25;
        } else {
          translationY.value = nextY;
        }
      }
    })
    .onEnd(e => {
      const boundedX = maxTransX > 0 ? Math.max(-maxTransX, Math.min(maxTransX, translationX.value)) : 0;
      const boundedY = maxTransY > 0 ? Math.max(-maxTransY, Math.min(maxTransY, translationY.value)) : 0;
      translationX.value = withTiming(boundedX, {duration: 150});
      translationY.value = withTiming(boundedY, {duration: 150});
      savedTranslationX.value = boundedX;
      savedTranslationY.value = boundedY;

      // Phone Gallery Style: If swiping past border, advance/retreat page
      const swipedLeft = e.translationX < -40 || e.velocityX < -350;
      const swipedRight = e.translationX > 40 || e.velocityX > 350;

      if (swipedLeft && (atRightBorder.value || maxTransX === 0)) {
        onSwipeNextPage?.();
      } else if (swipedRight && (atLeftBorder.value || maxTransX === 0)) {
        onSwipePrevPage?.();
      }
    });

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

  // Double Tap Gesture (1x <-> 2.0x anchored)
  // Disabled while HUD is showing so quick taps to hide HUD never reset zoom.
  // CRITICAL: runOnJS(true) ensures zoom animation executes safely without worklet crash
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .enabled(!hudVisible)
    .runOnJS(true)
    .onEnd(e => {
      if (hudVisible) {
        onSingleTap?.(e.x, e.y);
        return;
      }
      const base = zoomScale || 1.0;
      if (base > 1.2 || scale.value > 1.2) {
        resetZoom();
        onZoomChange?.(1.0);
      } else {
        const targetScale = 2.0;
        scale.value = withTiming(targetScale, {duration: 250});
        const centerX = windowWidth / 2;
        const centerY = windowHeight / 2;
        const targetX = Math.max(-maxTransX, Math.min(maxTransX, (centerX - e.x) * 1.5));
        const targetY = Math.max(-maxTransY, Math.min(maxTransY, (centerY - e.y) * 1.5));
        translationX.value = withTiming(targetX, {duration: 250});
        translationY.value = withTiming(targetY, {duration: 250});
        savedScale.value = targetScale;
        savedTranslationX.value = targetX;
        savedTranslationY.value = targetY;
        setIsZoomed(true);
        onZoomChange?.(targetScale);
      }
    });

  const zoomGestures = Gesture.Simultaneous(pinchGesture, panGesture);
  const tapGestures = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
  const gesture = Gesture.Simultaneous(zoomGestures, tapGestures);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      {translateX: translationX.value},
      {translateY: translationY.value},
      {scale: scale.value},
    ],
  }));

  const themeColors = THEME_COLORS[theme];

  const viewportWidth = isWebtoon ? containerDimensions.width : frameWidth;
  const viewportHeight = isWebtoon ? containerDimensions.height : windowHeight;

  if (!activeBitmap) {
    return (
      <View
        style={[
          styles.container,
          {
            width: viewportWidth,
            height: viewportHeight,
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
          width: viewportWidth,
          height: viewportHeight,
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
              backgroundColor: themeColors.background,
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
            contentFit={isWebtoon ? 'fill' : scaleMode === 'full_screen' ? 'cover' : 'contain'}
            priority={highQualityRendering ? 'high' : 'normal'}
            recyclingKey={currentUrl}
            enableLiveTextInteraction={false}
            // High-quality ON (default): full original resolution, 32-bit
            // ARGB, no downscaling. OFF: the decoder may downscale to the
            // view size and uses 16-bit RGB — roughly half the bitmap memory
            // per page, which is what makes big chapters scroll smoothly.
            allowDownscaling={!highQualityRendering}
            decodeFormat={highQualityRendering ? 'argb' : 'rgb'}
            cachePolicy="memory-disk"
            // Throttled to 5% steps: a setState per network chunk re-rendered
            // this image on every progress event while scrolling.
            onProgress={e => {
              if (e.total > 0) {
                const progress = e.loaded / e.total;
                setLoadProgress(prev =>
                  Math.floor(progress * 20) !== Math.floor(prev * 20)
                    ? progress
                    : prev,
                );
              }
            }}
            onLoad={e => {
              setLoading(false);
              setLoadError(false);
              fade.value = withTiming(1, {duration: 200});
              onPageLoaded?.(index);
              const src = e.source;
              if (src && src.width > 0 && src.height > 0) {
                const ratio = src.width / src.height;
                setImageRatio(ratio);
                onRatioMeasured?.(ratio);
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
    overflow: 'hidden',
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
