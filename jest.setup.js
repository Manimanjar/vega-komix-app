if (typeof window !== 'undefined') {
  if (!window.dispatchEvent) {
    window.dispatchEvent = () => true;
  }
}
if (typeof global !== 'undefined') {
  if (global.window && !global.window.dispatchEvent) {
    global.window.dispatchEvent = () => true;
  }
}

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  usePreventScreenCapture: jest.fn(),
  addScreenshotListener: jest.fn(() => ({remove: jest.fn()})),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([1]),
  authenticateAsync: jest.fn().mockResolvedValue({success: true}),
  AuthenticationType: {FINGERPRINT: 1, FACIAL_RECOGNITION: 2},
}));
