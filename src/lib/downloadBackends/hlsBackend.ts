import {cleanupDownloadStaging} from '../downloadDestination';
import type {DownloadBackend, DownloadBackendContext} from './types';

/**
 * Legacy HLS video downloader stub (obsolete in Vega Komix reader)
 */
export const hlsDownloadBackend: DownloadBackend = {
  preserveStagingOnFailure: false,
  restartOnResume: false,
  async start({record}: DownloadBackendContext): Promise<void> {
    throw new Error(`Video downloads are deprecated in Vega Komix reader (${record.title})`);
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
