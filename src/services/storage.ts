/**
 * Storage facade for chapter tracking and library bookmarks
 */
import {
  watchListStorage,
  getUnreadChapterCount,
  type WatchListItem,
} from '../lib/storage/WatchListStorage';

export {
  watchListStorage,
  getUnreadChapterCount,
  type WatchListItem,
};

export const recordChapterCount = (
  comicLink: string,
  currentTotalChapters: number,
) => watchListStorage.recordChapterCount(comicLink, currentTotalChapters);

export const acknowledgeChapters = (
  comicLink: string,
  totalChapters?: number,
) => watchListStorage.acknowledgeChapters(comicLink, totalChapters);

export const recordLastReadChapter = (
  comicLink: string,
  chapterNumber: number,
) => watchListStorage.recordLastReadChapter(comicLink, chapterNumber);

export const markComicAsNew = (
  comicLink: string,
  isNew: boolean,
) => watchListStorage.markComicAsNew(comicLink, isNew);

export const getNewComicStatus = (
  comicLink: string,
) => watchListStorage.getNewComicStatus(comicLink);
