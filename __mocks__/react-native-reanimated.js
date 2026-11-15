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
  addWhitelistedUIProps: () => {},
  addWhitelistedNativeProps: () => {},
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

const Easing = {
  linear: t => t,
  ease: t => t,
  quad: t => t,
  cubic: t => t,
  poly: () => t => t,
  sin: t => t,
  circle: t => t,
  exp: t => t,
  elastic: () => t => t,
  back: () => t => t,
  bounce: t => t,
  bezier: () => t => t,
  in: easing => easing || (t => t),
  out: easing => easing || (t => t),
  inOut: easing => easing || (t => t),
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  Easing,
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
