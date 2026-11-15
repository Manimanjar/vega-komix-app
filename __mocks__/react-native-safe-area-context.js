const React = require('react');
const { View } = require('react-native');

const insets = { top: 0, left: 0, right: 0, bottom: 0 };

module.exports = {
  SafeAreaProvider: ({ children }) => React.createElement(View, null, children),
  SafeAreaView: ({ children, ...props }) => React.createElement(View, props, children),
  useSafeAreaInsets: () => insets,
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  initialWindowMetrics: {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets,
  },
};
