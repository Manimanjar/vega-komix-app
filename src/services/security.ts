import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import {settingsStorage} from '../lib/storage';

export type LockTimeout = 'immediately' | '1min' | '5min';
export type LockStateListener = (locked: boolean) => void;

class SecurityService {
  private locked: boolean = false;
  private backgroundTimestamp: number = 0;
  private listeners: Set<LockStateListener> = new Set();
  private isPrompting: boolean = false;
  private initialized: boolean = false;

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Apply App Switcher privacy mask
    this.syncMaskInRecents().catch(e =>
      console.warn('[Security] Failed to sync mask in recents:', e),
    );

    // If biometric lock is enabled, lock app on initial launch
    if (settingsStorage.isBiometricLockEnabled()) {
      this.locked = true;
      // Prompt unlock right after mounting
      setTimeout(() => {
        this.promptUnlock().catch(() => {});
      }, 300);
    }
  }

  public subscribe(listener: LockStateListener): () => void {
    this.listeners.add(listener);
    listener(this.locked);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isLocked(): boolean {
    return this.locked;
  }

  public setLocked(locked: boolean): void {
    if (this.locked !== locked) {
      this.locked = locked;
      this.listeners.forEach(fn => fn(this.locked));
    }
  }

  public async checkBiometricsAvailable(): Promise<{
    hasHardware: boolean;
    isEnrolled: boolean;
    supportedTypes: LocalAuthentication.AuthenticationType[];
  }> {
    try {
      const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);
      return {hasHardware, isEnrolled, supportedTypes};
    } catch (e) {
      console.warn('[Security] Error checking biometrics:', e);
      return {hasHardware: false, isEnrolled: false, supportedTypes: []};
    }
  }

  public async promptUnlock(customPrompt?: string): Promise<boolean> {
    if (!settingsStorage.isBiometricLockEnabled()) {
      this.setLocked(false);
      return true;
    }

    if (this.isPrompting) {
      return false;
    }

    this.isPrompting = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: customPrompt || 'Unlock Vega Komix',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Device PIN / Password',
        disableDeviceFallback: false,
      });

      if (result.success) {
        this.setLocked(false);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[Security] Biometric authentication error:', e);
      return false;
    } finally {
      this.isPrompting = false;
    }
  }

  public handleAppStateChange(nextState: string): void {
    if (nextState === 'background' || nextState === 'inactive') {
      this.backgroundTimestamp = Date.now();
    } else if (nextState === 'active') {
      if (!settingsStorage.isBiometricLockEnabled()) {
        if (this.locked) this.setLocked(false);
        return;
      }

      if (this.backgroundTimestamp === 0) {
        // App started fresh
        return;
      }

      const timeout = settingsStorage.getBiometricLockTimeout();
      const elapsed = Date.now() - this.backgroundTimestamp;

      let shouldLock = false;
      if (timeout === 'immediately') {
        shouldLock = true;
      } else if (timeout === '1min') {
        shouldLock = elapsed >= 60000;
      } else if (timeout === '5min') {
        shouldLock = elapsed >= 300000;
      }

      if (shouldLock) {
        this.setLocked(true);
        this.promptUnlock().catch(() => {});
      }
    }
  }

  public async syncMaskInRecents(): Promise<void> {
    try {
      const enabled = settingsStorage.isMaskInRecentsEnabled();
      if (enabled) {
        await ScreenCapture.preventScreenCaptureAsync('app_privacy_mask');
      } else {
        await ScreenCapture.allowScreenCaptureAsync('app_privacy_mask');
      }
    } catch (e) {
      console.warn('[Security] ScreenCapture sync error:', e);
    }
  }

  public async setMaskInRecents(enabled: boolean): Promise<void> {
    settingsStorage.setMaskInRecentsEnabled(enabled);
    await this.syncMaskInRecents();
  }
}

export const securityService = new SecurityService();
