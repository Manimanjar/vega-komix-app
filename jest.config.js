module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native(-.*)?|@react-native(-.*)?|@react-navigation(-.*)?|@?expo.*|@dr\\.pogodin)/)',
  ],
  setupFiles: [
    './node_modules/react-native-gesture-handler/jestSetup.js',
    './jest.setup.js',
  ],
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
    '^expo-document-picker$': '<rootDir>/__mocks__/expo-document-picker.js',
    '^expo-constants$': '<rootDir>/__mocks__/expo-constants.js',
    '^@expo/vector-icons(/.*)?$': '<rootDir>/__mocks__/vector-icons.js',
    '^@expo/ui/jetpack-compose$':
      '<rootDir>/__mocks__/expo-ui-jetpack-compose.js',
    '^@expo/ui/jetpack-compose/modifiers$':
      '<rootDir>/__mocks__/expo-ui-jetpack-compose-modifiers.js',
    '^@preeternal/react-native-cookie-manager$':
      '<rootDir>/__mocks__/@preeternal/react-native-cookie-manager.js',
    '^@notifee/react-native$':
      '<rootDir>/__mocks__/@notifee/react-native.js',
    '^@himanshu8443/react-native-apk-installer$':
      '<rootDir>/__mocks__/@himanshu8443/react-native-apk-installer.js',
    '^expo-intent-launcher$':
      '<rootDir>/__mocks__/expo-intent-launcher.js',
    '^react-native-webview$':
      '<rootDir>/__mocks__/react-native-webview.js',
    '^react-native-orientation-locker$':
      '<rootDir>/__mocks__/react-native-orientation-locker.js',
    '^react-native-volume-manager$':
      '<rootDir>/__mocks__/react-native-volume-manager.js',
    '^react-native-bootsplash$':
      '<rootDir>/__mocks__/react-native-bootsplash.js',
    '^expo-keep-awake$':
      '<rootDir>/__mocks__/expo-keep-awake.js',
    '^expo-updates$':
      '<rootDir>/__mocks__/expo-updates.js',
    '^expo-modules-core$':
      '<rootDir>/__mocks__/expo-modules-core.js',
    '^nativewind$':
      '<rootDir>/__mocks__/nativewind.js',
    '^react-native-safe-area-context$':
      '<rootDir>/__mocks__/react-native-safe-area-context.js',
  },
};
