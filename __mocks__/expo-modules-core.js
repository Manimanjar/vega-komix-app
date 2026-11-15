module.exports = {
  NativeModulesProxy: {},
  EventEmitter: class {
    addListener = jest.fn(() => ({ remove: jest.fn() }));
    removeListeners = jest.fn();
    emit = jest.fn();
  },
  Platform: {
    OS: 'android',
  },
  requireNativeModule: jest.fn(() => ({})),
  requireOptionalNativeModule: jest.fn(() => null),
};
