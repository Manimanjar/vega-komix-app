import * as RNFS from '@dr.pogodin/react-native-fs';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import CookieManager from '@preeternal/react-native-cookie-manager';
import { providerManager } from './services/ProviderManager';
import { notificationService } from './services/Notification';
import { settingsStorage } from './storage';
import { sanitizeDownloadFileName } from './downloadId';
import useDownloadsStore, { DownloadItem } from './zustand/downloadsStore';
import type { PageImage } from './providers/types';
import type { ReaderPageItem } from '../components/reader/types';

export interface ComicDownloadRequest {
  downloadId: string;
  title: string;
  showName?: string;
  episodeName?: string;
  seasonTitle?: string;
  episodeIndex?: number;
  chapterNumber?: number;
  providerValue: string;
  infoUrl?: string;
  sourceLink: string;
  poster?: string;
  background?: string;
  synopsis?: string;
  type?: 'movie' | 'series';
}

interface ActiveComicJob {
  downloadId: string;
  isPaused: boolean;
  isCancelled: boolean;
  activeJobIds: Set<number>;
}

const activeComicJobs = new Map<string, ActiveComicJob>();
const lastNotificationTime = new Map<string, number>();

/**
 * Determine file extension from image URL or content
 */
export function getPageExtension(imageUrl: string): string {
  try {
    const clean = imageUrl.split('?')[0].split('#')[0];
    const match = clean.match(/\.([a-zA-Z0-9]{3,4})$/);
    if (match) {
      const ext = match[1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
  } catch {}
  return 'jpg';
}

/**
 * Resolve headers including Referer and cookies
 */
export async function resolvePageHeaders(page: {
  imageUrl: string;
  headers?: Record<string, string>;
}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    ...(page.headers || {}),
  };

  try {
    const cookies = await CookieManager.get(page.imageUrl);
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v.value}`)
      .join('; ');
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
  } catch {}

  if (!headers.Referer) {
    try {
      const url = new URL(page.imageUrl);
      headers.Referer = `${url.protocol}//${url.host}/`;
    } catch {}
  }

  return headers;
}

/**
 * Computes destination folder path:
 * downloads/<providerValue>/<sanitizedComicTitle>/<sanitizedChapterTitle>/
 */
export function getComicChapterDirectory(params: {
  providerValue: string;
  comicTitle: string;
  chapterTitle: string;
}): string {
  const provider = sanitizeDownloadFileName(params.providerValue || 'unknown');
  const comic = sanitizeDownloadFileName(params.comicTitle || 'Untitled');
  const chapter = sanitizeDownloadFileName(params.chapterTitle || 'Chapter');
  return `${RNFS.DocumentDirectoryPath}/downloads/${provider}/${comic}/${chapter}`;
}

/**
 * Fetch page images for a chapter link from provider
 */
export async function fetchChapterPages(
  link: string,
  providerValue: string,
): Promise<PageImage[]> {
  try {
    const pages = await providerManager.getPages({
      link,
      providerValue,
      type: 'comic',
      isDownload: true,
    });
    if (Array.isArray(pages) && pages.length > 0) {
      return pages.map((item: any, idx: number) => ({
        index: typeof item.index === 'number' ? item.index : idx,
        imageUrl: item.imageUrl || item.link || item.url || '',
        width: item.width,
        height: item.height,
        headers: item.headers,
      })).filter(p => Boolean(p.imageUrl));
    }
  } catch (err) {
    console.warn('[comicDownloader] getPages failed, trying getStream fallback:', err);
  }

  // Fallback to getStream in case provider handles it there
  try {
    const streams = await providerManager.getStream({
      link,
      providerValue,
      type: 'comic',
    });
    if (Array.isArray(streams) && streams.length > 0) {
      const streamPages: PageImage[] = [];
      streams.forEach((item: any, idx: number) => {
        if (item.pages && Array.isArray(item.pages)) {
          item.pages.forEach((p: any, pIdx: number) => {
            streamPages.push({
              index: typeof p.index === 'number' ? p.index : pIdx,
              imageUrl: p.imageUrl || p.link || p.url || '',
              headers: p.headers,
            });
          });
        } else if (item.link) {
          streamPages.push({
            index: idx,
            imageUrl: item.link,
            headers: item.headers,
          });
        }
      });
      if (streamPages.length > 0) {
        return streamPages;
      }
    }
  } catch (err) {
    console.error('[comicDownloader] getStream fallback also failed:', err);
  }

  return [];
}

/**
 * Throttled notification updater for foreground service
 */
async function updateNotificationThrottled(
  downloadId: string,
  comicTitle: string,
  chapterTitle: string,
  completed: number,
  total: number,
  force = false,
) {
  const now = Date.now();
  const lastTime = lastNotificationTime.get(downloadId) || 0;
  if (!force && now - lastTime < 500) {
    return;
  }
  lastNotificationTime.set(downloadId, now);

  const body = `Downloading ${chapterTitle} (${completed}/${total} pages)`;
  await notificationService.displayDownloadNotification({
    id: downloadId,
    title: comicTitle,
    body,
    progress: {
      max: total,
      current: completed,
      indeterminate: false,
    },
    onlyAlertOnce: true,
    asForegroundService: true,
    groupId: 'vega-downloads',
  }).catch(() => {});
}

/**
 * Export downloaded chapter directory to standard .cbz archive using JSZip
 */
export async function exportChapterToCbz(
  sourceDir: string,
  cbzFilePath: string,
): Promise<string> {
  const zip = new JSZip();
  const files = await RNFS.readDir(sourceDir);
  const imageFiles = files
    .filter(f => f.isFile() && /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  for (const f of imageFiles) {
    const base64 = await RNFS.readFile(f.path, 'base64');
    zip.file(f.name, base64, { base64: true });
  }

  const zipContent = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  await RNFS.writeFile(cbzFilePath, zipContent, 'base64');
  return cbzFilePath;
}

/**
 * Start or resume downloading a comic chapter in parallel batches
 */
export async function startComicChapterDownload(
  req: ComicDownloadRequest,
): Promise<void> {
  const store = useDownloadsStore.getState();
  const downloadId = req.downloadId;

  // Check if job is already running
  if (activeComicJobs.has(downloadId)) {
    const existing = activeComicJobs.get(downloadId)!;
    if (existing.isPaused) {
      existing.isPaused = false;
    }
    return;
  }

  const job: ActiveComicJob = {
    downloadId,
    isPaused: false,
    isCancelled: false,
    activeJobIds: new Set<number>(),
  };
  activeComicJobs.set(downloadId, job);

  const comicTitle = req.showName || req.title;
  const chapterTitle = req.episodeName || `Chapter ${req.episodeIndex ?? 1}`;
  const chapterDir = getComicChapterDirectory({
    providerValue: req.providerValue,
    comicTitle,
    chapterTitle,
  });

  try {
    // 1. Mark starting in store
    store.addDownload({
      id: downloadId,
      title: req.title,
      showName: req.showName,
      episodeName: req.episodeName,
      seasonTitle: req.seasonTitle || 'Chapters',
      episodeIndex: req.episodeIndex,
      type: 'series',
      imdbId: undefined,
      url: req.sourceLink,
      sourceLink: req.sourceLink,
      infoUrl: req.infoUrl,
      provider: req.providerValue,
      poster: req.poster,
      background: req.background,
      synopsis: req.synopsis,
      sourceType: 'comic',
      isTorrent: false,
      filePath: chapterDir,
      totalBytes: 0,
      downloadedBytes: 0,
      speed: 0,
      status: 'starting',
      canPause: true,
      canResume: false,
    });

    await notificationService.startForegroundTask(downloadId);

    // 2. Ensure target directory exists
    await RNFS.mkdir(chapterDir);

    // 3. Fetch chapter pages
    const pages = await fetchChapterPages(req.sourceLink, req.providerValue);
    if (!pages || pages.length === 0) {
      throw new Error('No pages found for this chapter');
    }

    const totalPages = pages.length;
    store.updateDownload(downloadId, {
      totalBytes: totalPages,
      status: 'downloading',
      canPause: true,
      canResume: false,
    });

    await updateNotificationThrottled(
      downloadId,
      comicTitle,
      chapterTitle,
      0,
      totalPages,
      true,
    );

    // 4. Download pages in parallel batches
    const rawConcurrency = settingsStorage.getDownloadConcurrency();
    const concurrency = Math.min(Math.max(rawConcurrency, 1), 6);

    let cursor = 0;
    let completedCount = 0;
    const failedIndices: number[] = [];
    const savedFileNames: string[] = new Array(totalPages);

    const downloadSinglePage = async (page: PageImage, index: number) => {
      if (job.isPaused || job.isCancelled) return;

      const ext = getPageExtension(page.imageUrl);
      const fileName = `${String(index + 1).padStart(3, '0')}.${ext}`;
      const targetPath = `${chapterDir}/${fileName}`;
      const tmpPath = `${targetPath}.tmp`;
      savedFileNames[index] = fileName;

      // Check if already completed and non-empty
      const exists = await RNFS.exists(targetPath);
      if (exists) {
        const stat = await RNFS.stat(targetPath);
        if (stat.size > 0) {
          completedCount++;
          store.updateProgress(downloadId, completedCount, totalPages, 0);
          return;
        }
      }

      if (job.isPaused || job.isCancelled) return;

      const headers = await resolvePageHeaders(page);

      let downloadJobId: number | undefined;
      try {
        const result = RNFS.downloadFile({
          fromUrl: page.imageUrl,
          toFile: tmpPath,
          headers,
          background: true,
          connectionTimeout: 15000,
          readTimeout: 30000,
        });

        downloadJobId = result.jobId;
        job.activeJobIds.add(downloadJobId);

        const res = await result.promise;
        job.activeJobIds.delete(downloadJobId);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          await RNFS.moveFile(tmpPath, targetPath);
          completedCount++;
          store.updateProgress(downloadId, completedCount, totalPages, 0);
          updateNotificationThrottled(
            downloadId,
            comicTitle,
            chapterTitle,
            completedCount,
            totalPages,
          );
        } else {
          await RNFS.unlink(tmpPath).catch(() => {});
          throw new Error(`HTTP status ${res.statusCode}`);
        }
      } catch (err) {
        if (downloadJobId) job.activeJobIds.delete(downloadJobId);
        await RNFS.unlink(tmpPath).catch(() => {});
        throw err;
      }
    };

    // Worker pool
    const runWorker = async () => {
      while (cursor < totalPages) {
        if (job.isPaused || job.isCancelled) return;
        const index = cursor++;
        const page = pages[index];
        try {
          await downloadSinglePage(page, index);
        } catch (err) {
          if (!job.isPaused && !job.isCancelled) {
            failedIndices.push(index);
          }
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, totalPages) },
      () => runWorker(),
    );
    await Promise.all(workers);

    // If cancelled or paused during execution
    if (job.isCancelled) {
      activeComicJobs.delete(downloadId);
      await notificationService.stopForegroundTask(downloadId);
      await notificationService.cancelNotification(downloadId);
      store.removeDownload(downloadId);
      return;
    }

    if (job.isPaused) {
      activeComicJobs.delete(downloadId);
      store.markPaused(downloadId);
      store.updateDownload(downloadId, { canPause: false, canResume: true });
      await notificationService.stopForegroundTask(downloadId);
      await notificationService.displayDownloadNotification({
        id: downloadId,
        title: comicTitle,
        body: `Paused ${chapterTitle} (${completedCount}/${totalPages} pages)`,
        onlyAlertOnce: true,
      });
      return;
    }

    // Auto-retry failed pages once if any failed
    if (failedIndices.length > 0) {
      const retryList = [...failedIndices];
      failedIndices.length = 0;
      for (const retryIdx of retryList) {
        if (job.isPaused || job.isCancelled) break;
        try {
          await downloadSinglePage(pages[retryIdx], retryIdx);
        } catch {
          failedIndices.push(retryIdx);
        }
      }
    }

    if (failedIndices.length > 0) {
      activeComicJobs.delete(downloadId);
      await notificationService.stopForegroundTask(downloadId);
      store.markError(downloadId, {
        code: 'FAILED_PAGES',
        message: `${failedIndices.length} pages failed to download`,
        retryable: true,
      });
      store.updateDownload(downloadId, { canPause: false, canResume: true });
      return;
    }

    // 5. Write index.json
    const indexData = {
      id: downloadId,
      title: comicTitle,
      chapterTitle,
      chapterNumber: req.chapterNumber,
      providerValue: req.providerValue,
      infoUrl: req.infoUrl,
      chapterLink: req.sourceLink,
      totalPages,
      pages: savedFileNames.filter(Boolean),
      downloadedAt: Date.now(),
    };
    await RNFS.writeFile(
      `${chapterDir}/index.json`,
      JSON.stringify(indexData, null, 2),
      'utf8',
    );

    // 6. Check CBZ packaging
    let finalPath = chapterDir;
    if (settingsStorage.isExportAsCbzEnabled()) {
      try {
        const cbzPath = `${chapterDir}.cbz`;
        await exportChapterToCbz(chapterDir, cbzPath);
        finalPath = cbzPath;
      } catch (cbzErr) {
        console.warn('[comicDownloader] CBZ packaging error (falling back to folder):', cbzErr);
      }
    }

    // 7. Mark completed
    activeComicJobs.delete(downloadId);
    store.markCompleted(downloadId, {
      filePath: finalPath,
      totalBytes: totalPages,
    });
    store.updateDownload(downloadId, {
      downloadedBytes: totalPages,
      canPause: false,
      canResume: false,
    });

    await notificationService.stopForegroundTask(downloadId);
    await notificationService.displayDownloadNotification({
      id: downloadId,
      title: 'Download complete',
      body: `${comicTitle} - ${chapterTitle} (${totalPages} pages)`,
      onlyAlertOnce: true,
    });
  } catch (err: any) {
    activeComicJobs.delete(downloadId);
    await notificationService.stopForegroundTask(downloadId);
    store.markError(downloadId, {
      code: 'DOWNLOAD_FAILED',
      message: err instanceof Error ? err.message : String(err),
      retryable: true,
    });
    store.updateDownload(downloadId, { canPause: false, canResume: true });
  }
}

/**
 * Pause comic download
 */
export async function pauseComicChapterDownload(downloadId: string): Promise<void> {
  const job = activeComicJobs.get(downloadId);
  if (job) {
    job.isPaused = true;
    for (const jobId of job.activeJobIds) {
      try {
        RNFS.stopDownload(jobId);
      } catch {}
    }
    job.activeJobIds.clear();
  }
  const store = useDownloadsStore.getState();
  store.markPaused(downloadId);
  store.updateDownload(downloadId, { canPause: false, canResume: true });
  await notificationService.stopForegroundTask(downloadId);
}

/**
 * Resume comic download
 */
export async function resumeComicChapterDownload(downloadId: string): Promise<void> {
  const store = useDownloadsStore.getState();
  const record = store.getDownload(downloadId);
  if (!record) return;

  await startComicChapterDownload({
    downloadId: record.id,
    title: record.title,
    showName: record.showName,
    episodeName: record.episodeName,
    seasonTitle: record.seasonTitle,
    episodeIndex: record.episodeIndex,
    providerValue: record.provider || 'unknown',
    infoUrl: record.infoUrl,
    sourceLink: record.sourceLink || record.url,
    poster: record.poster,
    background: record.background,
    synopsis: record.synopsis,
    type: record.type,
  });
}

/**
 * Cancel and delete an in-progress comic download
 */
export async function cancelComicChapterDownload(downloadId: string): Promise<void> {
  const job = activeComicJobs.get(downloadId);
  if (job) {
    job.isCancelled = true;
    for (const jobId of job.activeJobIds) {
      try {
        RNFS.stopDownload(jobId);
      } catch {}
    }
    job.activeJobIds.clear();
  }

  const store = useDownloadsStore.getState();
  const record = store.getDownload(downloadId);
  if (record?.filePath) {
    await RNFS.unlink(record.filePath).catch(() => {});
    await RNFS.unlink(`${record.filePath}.cbz`).catch(() => {});
  }
  store.removeDownload(downloadId);
  await notificationService.stopForegroundTask(downloadId);
  await notificationService.cancelNotification(downloadId);
}

/**
 * Delete a completed comic chapter download
 */
export async function deleteComicChapterDownload(downloadId: string): Promise<boolean> {
  const store = useDownloadsStore.getState();
  const record = store.getDownload(downloadId);
  if (!record) return false;

  if (record.filePath) {
    await RNFS.unlink(record.filePath).catch(() => {});
    if (!record.filePath.endsWith('.cbz')) {
      await RNFS.unlink(`${record.filePath}.cbz`).catch(() => {});
    }
  }
  store.removeDownload(downloadId);
  return true;
}

/**
 * Import a local .cbz or .zip comic archive file
 */
export async function importLocalCbzFile(
  uri: string,
  originalName?: string,
): Promise<{
  id: string;
  title: string;
  targetDir: string;
  pageCount: number;
  coverUri: string;
}> {
  const rawName = originalName || uri.split('/').pop() || 'Comic';
  const cleanName = rawName.replace(/\.(cbz|zip)$/i, '');
  const sanitized = sanitizeDownloadFileName(cleanName);

  const targetDir = `${RNFS.DocumentDirectoryPath}/downloads/local/${sanitized}`;
  await RNFS.mkdir(targetDir);

  // Read the CBZ file as base64
  let base64Data: string;
  if (uri.startsWith('content://')) {
    const cachePath = `${RNFS.CachesDirectoryPath}/${sanitized}.cbz`;
    try {
      await FileSystem.copyAsync({ from: uri, to: cachePath });
      base64Data = await RNFS.readFile(cachePath, 'base64');
      await RNFS.unlink(cachePath).catch(() => {});
    } catch {
      base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  } else {
    const cleanPath = uri.replace(/^file:\/\//, '');
    base64Data = await RNFS.readFile(cleanPath, 'base64');
  }

  const zip = await JSZip.loadAsync(base64Data, { base64: true });
  const imageEntries = Object.keys(zip.files)
    .filter(
      name =>
        !zip.files[name].dir &&
        !name.includes('__MACOSX') &&
        /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(name),
    )
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (imageEntries.length === 0) {
    throw new Error('No images found inside the .cbz archive');
  }

  const savedPages: string[] = [];
  for (let i = 0; i < imageEntries.length; i++) {
    const entryName = imageEntries[i];
    const file = zip.files[entryName];
    const ext = getPageExtension(entryName);
    const pageFileName = `${String(i + 1).padStart(3, '0')}.${ext}`;
    const pagePath = `${targetDir}/${pageFileName}`;
    const fileBase64 = await file.async('base64');
    await RNFS.writeFile(pagePath, fileBase64, 'base64');
    savedPages.push(pageFileName);
  }

  const coverUri = `file://${targetDir}/${savedPages[0]}`;
  const downloadId = `local_${Date.now()}_${sanitized}`;

  // Write index.json
  const indexData = {
    id: downloadId,
    title: cleanName,
    chapterTitle: cleanName,
    providerValue: 'local',
    totalPages: savedPages.length,
    pages: savedPages,
    importedAt: Date.now(),
  };
  await RNFS.writeFile(
    `${targetDir}/index.json`,
    JSON.stringify(indexData, null, 2),
    'utf8',
  );

  // Register in downloadsStore
  useDownloadsStore.getState().addDownload({
    id: downloadId,
    title: cleanName,
    showName: cleanName,
    episodeName: cleanName,
    seasonTitle: 'Local Imports',
    episodeIndex: 0,
    type: 'series',
    provider: 'local',
    sourceType: 'comic',
    isTorrent: false,
    url: coverUri,
    poster: coverUri,
    background: coverUri,
    filePath: targetDir,
    totalBytes: savedPages.length,
    downloadedBytes: savedPages.length,
    status: 'completed',
    speed: 0,
    canPause: false,
    canResume: false,
    completedAt: Date.now(),
  });

  return {
    id: downloadId,
    title: cleanName,
    targetDir,
    pageCount: savedPages.length,
    coverUri,
  };
}

/**
 * Check if a local chapter exists (as folder or .cbz) and load ReaderPageItem[]
 */
export async function loadLocalChapterPages(
  folderOrCbzPath: string,
): Promise<ReaderPageItem[] | null> {
  const cleanPath = folderOrCbzPath.replace(/^file:\/\//, '');

  try {
    const exists = await RNFS.exists(cleanPath);
    if (!exists) return null;

    // Case 1: .cbz file
    if (cleanPath.endsWith('.cbz') || cleanPath.endsWith('.zip')) {
      const cacheDir = `${RNFS.CachesDirectoryPath}/cbz_extracted/${sanitizeDownloadFileName(cleanPath.split('/').pop() || 'cbz')}`;
      await RNFS.mkdir(cacheDir);

      const base64Data = await RNFS.readFile(cleanPath, 'base64');
      const zip = await JSZip.loadAsync(base64Data, { base64: true });
      const imageEntries = Object.keys(zip.files)
        .filter(
          name =>
            !zip.files[name].dir &&
            !name.includes('__MACOSX') &&
            /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(name),
        )
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      const pages: ReaderPageItem[] = [];
      for (let i = 0; i < imageEntries.length; i++) {
        const entryName = imageEntries[i];
        const file = zip.files[entryName];
        const ext = getPageExtension(entryName);
        const fileName = `${String(i + 1).padStart(3, '0')}.${ext}`;
        const outPath = `${cacheDir}/${fileName}`;

        const pageExists = await RNFS.exists(outPath);
        if (!pageExists) {
          const fileBase64 = await file.async('base64');
          await RNFS.writeFile(outPath, fileBase64, 'base64');
        }

        pages.push({
          index: i,
          imageUrl: `file://${outPath}`,
        });
      }
      return pages.length > 0 ? pages : null;
    }

    // Case 2: directory
    const stat = await RNFS.stat(cleanPath);
    if (stat.isDirectory()) {
      const entries = await RNFS.readDir(cleanPath);
      const imageFiles = entries
        .filter(
          f =>
            f.isFile() &&
            /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(f.name) &&
            !f.name.startsWith('.'),
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );

      if (imageFiles.length > 0) {
        return imageFiles.map((file, idx) => ({
          index: idx,
          imageUrl: `file://${file.path}`,
        }));
      }
    }
  } catch (err) {
    console.warn('[comicDownloader] loadLocalChapterPages error:', err);
  }

  return null;
}
