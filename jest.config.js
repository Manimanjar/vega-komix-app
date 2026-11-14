module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native(-.*)?|@react-native(-.*)?|@react-navigation(-.*)?|@?expo.*|@dr\\.pogodin)/)',
  ],
  setupFiles: ['./node_modules/react-native-gesture-handler/jestSetup.js'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
    '^react-native-video$': '<rootDir>/__mocks__/react-native-video.js',
    '^react-native-linear-gradient$':
      '<rootDir>/__mocks__/react-native-linear-gradient.js',
    '^react-native-image-colors$':
      '<rootDir>/__mocks__/react-native-image-colors.js',
    '^react-native-haptic-feedback$':
      '<rootDir>/__mocks__/react-native-haptic-feedback.js',
    '^react-native-reanimated$':
      '<rootDir>/__mocks__/react-native-reanimated.js',
    '^react-native-mmkv-storage$':
      '<rootDir>/__mocks__/react-native-mmkv-storage.js',
    '^@dr\\.pogodin/react-native-fs$':
      '<rootDir>/__mocks__/@dr.pogodin/react-native-fs.js',
    '^expo-image$': '<rootDir>/__mocks__/expo-image.js',
    '^expo-blur$': '<rootDir>/__mocks__/expo-blur.js',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.js',
    '^expo-file-system(/.*)?$': '<rootDir>/__mocks__/expo-file-system.js',
    '^@expo/vector-icons(/.*)?$': '<rootDir>/__mocks__/vector-icons.js',
    '^@expo/ui/jetpack-compose$':
      '<rootDir>/__mocks__/expo-ui-jetpack-compose.js',
    '^@expo/ui/jetpack-compose/modifiers$':
      '<rootDir>/__mocks__/expo-ui-jetpack-compose-modifiers.js',
  },
};
