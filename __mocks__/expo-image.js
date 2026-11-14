const React = require('react');
const { Image } = require('react-native');

const ExpoImage = React.forwardRef((props, ref) => {
  return React.createElement(Image, { ...props, ref });
});

module.exports = {
  Image: ExpoImage,
  __esModule: true,
  default: ExpoImage,
};
