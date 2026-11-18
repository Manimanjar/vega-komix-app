import React, {useCallback} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';

// Layout props that must live on the direct flex child (the Pressable)
// for the parent to size it. Before this fix the whole `style` went only
// to the inner Animated.View, so a `width: '48%'` card inside a wrapping
// row measured its parent (the Pressable, which had no width) and came
// out narrow — the Reader Settings fit buttons wrapped letter by letter
// and the Quick Tools cards became tall empty bars (user, 2026-11-18).
const LAYOUT_PROPS = new Set([
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'margin',
  'marginHorizontal',
  'marginVertical',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
]);

/**
 * A pressable that gives a soft fluid "squish" when touched: it shrinks to
 * 95% while pressed and springs back on release. All animation runs on the
 * UI thread (reanimated), so it never blocks scrolling or decoding, and it
 * costs nothing when idle. Use it for the reader's tappable cards, pills
 * and buttons so every tap feels alive without any lag.
 */
export const PressScale: React.FC<{
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  disabled?: boolean;
  accessibilityLabel?: string;
}> = ({children, onPress, style, disabled, accessibilityLabel}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  const pressIn = useCallback(() => {
    scale.value = withSpring(0.95, {damping: 18, stiffness: 400});
  }, [scale]);

  const pressOut = useCallback(() => {
    scale.value = withSpring(1, {damping: 14, stiffness: 300});
  }, [scale]);

  // Flatten (style may be an array) and split off the layout props for
  // the outer Pressable; the inner view keeps the full style so the
  // appearance and the press-scale transform still cover the whole card.
  const flatStyle = StyleSheet.flatten(style) || {};
  const pressableStyle: Record<string, any> = {};
  for (const key of Object.keys(flatStyle)) {
    if (LAYOUT_PROPS.has(key)) pressableStyle[key] = (flatStyle as any)[key];
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={pressableStyle}>
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
};

/** The next reading mode in the HUD pill cycle: Continuous -> Page by Page
 * (Western comics) -> Manga -> Continuous. The first tap out of Continuous
 * always lands on the paged mode, so a Western comic never opens in the
 * manga direction by accident; manga is still one more tap away. Both
 * paged modes turn pages the same way — swipe right-to-left for the next
 * page, from page 1 onward — because that is the user's habit. What makes
 * Manga different is the reading order inside spreads (right page first,
 * right half first), not the swipe. Pure function, unit-tested. */
export const nextReadingMode = (
  current: 'webtoon' | 'manga' | 'comic' | 'double_spread',
): 'webtoon' | 'manga' | 'comic' => {
  if (current === 'webtoon') return 'comic';
  if (current === 'comic') return 'manga';
  return 'webtoon';
};
