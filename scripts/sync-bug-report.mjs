#!/usr/bin/env node

/**
 * Vega Komix Bug Sentinel — Git Repository Sync Utility
 *
 * Updates reports/BUG_REPORTS.md directly in the Git repository,
 * syncs with GitHub Issues API, and pushes the latest telemetry to origin/main.
 *
 * Can be run manually or triggered by agy-daemon / cron weekly.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const REPORT_FILE = path.join(REPORTS_DIR, 'BUG_REPORTS.md');

const GITHUB_REPO = 'Manimanjar/vega-komix-app';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

function getGitCommitInfo() {
  try {
    const head = execSync('git rev-parse --short HEAD', {cwd: REPO_ROOT, encoding: 'utf8'}).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {cwd: REPO_ROOT, encoding: 'utf8'}).trim();
    return {head, branch};
  } catch {
    return {head: 'unknown', branch: 'main'};
  }
}

async function fetchGitHubIssues() {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues?state=open&labels=bug`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'VegaKomix-BugSentinel-Sync',
      },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function ensureReportExists() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, {recursive: true});
  }

  if (!fs.existsSync(REPORT_FILE)) {
    const initialContent = `# 🐞 Vega Komix Bug Sentinel — Automated Issue Telemetry

> **Auto-generated telemetry report by Vega Komix Bug Sentinel.**
> Strictly privacy-sanitized: zero watch history, personal info, or comic titles.

## 📊 Executive Summary

| Metric | Value |
| :--- | :--- |
| **Report Status** | Initialized |
| **App Version** | \`v6.2.2 (Build 322)\` |
| **Active Unique Bugs** | **0** |
| **Critical Crashes** | 🟢 **0** |
| **High Severity Glitches** | 🟢 **0** |
| **Medium / Lag Incidents** | 🟢 **0** |

### ✨ All Systems Operational
No active crashes, bugs, or severe UI lag incidents currently registered.
`;
    fs.writeFileSync(REPORT_FILE, initialContent, 'utf8');
    console.log(`[BugSentinel] Created initial report file: ${REPORT_FILE}`);
  }
}

async function syncToGit(commitMessage = 'docs(telemetry): update automated bug report [skip ci]') {
  ensureReportExists();
  const {head, branch} = getGitCommitInfo();

  try {
    const status = execSync('git status --porcelain reports/', {cwd: REPO_ROOT, encoding: 'utf8'}).trim();
    if (!status) {
      console.log(`[BugSentinel] reports/BUG_REPORTS.md is already up to date on branch ${branch} (${head}).`);
      return;
    }

    console.log('[BugSentinel] Staging and committing updated bug report...');
    execSync('git add reports/BUG_REPORTS.md', {cwd: REPO_ROOT, stdio: 'inherit'});
    execSync(`git commit -m "${commitMessage}"`, {cwd: REPO_ROOT, stdio: 'inherit'});
    execSync(`git push origin ${branch}`, {cwd: REPO_ROOT, stdio: 'inherit'});
    console.log('✔ [BugSentinel] Successfully pushed bug report update to GitHub remote!');
  } catch (err) {
    console.error('[BugSentinel] Git sync error:', err.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isManual = args.includes('--manual');

  ensureReportExists();

  if (isStatus) {
    const content = fs.readFileSync(REPORT_FILE, 'utf8');
    console.log('=== VEGA KOMIX BUG SENTINEL STATUS ===');
    console.log(`Report location: ${REPORT_FILE}`);
    const summaryMatch = content.match(/## 📊 Executive Summary([\s\S]*?)##/);
    if (summaryMatch) {
      console.log(summaryMatch[1].trim());
    } else {
      console.log(content.slice(0, 500));
    }
    return;
  }

  console.log('[BugSentinel] Running repository bug sync...');
  await syncToGit(
    isManual
      ? 'docs(telemetry): manual bug report sync [skip ci]'
      : 'docs(telemetry): update weekly automated bug report [skip ci]'
  );
}

main().catch(err => {
  console.error('[BugSentinel] Fatal script error:', err);
  process.exit(1);
});
