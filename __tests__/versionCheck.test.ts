import {compareVersions, CURRENT_VERSION, BUILD_NUMBER} from '../src/screens/settings/About';
import pkg from '../package.json';
import appConfig from '../app.json';

describe('Version & In-App Update Engine', () => {
  describe('compareVersions semver logic', () => {
    it('returns false when local and remote versions are identical', () => {
      expect(compareVersions('6.2.1', '6.2.1')).toBe(false);
      expect(compareVersions('v6.2.1', 'v6.2.1')).toBe(false);
      expect(compareVersions('6.2.1', 'v6.2.1')).toBe(false);
      expect(compareVersions('v6.2.1', '6.2.1')).toBe(false);
    });

    it('returns true when a newer version is available on remote', () => {
      expect(compareVersions('6.2.0', '6.2.1')).toBe(true);
      expect(compareVersions('6.1.1', '6.2.0')).toBe(true);
      expect(compareVersions('6.2.1', '6.3.0')).toBe(true);
      expect(compareVersions('6.2.1', '7.0.0')).toBe(true);
      expect(compareVersions('v6.2.1', 'v6.3.0')).toBe(true);
    });

    it('returns false when local version is newer than remote', () => {
      expect(compareVersions('6.2.1', '6.2.0')).toBe(false);
      expect(compareVersions('6.2.1', '6.1.1')).toBe(false);
      expect(compareVersions('7.0.0', '6.9.9')).toBe(false);
      expect(compareVersions('6.10.0', '6.9.0')).toBe(false);
    });

    it('correctly handles multi-digit subversions without string concatenation bugs', () => {
      // Numerical check: 10 > 2, so 6.10.0 is newer than 6.2.0
      expect(compareVersions('6.2.0', '6.10.0')).toBe(true);
      expect(compareVersions('6.10.0', '6.2.0')).toBe(false);
      expect(compareVersions('6.2.10', '6.2.2')).toBe(false);
      expect(compareVersions('6.2.2', '6.2.10')).toBe(true);
    });

    it('handles malformed or empty inputs gracefully without throwing', () => {
      expect(compareVersions('', '')).toBe(false);
      expect(compareVersions('invalid', '6.2.1')).toBe(true);
      expect(compareVersions('6.2.1', 'invalid')).toBe(false);
    });
  });

  describe('Application metadata consistency', () => {
    it('synchronizes version between package.json, app.json, and CURRENT_VERSION', () => {
      expect(pkg.version).toBe('6.2.2');
      expect(appConfig.expo.version).toBe('6.2.2');
      expect(CURRENT_VERSION).toBe('6.2.2');
    });

    it('synchronizes versionCode between app.json and BUILD_NUMBER', () => {
      expect(appConfig.expo.android.versionCode).toBe(322);
      expect(BUILD_NUMBER).toBe('322');
    });
  });
});
