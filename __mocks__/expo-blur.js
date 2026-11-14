const React = require('react');
const { View } = require('react-native');

const BlurView = React.forwardRef((props, ref) =>
  React.createElement(View, { ...props, ref })
);

module.exports = {
  BlurView,
  __esModule: true,
  default: BlurView,
};
