import {
  bugSentinel,
  sanitizePrivacy,
  computeFingerprint,
} from '../src/lib/telemetry/bugSentinel';
import {mainStorage} from '../src/lib/storage/StorageService';

describe('BugSentinel Diagnostic & Privacy Engine', () => {
  beforeEach(() => {
    bugSentinel.clearAllBugs();
  });

  describe('Privacy Sanitization Engine', () => {
    it('completely strips query parameters, tokens, and secret auth headers', () => {
      const sensitiveUrl =
        'https://example.com/api/v1/chapter?token=SECRET_123&user=john_doe';
      const sanitizedUrl = sanitizePrivacy(sensitiveUrl);
      expect(sanitizedUrl).not.toContain('SECRET_123');
      expect(sanitizedUrl).not.toContain('john_doe');
      expect(sanitizedUrl).toContain('https://example.com/api/v1/chapter?<query-hidden>');

      const sensitiveHeader = 'Authorization: Bearer my_secret_jwt_token_here';
      const sanitizedHeader = sanitizePrivacy(sensitiveHeader);
      expect(sanitizedHeader).not.toContain('my_secret_jwt_token_here');
      expect(sanitizedHeader).toBe('Authorization: <hidden>');
    });

    it('sanitizes device file system paths to prevent leaking internal usernames', () => {
      const rawPath =
        '/data/user/0/com.vegakomix.app/files/src/screens/ReaderScreen.tsx:42';
      const sanitized = sanitizePrivacy(rawPath);
      expect(sanitized).toBe('./src/screens/ReaderScreen.tsx:42');
    });

    it('handles null, undefined, or empty strings gracefully without throwing', () => {
      expect(sanitizePrivacy(undefined)).toBe('');
      expect(sanitizePrivacy('')).toBe('');
    });
  });

  describe('Deterministic Fingerprinting & Deduplication', () => {
    it('generates consistent hexadecimal fingerprints for identical error signatures', () => {
      const fp1 = computeFingerprint('CRASH:TypeError:ReaderScreen:line42');
      const fp2 = computeFingerprint('CRASH:TypeError:ReaderScreen:line42');
      const fp3 = computeFingerprint('CRASH:ReferenceError:ReaderScreen:line42');

      expect(fp1).toBe(fp2);
      expect(fp1).not.toBe(fp3);
      expect(fp1.length).toBe(8);
    });

    it('deduplicates repeating errors and increments the occurrence count', () => {
      bugSentinel.recordBug({
        category: 'FATAL_CRASH',
        severity: 'CRITICAL',
        title: 'TypeError: Cannot read property of undefined',
        message: 'Cannot read property map of undefined',
        stackTrace: 'at ReaderScreen.render (ReaderScreen.tsx:50)',
        component: 'ReaderScreen',
      });

      let bugs = bugSentinel.getActiveBugs();
      expect(bugs.length).toBe(1);
      expect(bugs[0].count).toBe(1);

      // Record the exact same error again
      bugSentinel.recordBug({
        category: 'FATAL_CRASH',
        severity: 'CRITICAL',
        title: 'TypeError: Cannot read property of undefined',
        message: 'Cannot read property map of undefined',
        stackTrace: 'at ReaderScreen.render (ReaderScreen.tsx:50)',
        component: 'ReaderScreen',
      });

      bugs = bugSentinel.getActiveBugs();
      expect(bugs.length).toBe(1);
      expect(bugs[0].count).toBe(2);
    });

    it('tracks distinct bugs with distinct fingerprints separately', () => {
      bugSentinel.recordBug({
        category: 'FATAL_CRASH',
        severity: 'CRITICAL',
        title: 'Crash in Reader',
        message: 'Reader failed',
      });

      bugSentinel.recordBug({
        category: 'UI_LAG_FREEZE',
        severity: 'MEDIUM',
        title: 'UI Freeze: 2000ms delay',
        message: 'Event loop lag detected',
      });

      const bugs = bugSentinel.getActiveBugs();
      expect(bugs.length).toBe(2);
    });
  });

  describe('Markdown Report Generation', () => {
    it('produces valid GitHub markdown report with operational status when no bugs exist', () => {
      const report = bugSentinel.generateMarkdownReport();
      expect(report).toContain('Vega Komix Bug Sentinel — Automated Issue Telemetry');
      expect(report).toContain('All Systems Operational');
      expect(report).toContain('Active Unique Bugs** | **0**');
    });

    it('formats active bugs with metrics, actionable AI debugger hints, and sanitized details', () => {
      bugSentinel.recordBug({
        category: 'REACT_RENDER',
        severity: 'CRITICAL',
        title: 'ReaderComponent crashed',
        message: 'State undefined error',
        stackTrace: 'at ReaderComponent.tsx:120',
        component: 'ReaderComponent',
      });

      const report = bugSentinel.generateMarkdownReport();
      expect(report).toContain('Executive Summary');
      expect(report).toContain('Active Unique Bugs** | **1**');
      expect(report).toContain('Critical Crashes** | 🔴 **1**');
      expect(report).toContain('ReaderComponent');
      expect(report).toContain('AI Debugger Action Hint');
      expect(report).toContain('Inspect React rendering lifecycle and null safety checks');
    });
  });

  describe('Auto Upload Weekly Configuration', () => {
    it('persists weekly auto-upload toggle state', () => {
      bugSentinel.setAutoUploadEnabled(false);
      expect(bugSentinel.isAutoUploadEnabled()).toBe(false);

      bugSentinel.setAutoUploadEnabled(true);
      expect(bugSentinel.isAutoUploadEnabled()).toBe(true);
    });
  });
});
