import type { DownloadBackend, DownloadBackendContext } from './types';
import type { DownloadItem } from '../zustand/downloadsStore';
import {
  startComicChapterDownload,
  pauseComicChapterDownload,
  resumeComicChapterDownload,
  cancelComicChapterDownload,
  deleteComicChapterDownload,
} from '../comicDownloader';

export const comicDownloadBackend: DownloadBackend = {
  directToSaf: false,
  preservePartialOnFailure: true,
  preserveStagingOnFailure: true,
  restartOnResume: false,

  async start(context: DownloadBackendContext): Promise<void> {
    const record = context.record;
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
  },

  async pause(downloadId: string): Promise<void> {
    await pauseComicChapterDownload(downloadId);
  },

  async resume(downloadId: string): Promise<void> {
    await resumeComicChapterDownload(downloadId);
  },

  async cancel(downloadId: string): Promise<void> {
    await cancelComicChapterDownload(downloadId);
  },

  async cleanup(downloadId: string, _record?: DownloadItem): Promise<void> {
    await deleteComicChapterDownload(downloadId);
  },
};
