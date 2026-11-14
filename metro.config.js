const {getDefaultConfig} = require('expo/metro-config');
const {withNativeWind} = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-google-cast': path.resolve(__dirname, 'src/lib/stubs/emptyStub.js'),
  'react-native-webrtc': path.resolve(__dirname, 'src/lib/stubs/emptyStub.js'),
  'react-native-video': path.resolve(__dirname, 'src/lib/stubs/emptyStub.js'),
};

module.exports = withNativeWind(config, {input: './src/global.css'});
