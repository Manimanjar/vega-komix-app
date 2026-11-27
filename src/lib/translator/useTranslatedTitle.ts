import {useEffect, useState} from 'react';
import {
  getCachedProcessedTitle,
  needsTitleTranslation,
  processAndTranslateTitle,
  stripBracketedTags,
} from './titleTranslator';

/**
 * Smart title cleanup & translation hook:
 * - Natural English / Western comic titles are left untouched (brackets preserved).
 * - Japanese, CJK, Romaji, and foreign titles have bracketed metadata stripped
 *   and are translated to natural English via Google Translate with persistent
 *   local caching and offline fallback to the bracket-stripped core title.
 */
export function useTranslatedTitle(title: string | undefined | null): {
  translated: string;
  original: string;
  isTranslated: boolean;
  needsTranslation: boolean;
} {
  const original = (title ?? '').trim();
  const requiresTranslation = needsTitleTranslation(original);

  const [translated, setTranslated] = useState<string>(() => {
    if (!original) return '';
    const cached = getCachedProcessedTitle(original);
    if (cached) return cached.translatedTitle;
    return requiresTranslation ? stripBracketedTags(original) : original;
  });

  useEffect(() => {
    if (!original) {
      setTranslated('');
      return;
    }

    const cached = getCachedProcessedTitle(original);
    if (cached) {
      setTranslated(cached.translatedTitle);
      return;
    }

    if (!requiresTranslation) {
      setTranslated(original);
      return;
    }

    // Immediate clean fallback while translation request is in flight
    setTranslated(stripBracketedTags(original));

    let cancelled = false;
    const controller = new AbortController();
    processAndTranslateTitle(original, controller.signal)
      .then(result => {
        if (!cancelled) {
          setTranslated(result.translatedTitle);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [original, requiresTranslation]);

  return {
    translated: translated || original,
    original,
    isTranslated:
      requiresTranslation && translated !== '' && translated !== original,
    needsTranslation: requiresTranslation,
  };
}
