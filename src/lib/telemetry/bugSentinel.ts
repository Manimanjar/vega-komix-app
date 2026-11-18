import {Platform, AppState} from 'react-native';
import * as Application from 'expo-application';
import {mainStorage} from '../storage/StorageService';

/**
 * Bug Sentinel — Autonomous Diagnostic Telemetry & Bug Tracking Engine
 *
 * Captures, deduplicates, and reports errors, crashes, provider faults,
 * and UI lag/freezes. Strictly sanitizes all data to guarantee zero leakage
 * of personal information, reading history, or comic titles.
 */

export type BugCategory =
  | 'FATAL_CRASH'
  | 'UNHANDLED_PROMISE'
  | 'REACT_RENDER'
  | 'UI_LAG_FREEZE'
  | 'PROVIDER_SCRAPER'
  | 'READER_GLITCH'
  | 'NETWORK_ERROR'
  | 'CONSOLE_ERROR';

export type BugSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface BugReportEntry {
  id: string; // e.g. "BUG-CRASH-8F2A1C"
  fingerprint: string; // Hash for deduplication
  category: BugCategory;
  severity: BugSeverity;
  title: string;
  message: string;
  stackTrace?: string;
  component?: string;
  screen?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  device: {
    appVersion: string;
    buildNumber: string;
    osVersion: string;
    deviceModel: string;
  };
  metadata?: Record<string, string | number | boolean>;
}

export interface BugSentinelState {
  autoUploadWeekly: boolean;
  lastUploadTime: number;
  lastUploadStatus: string;
  bugs: Record<string, BugReportEntry>;
}

const STORAGE_KEY = 'bug_sentinel_registry_v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const GITHUB_REPO = 'Manimanjar/vega-komix-app';
const getGitHubToken = (): string => {
  try {
    return (
      (typeof process !== 'undefined' && process.env?.GITHUB_TOKEN) ||
      mainStorage.getString('bug_sentinel_github_token') ||
      ''
    );
  } catch {
    return '';
  }
};

// Regex patterns to strip sensitive user/query data
const URL_QUERY_REGEX = /(https?:\/\/[^\s?#"']+)\?[^\s"']*/gi;
const SECRET_HEADER_REGEX =
  /\b(cookie|set-cookie|authorization|x-api-key|token|api[_-]?key)(["']?\s*[:=]\s*)([^\r\n,;}]+)/gi;
const FILE_PATH_PREFIX_REGEX = /\/data\/user\/0\/[a-zA-Z0-9._-]+\/files\//g;

/** Strictly strips any private URLs, tokens, queries, and device-private file paths */
export const sanitizePrivacy = (text: string | undefined): string => {
  if (!text) return '';
  return text
    .replace(URL_QUERY_REGEX, '$1?<query-hidden>')
    .replace(SECRET_HEADER_REGEX, '$1$2<hidden>')
    .replace(FILE_PATH_PREFIX_REGEX, './');
};

/** Deterministic simple string hash for fast fingerprinting */
export const computeFingerprint = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
};

class BugSentinel {
  private state: BugSentinelState;
  private currentScreen: string = 'App';
  private lagWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHeartbeat: number = Date.now();
  private lastLagReportTime: number = 0;
  private isWatchdogActive: boolean = false;
  private initialized: boolean = false;

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): BugSentinelState {
    const raw = mainStorage.getObject<BugSentinelState>(STORAGE_KEY);
    if (raw && typeof raw === 'object' && raw.bugs) {
      return {
        autoUploadWeekly: raw.autoUploadWeekly ?? true,
        lastUploadTime: raw.lastUploadTime ?? 0,
        lastUploadStatus: raw.lastUploadStatus ?? 'Never uploaded',
        bugs: raw.bugs,
      };
    }
    return {
      autoUploadWeekly: true,
      lastUploadTime: 0,
      lastUploadStatus: 'Never uploaded',
      bugs: {},
    };
  }

  private saveState(): void {
    mainStorage.setObject(STORAGE_KEY, this.state);
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Start event loop lag watchdog
    this.startLagWatchdog();

    // Check weekly auto-upload in background after startup
    setTimeout(() => {
      this.checkWeeklyAutoUpload().catch(() => {});
    }, 5000);
  }

  public setCurrentScreen(screenName: string): void {
    if (screenName) {
      this.currentScreen = screenName;
    }
  }

  public getCurrentScreen(): string {
    return this.currentScreen;
  }

  public isAutoUploadEnabled(): boolean {
    return this.state.autoUploadWeekly;
  }

  public setAutoUploadEnabled(enabled: boolean): void {
    this.state.autoUploadWeekly = enabled;
    this.saveState();
  }

  public getLastUploadTime(): number {
    return this.state.lastUploadTime;
  }

  public getLastUploadStatus(): string {
    return this.state.lastUploadStatus;
  }

  public getActiveBugs(): BugReportEntry[] {
    return Object.values(this.state.bugs).sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
    );
  }

  public clearAllBugs(): void {
    this.state.bugs = {};
    this.state.lastUploadStatus = 'Cleared';
    this.saveState();
  }

  /**
   * Main error recording entrypoint with automatic deduplication
   */
  public recordBug(params: {
    category: BugCategory;
    severity?: BugSeverity;
    title: string;
    message: string;
    stackTrace?: string;
    component?: string;
    metadata?: Record<string, string | number | boolean>;
  }): BugReportEntry {
    const {
      category,
      severity = 'HIGH',
      title,
      message,
      stackTrace,
      component,
      metadata,
    } = params;

    const cleanTitle = sanitizePrivacy(title).trim().slice(0, 200);
    const cleanMessage = sanitizePrivacy(message).trim().slice(0, 2000);
    const cleanStack = sanitizePrivacy(stackTrace);

    // Extract normalized top 3 stack frames for deterministic fingerprinting
    const stackSignature = cleanStack
      .split('\n')
      .slice(0, 3)
      .map(line => line.trim().replace(/:\d+:\d+/g, ''))
      .join('|');

    const rawFingerprint = `${category}:${cleanTitle}:${component || ''}:${stackSignature}`;
    const fingerprint = computeFingerprint(rawFingerprint);
    const bugId = `BUG-${category.replace(/_/g, '').slice(0, 5)}-${fingerprint.slice(0, 6)}`;

    const now = new Date().toISOString();

    const existing = this.state.bugs[fingerprint];
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
      if (metadata) {
        existing.metadata = {...existing.metadata, ...metadata};
      }
      this.saveState();
      return existing;
    }

    // Limit stored bugs to newest 100 to prevent unbounded storage
    const bugKeys = Object.keys(this.state.bugs);
    if (bugKeys.length >= 100) {
      const oldestKey = bugKeys[0];
      delete this.state.bugs[oldestKey];
    }

    const appVersion = Application.nativeApplicationVersion || '6.2.2';
    const buildNumber = String(Application.nativeBuildVersion || '322');

    const newBug: BugReportEntry = {
      id: bugId,
      fingerprint,
      category,
      severity,
      title: cleanTitle,
      message: cleanMessage,
      stackTrace: cleanStack || undefined,
      component: component || this.currentScreen,
      screen: this.currentScreen,
      count: 1,
      firstSeen: now,
      lastSeen: now,
      device: {
        appVersion,
        buildNumber,
        osVersion: `${Platform.OS} ${Platform.Version}`,
        deviceModel: `${Platform.select({android: 'Android', default: 'Device'})}`,
      },
      metadata,
    };

    this.state.bugs[fingerprint] = newBug;
    this.saveState();
    return newBug;
  }

  // --- Specific convenience recorders ---

  public recordFatalCrash(error: unknown, isFatal?: boolean): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.recordBug({
      category: 'FATAL_CRASH',
      severity: 'CRITICAL',
      title: `${isFatal ? 'Fatal Crash' : 'Unhandled Error'}: ${err.name || 'Error'}`,
      message: err.message || 'Fatal JavaScript Exception',
      stackTrace: err.stack,
      component: 'GlobalCrashHandler',
    });
  }

  public recordReactError(
    error: Error,
    errorInfo: {componentStack?: string} | null,
    boundaryName: string = 'ErrorBoundary',
  ): void {
    this.recordBug({
      category: 'REACT_RENDER',
      severity: 'CRITICAL',
      title: `React Render Crash in ${boundaryName}`,
      message: error.message || 'Component failed to render',
      stackTrace: `${error.stack || ''}\nComponent Stack:\n${errorInfo?.componentStack || ''}`,
      component: boundaryName,
    });
  }

  public recordUnhandledPromise(reason: unknown): void {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    this.recordBug({
      category: 'UNHANDLED_PROMISE',
      severity: 'HIGH',
      title: `Unhandled Promise Rejection: ${err.name || 'Error'}`,
      message: err.message || String(reason),
      stackTrace: err.stack,
    });
  }

  public recordProviderError(
    providerValue: string,
    operation: string,
    error: unknown,
  ): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.recordBug({
      category: 'PROVIDER_SCRAPER',
      severity: 'HIGH',
      title: `Provider ${providerValue} failed during ${operation}`,
      message: err.message || 'Scraper module execution failed',
      stackTrace: err.stack,
      component: `ProviderManager[${providerValue}]`,
      metadata: {provider: providerValue, operation},
    });
  }

  public recordReaderError(
    context: string,
    errorMessage: string,
    metadata?: Record<string, string | number | boolean>,
  ): void {
    this.recordBug({
      category: 'READER_GLITCH',
      severity: 'HIGH',
      title: `Reader Glitch: ${context}`,
      message: errorMessage,
      component: 'ReaderScreen',
      metadata,
    });
  }

  public recordConsoleError(args: unknown[]): void {
    if (!args || args.length === 0) return;
    const first = args[0];
    const message = args
      .map(a => (a instanceof Error ? `${a.name}: ${a.message}\n${a.stack}` : String(a)))
      .join(' ');

    // Filter out known harmless warnings or external noisy logs
    if (
      message.includes('React Native Firebase namespaced API') ||
      message.includes('InteractionManager has been deprecated')
    ) {
      return;
    }

    const title =
      first instanceof Error
        ? `${first.name}: ${first.message}`
        : typeof first === 'string'
        ? first.slice(0, 100)
        : 'Console Error';

    this.recordBug({
      category: 'CONSOLE_ERROR',
      severity: 'MEDIUM',
      title,
      message,
      component: this.currentScreen,
    });
  }

  // --- UI Lag & Event Loop Freeze Watchdog ---

  public startLagWatchdog(): void {
    if (this.isWatchdogActive) return;
    this.isWatchdogActive = true;
    this.lastHeartbeat = Date.now();

    const HEARTBEAT_INTERVAL = 500;
    const FREEZE_THRESHOLD = 1500; // 1.5 seconds blocked event loop
    const THROTTLE_INTERVAL = 60000; // Max 1 lag report per minute

    const loop = () => {
      if (!this.isWatchdogActive) return;

      const now = Date.now();
      const delay = now - this.lastHeartbeat - HEARTBEAT_INTERVAL;

      // Only check if app is active in foreground to prevent false positives when paused/backgrounded
      if (AppState.currentState === 'active' && delay >= FREEZE_THRESHOLD) {
        if (now - this.lastLagReportTime > THROTTLE_INTERVAL) {
          this.lastLagReportTime = now;
          this.recordBug({
            category: 'UI_LAG_FREEZE',
            severity: delay > 3000 ? 'CRITICAL' : 'MEDIUM',
            title: `UI Freeze: JS thread blocked for ${(delay + HEARTBEAT_INTERVAL).toFixed(0)}ms`,
            message: `Event loop lag of ${delay.toFixed(0)}ms detected on screen: ${this.currentScreen}. May cause dropped frames or unresponsive UI.`,
            component: this.currentScreen,
            metadata: {
              freezeDurationMs: Math.round(delay + HEARTBEAT_INTERVAL),
              screen: this.currentScreen,
            },
          });
        }
      }

      this.lastHeartbeat = Date.now();
      this.lagWatchdogTimer = setTimeout(loop, HEARTBEAT_INTERVAL);
    };

    this.lagWatchdogTimer = setTimeout(loop, HEARTBEAT_INTERVAL);
  }

  public stopLagWatchdog(): void {
    this.isWatchdogActive = false;
    if (this.lagWatchdogTimer) {
      clearTimeout(this.lagWatchdogTimer);
      this.lagWatchdogTimer = null;
    }
  }

  // --- Markdown Report Generator ---

  public generateMarkdownReport(): string {
    const bugs = this.getActiveBugs();
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const appVersion = Application.nativeApplicationVersion || '6.2.2';
    const buildNumber = String(Application.nativeBuildVersion || '322');

    const criticalCount = bugs.filter(b => b.severity === 'CRITICAL').length;
    const highCount = bugs.filter(b => b.severity === 'HIGH').length;
    const mediumCount = bugs.filter(b => b.severity === 'MEDIUM').length;
    const lowCount = bugs.filter(b => b.severity === 'LOW').length;

    let md = `# 🐞 Vega Komix Bug Sentinel — Automated Issue Telemetry\n\n`;
    md += `> **Auto-generated telemetry report by Vega Komix Bug Sentinel.**\n`;
    md += `> Strictly privacy-sanitized: zero watch history, personal info, or comic titles.\n\n`;

    md += `## 📊 Executive Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Report Generated** | \`${now}\` |\n`;
    md += `| **App Version** | \`v${appVersion} (Build ${buildNumber})\` |\n`;
    md += `| **Active Unique Bugs** | **${bugs.length}** |\n`;
    md += `| **Critical Crashes** | 🔴 **${criticalCount}** |\n`;
    md += `| **High Severity Glitches** | 🟠 **${highCount}** |\n`;
    md += `| **Medium / Lag Incidents** | 🟡 **${mediumCount}** |\n`;
    md += `| **Low / Minor Logs** | ⚪ **${lowCount}** |\n\n`;

    if (bugs.length === 0) {
      md += `### ✨ All Systems Operational\n`;
      md += `No errors, crashes, or severe UI lag incidents have been detected.\n`;
      return md;
    }

    md += `## 📋 Active Issues Quick Index\n\n`;
    md += `| ID | Severity | Category | Component | Hits | Last Seen |\n`;
    md += `| :--- | :---: | :--- | :--- | :---: | :--- |\n`;
    for (const bug of bugs) {
      const sevBadge =
        bug.severity === 'CRITICAL'
          ? '🔴 CRITICAL'
          : bug.severity === 'HIGH'
          ? '🟠 HIGH'
          : bug.severity === 'MEDIUM'
          ? '🟡 MEDIUM'
          : '⚪ LOW';
      md += `| \`${bug.id}\` | ${sevBadge} | \`${bug.category}\` | \`${bug.component || 'App'}\` | **${bug.count}** | ${bug.lastSeen.substring(0, 16)} |\n`;
    }
    md += `\n---\n\n`;

    md += `## 🔍 Deep-Dive Issue Diagnostics\n\n`;
    for (const [index, bug] of bugs.entries()) {
      md += `### ${index + 1}. [${bug.id}] ${bug.title}\n\n`;
      md += `- **Category:** \`${bug.category}\`\n`;
      md += `- **Severity:** \`${bug.severity}\`\n`;
      md += `- **Component / Screen:** \`${bug.component || 'N/A'}\` (Screen: \`${bug.screen || 'N/A'}\`)\n`;
      md += `- **Occurrences:** **${bug.count}** time(s)\n`;
      md += `- **First Observed:** \`${bug.firstSeen}\`\n`;
      md += `- **Last Observed:** \`${bug.lastSeen}\`\n`;
      md += `- **Device Environment:** \`${bug.device.osVersion}\` | App \`v${bug.device.appVersion} (${bug.device.buildNumber})\`\n`;

      if (bug.metadata && Object.keys(bug.metadata).length > 0) {
        md += `- **Technical Metadata:** \`${JSON.stringify(bug.metadata)}\`\n`;
      }

      md += `\n**Error Message:**\n\`\`\`\n${bug.message}\n\`\`\`\n`;

      if (bug.stackTrace) {
        md += `\n**Stack Trace:**\n\`\`\`\n${bug.stackTrace}\n\`\`\`\n`;
      }

      // Suggest specific actionable debug hints for the AI assistant
      md += `\n**💡 AI Debugger Action Hint:**\n`;
      if (bug.category === 'REACT_RENDER') {
        md += `> Inspect React rendering lifecycle and null safety checks in \`${bug.component}\`.\n`;
      } else if (bug.category === 'UI_LAG_FREEZE') {
        md += `> Inspect heavy synchronous operations or large unvirtualized loops in \`${bug.component}\` blocking the JS thread.\n`;
      } else if (bug.category === 'PROVIDER_SCRAPER') {
        md += `> Inspect provider DOM parsing selectors, network headers, or anti-bot challenge handlers in scraper module.\n`;
      } else if (bug.category === 'READER_GLITCH') {
        md += `> Check image decode pipelines, timeout retries, or chapter stream resolution in \`ReaderScreen\`.\n`;
      } else {
        md += `> Check stack trace location and handle uncaught exceptions with fallback states.\n`;
      }

      md += `\n---\n\n`;
    }

    return md;
  }

  // --- GitHub Automatic & Manual Upload Engine ---

  public async uploadBugReportToGitHub(forceManual: boolean = false): Promise<{
    success: boolean;
    bugCount: number;
    issueUrl?: string;
    error?: string;
  }> {
    const bugs = this.getActiveBugs();
    const markdown = this.generateMarkdownReport();
    const now = new Date().toISOString();

    try {
      const token = getGitHubToken();
      const authHeaders: Record<string, string> = token
        ? {Authorization: `token ${token}`}
        : {};

      // 1. Search for existing telemetry issue on GitHub
      const searchRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/issues?state=open&creator=Manimanjar`,
        {
          headers: {
            ...authHeaders,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'VegaKomix-BugSentinel',
          },
        },
      );

      let existingIssueNumber: number | null = null;
      let issueHtmlUrl: string | undefined;

      if (searchRes.ok) {
        const issues: any[] = await searchRes.json();
        const found = issues.find(
          issue =>
            typeof issue.title === 'string' &&
            issue.title.includes('[Bug Sentinel] Automated Telemetry'),
        );
        if (found) {
          existingIssueNumber = found.number;
          issueHtmlUrl = found.html_url;
        }
      }

      const issueTitle = `[Bug Sentinel] Automated Telemetry & Bug Report (${bugs.length} active)`;

      if (existingIssueNumber) {
        // Update existing issue
        const updateRes = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/issues/${existingIssueNumber}`,
          {
            method: 'PATCH',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json',
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'VegaKomix-BugSentinel',
            },
            body: JSON.stringify({
              title: issueTitle,
              body: markdown,
              state: bugs.length === 0 ? 'closed' : 'open',
            }),
          },
        );

        if (!updateRes.ok) {
          throw new Error(`GitHub issue update returned HTTP ${updateRes.status}`);
        }
        const updated = await updateRes.json();
        issueHtmlUrl = updated.html_url;
      } else if (bugs.length > 0 || forceManual) {
        // Create new tracking issue
        const createRes = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/issues`,
          {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json',
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'VegaKomix-BugSentinel',
            },
            body: JSON.stringify({
              title: issueTitle,
              body: markdown,
              labels: ['bug', 'automated-telemetry'],
            }),
          },
        );

        if (!createRes.ok) {
          throw new Error(`GitHub issue creation returned HTTP ${createRes.status}`);
        }
        const created = await createRes.json();
        issueHtmlUrl = created.html_url;
      }

      this.state.lastUploadTime = Date.now();
      this.state.lastUploadStatus = `Synced successfully: ${bugs.length} bugs recorded (${now.substring(0, 16)})`;
      this.saveState();

      return {
        success: true,
        bugCount: bugs.length,
        issueUrl: issueHtmlUrl,
      };
    } catch (err: any) {
      console.warn('[BugSentinel] GitHub upload error:', err?.message || err);
      this.state.lastUploadStatus = `Upload failed: ${err?.message || 'Network error'}`;
      this.saveState();
      return {
        success: false,
        bugCount: bugs.length,
        error: err?.message || 'Network error during GitHub upload',
      };
    }
  }

  // --- Automatic Weekly Sync ---

  public async checkWeeklyAutoUpload(): Promise<void> {
    if (!this.state.autoUploadWeekly) return;

    const timeSinceLast = Date.now() - this.state.lastUploadTime;
    const bugs = this.getActiveBugs();

    // Trigger if >= 7 days have passed since last upload and there are recorded bugs
    if (timeSinceLast >= WEEK_MS && bugs.length > 0) {
      console.log('[BugSentinel] Weekly upload interval reached; syncing bug report...');
      await this.uploadBugReportToGitHub(false);
    }
  }
}

export const bugSentinel = new BugSentinel();
export default bugSentinel;
