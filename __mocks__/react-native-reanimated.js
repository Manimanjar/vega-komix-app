const React = require('react');
const { View, Text, Image, ScrollView } = require('react-native');

const useSharedValue = (initial) => ({ value: initial });
const useAnimatedStyle = (fn) => (fn ? fn() : {});
const withTiming = (toValue, config, cb) => {
  if (cb) cb(true);
  return toValue;
};
const withSpring = (toValue, config, cb) => {
  if (cb) cb(true);
  return toValue;
};
const runOnJS = (fn) => fn;

const createAnimatedComponent = (Comp) => Comp;

const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  createAnimatedComponent,
  timing: () => ({ start: (cb) => cb && cb() }),
  spring: () => ({ start: (cb) => cb && cb() }),
  Value: function (v) {
    this.value = v;
  },
};

const LayoutAnimation = {
  duration: () => LayoutAnimation,
  delay: () => LayoutAnimation,
  springify: () => LayoutAnimation,
  damping: () => LayoutAnimation,
  stiffness: () => LayoutAnimation,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  createAnimatedComponent,
  FadeIn: LayoutAnimation,
  FadeOut: LayoutAnimation,
  FadeInDown: LayoutAnimation,
  FadeInUp: LayoutAnimation,
  SlideInDown: LayoutAnimation,
  SlideInUp: LayoutAnimation,
  SlideOutDown: LayoutAnimation,
  SlideOutUp: LayoutAnimation,
  LinearTransition: LayoutAnimation,
};
