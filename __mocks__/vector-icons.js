const React = require('react');
const { Text } = require('react-native');

const MockIcon = React.forwardRef((props, ref) => {
  return React.createElement(Text, { ...props, ref }, props.name || '');
});

MockIcon.default = MockIcon;

module.exports = MockIcon;
module.exports.default = MockIcon;
module.exports.MaterialCommunityIcons = MockIcon;
module.exports.Ionicons = MockIcon;
module.exports.FontAwesome = MockIcon;
module.exports.Feather = MockIcon;
module.exports.AntDesign = MockIcon;
module.exports.Entypo = MockIcon;
module.exports.MaterialIcons = MockIcon;
