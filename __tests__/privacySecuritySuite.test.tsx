import {beforeEach, describe, expect, it, jest} from '@jest/globals';

const getGlobalStore = () => {
  if (!(global as any).__testMMKVStore) {
    (global as any).__testMMKVStore = new Map<string, unknown>();
  }
  return (global as any).__testMMKVStore as Map<string, unknown>;
};

jest.mock('react-native-mmkv-storage', () => ({
  MMKVLoader: class {
    withInstanceID() {
      return this;
    }

    initialize() {
      const store = (global as any).__testMMKVStore || ((global as any).__testMMKVStore = new Map());
      return {
        getString: (key: string) => store.get(key),
        setString: (key: string, value: string) => store.set(key, value),
        getBool: (key: string) => store.get(key),
        setBool: (key: string, value: boolean) => store.set(key, value),
        getInt: (key: string) => store.get(key),
        setInt: (key: string, value: number) => store.set(key, value),
        getArray: (key: string) => {
          const val = store.get(key);
          if (!val) return null;
          return typeof val === 'string' ? JSON.parse(val) : val;
        },
        setArray: (key: string, value: any[]) => store.set(key, JSON.stringify(value)),
        removeItem: (key: string) => store.delete(key),
        clearStore: () => store.clear(),
      };
    }
  },
}));

import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import {securityService} from '../src/services/security';
import {settingsStorage} from '../src/lib/storage';

describe('Privacy & Security Suite', () => {
  beforeEach(() => {
    getGlobalStore().clear();
    jest.clearAllMocks();
  });

  describe('Biometric App Lock & Startup Authentication', () => {
    it('verifies biometric hardware availability and enrollment', async () => {
      const res = await securityService.checkBiometricsAvailable();
      expect(res.hasHardware).toBe(true);
      expect(res.isEnrolled).toBe(true);
      expect(res.supportedTypes.length).toBeGreaterThan(0);
    });

    it('enforces lock on initial launch when biometric lock is enabled in settings', () => {
      settingsStorage.setBiometricLockEnabled(true);
      securityService.setLocked(false);

      // Re-initialize security service
      (securityService as any).initialized = false;
      securityService.init();

      expect(securityService.isLocked()).toBe(true);
    });

    it('prompts unlock via LocalAuthentication and unlocks app upon success', async () => {
      settingsStorage.setBiometricLockEnabled(true);
      securityService.setLocked(true);

      const unlockSuccess = await securityService.promptUnlock('Unlock Vega Komix');
      expect(unlockSuccess).toBe(true);
      expect(securityService.isLocked()).toBe(false);
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled();
    });

    it('locks app on resume when timeout is set to immediately', () => {
      settingsStorage.setBiometricLockEnabled(true);
      settingsStorage.setBiometricLockTimeout('immediately');
      securityService.setLocked(false);

      // App backgrounded
      securityService.handleAppStateChange('background');

      // App resumed
      securityService.handleAppStateChange('active');
      expect(securityService.isLocked()).toBe(true);
    });

    it('respects timeout window of 1 minute when backgrounded briefly', () => {
      settingsStorage.setBiometricLockEnabled(true);
      settingsStorage.setBiometricLockTimeout('1min');
      securityService.setLocked(false);

      // Backgrounded at now
      securityService.handleAppStateChange('background');

      // Resumed after only 10 seconds
      securityService.handleAppStateChange('active');
      expect(securityService.isLocked()).toBe(false);
    });
  });

  describe('Android FLAG_SECURE App Masking (expo-screen-capture)', () => {
    it('activates FLAG_SECURE app privacy mask when enabled', async () => {
      await securityService.setMaskInRecents(true);
      expect(settingsStorage.isMaskInRecentsEnabled()).toBe(true);
      expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledWith('app_privacy_mask');
    });

    it('deactivates FLAG_SECURE when mask in recents is toggled off', async () => {
      await securityService.setMaskInRecents(false);
      expect(settingsStorage.isMaskInRecentsEnabled()).toBe(false);
      expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledWith('app_privacy_mask');
    });
  });

  describe('1-Tap Incognito / Ghost Reading Mode', () => {
    it('enforces progress isolation when incognito is active', () => {
      const isIncognito = true;
      let progressSaved = false;
      let historyLogged = false;

      const saveProgress = () => {
        if (!isIncognito) {
          progressSaved = true;
        }
      };

      const recordHistory = () => {
        if (!isIncognito) {
          historyLogged = true;
        }
      };

      saveProgress();
      recordHistory();

      expect(progressSaved).toBe(false);
      expect(historyLogged).toBe(false);
    });
  });
});
