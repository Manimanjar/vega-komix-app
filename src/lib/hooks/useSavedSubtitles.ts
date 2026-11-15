import {useCallback} from 'react';

export interface SubtitleInput {
  uri: string;
  title?: string;
  language?: string;
  type?: string;
}

export interface SavedSubtitle extends SubtitleInput {
  id: string;
  videoKey: string;
  uri: string;
  originalUri: string;
  title: string;
  language: string;
  type: string;
  origin: 'search' | 'file';
  size: number;
  addedAt: number;
}

/**
 * Stubbed useSavedSubtitles (video subtitles are obsolete in Vega Komix reader)
 */
export function useSavedSubtitles(_videoKey: string) {
  const add = useCallback(async () => undefined, []);
  const remove = useCallback(async () => undefined, []);
  return {
    savedSubtitles: [] as SavedSubtitle[],
    saveSubtitle: add,
    removeSavedSubtitle: remove,
  };
}
