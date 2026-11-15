import {cleanupDownloadStaging} from '../downloadDestination';
import type {DownloadBackend, DownloadBackendContext} from './types';

/**
 * Legacy Torrent video downloader stub (obsolete in Vega Komix reader)
 */
export const torrentDownloadBackend: DownloadBackend = {
  async start({record}: DownloadBackendContext): Promise<void> {
    throw new Error(`Torrent downloads are deprecated in Vega Komix reader (${record.title})`);
  },
  async pause(): Promise<void> {},
  async resume(): Promise<void> {},
  async cancel(downloadId: string): Promise<void> {
    await cleanupDownloadStaging(downloadId);
  },
  async cleanup(downloadId: string): Promise<void> {
    await cleanupDownloadStaging(downloadId);
  },
};
