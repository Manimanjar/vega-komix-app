import {useEffect, useState} from 'react';
import {
  getCachedProcessedTitle,
  needsTitleTranslation,
  processAndTranslateTitle,
} from './titleTranslator';

/**
 * Smart title translation hook:
 * - Natural English / Western comic titles are left untouched.
 * - Japanese, CJK, Romaji, and foreign titles are translated to English
 *   via Google Translate with persistent caching (preserving all brackets).
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
    return original;
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

    setTranslated(original);
    if (!requiresTranslation) {
      return;
    }

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
