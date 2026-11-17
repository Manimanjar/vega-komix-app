import {useEffect, useState} from 'react';
import {mangaTranslatorEngine} from './mangaTranslatorEngine';

/**
 * Translates a comic title to proper English (uncensored, meaning
 * unchanged) and returns the translated title plus the original.
 *
 * - While loading (or when the title is already English), `translated`
 *   equals the original, so callers never show a blank or stale title.
 * - `isTranslated` is true only when the English title genuinely differs
 *   from the original — callers render the original below it in small
 *   grey letters only in that case.
 * - Results are cached by title string in the engine, so a second render
 *   of the same title is instant and costs no request.
 */
export function useTranslatedTitle(title: string | undefined | null): {
  translated: string;
  original: string;
  isTranslated: boolean;
} {
  const original = title ?? '';
  const [translated, setTranslated] = useState(original);

  useEffect(() => {
    setTranslated(original);
    if (!original) return;
    const cached = mangaTranslatorEngine.getCachedTitleTranslation(original);
    if (cached) {
      setTranslated(cached.translated);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    mangaTranslatorEngine
      .translateTitle(original, controller.signal)
      .then(result => {
        if (!cancelled) setTranslated(result.translated);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [original]);

  return {
    translated: translated || original,
    original,
    isTranslated: translated !== '' && translated !== original,
  };
}
