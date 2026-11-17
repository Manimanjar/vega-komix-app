import React, {useCallback} from 'react';
import {Pressable} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';

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

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}>
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
};

/** The next reading mode in the HUD pill cycle: Continuous -> Page by Page
 * (left-to-right, Western comics) -> Manga RTL -> Continuous. The first tap
 * out of Continuous always lands on the left-to-right paged mode, so a
 * Western comic never opens in the right-to-left manga direction by
 * accident; manga is still one more tap away. Pure function, unit-tested. */
export const nextReadingMode = (
  current: 'webtoon' | 'manga' | 'comic' | 'double_spread',
): 'webtoon' | 'manga' | 'comic' => {
  if (current === 'webtoon') return 'comic';
  if (current === 'comic') return 'manga';
  return 'webtoon';
};
