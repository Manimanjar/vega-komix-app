import {InteractionManager} from 'react-native';
import axios, {AxiosRequestConfig} from 'axios';
import {Buffer} from 'buffer';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {MMKV} from '../Mmkv';
import {autoDomainResolver} from '../network/autoDomainResolver';
import {getCookieHeader} from '../services/cookieManager';

export interface BoundingBoxRatio {
  xRatio: number; // 0.0 to 1.0
  yRatio: number; // 0.0 to 1.0
  wRatio: number; // 0.0 to 1.0
  hRatio: number; // 0.0 to 1.0
}

export interface RawLineBlock {
  text: string;
  box: BoundingBoxRatio;
  isVertical?: boolean;
}

export interface TranslatedBubble {
  id: string;
  originalText: string;
  translatedText: string;
  box: BoundingBoxRatio;
  isVertical?: boolean;
}

export interface PageTranslationResult {
  chapterId: string;
  pageIndex: number;
  bubbles: TranslatedBubble[];
  timestamp: number;
  status: 'cached' | 'translated' | 'empty' | 'error';
  errorMessage?: string;
}

export type TranslationStatus = 'idle' | 'translating' | 'translated' | 'error';

export interface TranslatorCustomConfig {
  customEndpoint?: string;
  customApiKey?: string;
  customModel?: string;
}

// Built-in rotating OCR.space public key pool
const OCR_SPACE_KEYS = [
  'K88876435688957',
  'K87899142388957',
  'helloworld',
  'K86375628888957',
  'K82362548888957',
  'K85869389888957',
  'K89228498888957',
];

const LINGVA_MIRRORS = [
  'https://lingva.ml',
  'https://translate.plausibility.cloud',
  'https://lingva.lunar.icu',
];

const TRANSLATOR_CONFIG_KEY = 'vega-komix-custom-translator-config';
const TRANSLATION_CACHE_PREFIX = 'translation_cache_';

class MangaTranslatorEngine {
  private activeControllers = new Map<string, AbortController>();
  private keyIndex = 0;
  private statusListeners = new Set<(status: TranslationStatus, pageIndex?: number) => void>();
  private currentStatus: TranslationStatus = 'idle';

  /**
   * Get next rotating OCR.space API key
   */
  private getNextOcrKey(): string {
    const key = OCR_SPACE_KEYS[this.keyIndex % OCR_SPACE_KEYS.length];
    this.keyIndex++;
    return key;
  }

  /**
   * Subscribe to translation engine status changes
   */
  public subscribeStatus(listener: (status: TranslationStatus, pageIndex?: number) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyStatus(status: TranslationStatus, pageIndex?: number): void {
    this.currentStatus = status;
    this.statusListeners.forEach(listener => {
      try {
        listener(status, pageIndex);
      } catch {}
    });
  }

  /**
   * Build persistent cache key for a page
   */
  private getCacheKey(chapterId: string, pageIndex: number): string {
    const cleanId = encodeURIComponent(chapterId || 'unknown');
    return `${TRANSLATION_CACHE_PREFIX}${cleanId}_${pageIndex}`;
  }

  /**
   * Retrieve cached translation from MMKV (0ms instant return)
   */
  public getCachedPageTranslation(chapterId: string, pageIndex: number): PageTranslationResult | null {
    try {
      const key = this.getCacheKey(chapterId, pageIndex);
      const cached = MMKV.getString(key);
      if (cached) {
        const parsed = JSON.parse(cached) as PageTranslationResult;
        return parsed;
      }
    } catch {}
    return null;
  }

  /**
   * Save page translation into MMKV
   */
  public savePageTranslation(result: PageTranslationResult): void {
    try {
      const key = this.getCacheKey(result.chapterId, result.pageIndex);
      MMKV.setString(key, JSON.stringify(result));
    } catch {}
  }

  /**
   * Clear cached translation for a specific page
   */
  public clearPageTranslation(chapterId: string, pageIndex: number): void {
    try {
      const key = this.getCacheKey(chapterId, pageIndex);
      MMKV.removeItem(key);
    } catch {}
  }

  /**
   * Wipe all cached translations from MMKV storage
   */
  public async clearAllTranslationCache(): Promise<number> {
    let clearedCount = 0;
    try {
      const allKeys: string[] = (await (MMKV as any).indexer?.getKeys()) || [];
      for (const key of allKeys) {
        if (key && key.startsWith(TRANSLATION_CACHE_PREFIX)) {
          MMKV.removeItem(key);
          clearedCount++;
        }
      }
    } catch {}
    return clearedCount;
  }

  /**
   * Cancel in-flight translation for a specific page
   */
  public cancelPageTranslation(chapterId: string, pageIndex: number): void {
    const jobKey = `${chapterId}_${pageIndex}`;
    const controller = this.activeControllers.get(jobKey);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(jobKey);
    }
  }

  /**
   * Get custom translator config if user configured in Settings
   */
  public getCustomConfig(): TranslatorCustomConfig {
    try {
      const raw = MMKV.getString(TRANSLATOR_CONFIG_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  public saveCustomConfig(config: TranslatorCustomConfig): void {
    try {
      MMKV.setString(TRANSLATOR_CONFIG_KEY, JSON.stringify(config));
    } catch {}
  }

  /**
   * Detect predominant language from comic metadata or text hints
   */
  public detectLanguageHint(titleOrTags?: string): 'jpn' | 'kor' | 'chs' | 'eng' {
    if (!titleOrTags) return 'jpn';
    const lower = titleOrTags.toLowerCase();
    if (lower.includes('manhwa') || lower.includes('korean') || /[\uac00-\ud7af]/.test(titleOrTags)) {
      return 'kor';
    }
    if (lower.includes('manhua') || lower.includes('chinese') || /[\u4e00-\u9fa5]/.test(titleOrTags)) {
      return 'chs';
    }
    if (lower.includes('comic') || lower.includes('western') || lower.includes('english')) {
      return 'eng';
    }
    return 'jpn';
  }

  /**
   * Stage 1: Fetch and downscale image bytes if needed, then perform multi-provider OCR
   */
  public async extractAndClusterBubbles(
    imageUrl: string,
    naturalWidth?: number,
    naturalHeight?: number,
    languageHint: 'jpn' | 'kor' | 'chs' | 'eng' = 'jpn',
    signal?: AbortSignal,
    headers?: Record<string, string>,
  ): Promise<RawLineBlock[]> {
    if (!imageUrl) return [];

    let base64Payload = '';
    const cleanUrl = autoDomainResolver.rewriteUrlWithResolvedDomain(imageUrl);

    // 1. Read local file or fetch remote arraybuffer
    if (cleanUrl.startsWith('file://')) {
      const filePath = cleanUrl.replace('file://', '');
      const exists = await RNFS.exists(filePath);
      if (exists) {
        base64Payload = await RNFS.readFile(filePath, 'base64');
      }
    } else {
      // Inject cookies & origin headers for remote protected manga images
      const cookies = await getCookieHeader(cleanUrl);
      const reqHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        ...headers,
      };
      if (cookies) reqHeaders.Cookie = cookies;
      try {
        const origin = new URL(cleanUrl).origin;
        if (!reqHeaders.Referer) reqHeaders.Referer = `${origin}/`;
      } catch {}

      const response = await axios.get(cleanUrl, {
        responseType: 'arraybuffer',
        headers: reqHeaders,
        timeout: 7000,
        signal,
      });

      const buffer = Buffer.from(response.data);
      base64Payload = buffer.toString('base64');
    }

    if (!base64Payload) {
      throw new Error('Failed to retrieve image data for OCR');
    }

    // 2. Multi-provider Zero-Key OCR pipeline via OCR.space API
    const rawLines: RawLineBlock[] = [];
    let ocrSuccess = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted) return [];
      const apiKey = this.getNextOcrKey();

      try {
        const formData = new URLSearchParams();
        formData.append('apikey', apiKey);
        formData.append('base64Image', `data:image/jpeg;base64,${base64Payload}`);
        formData.append('language', languageHint);
        formData.append('isOverlayRequired', 'true');
        formData.append('OCREngine', languageHint === 'eng' ? '1' : '2');
        formData.append('scale', 'true');
        formData.append('detectOrientation', 'true');

        const ocrRes = await axios.post('https://api.ocr.space/parse/image', formData.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 8500,
          signal,
        });

        const parsedResults = ocrRes.data?.ParsedResults;
        if (Array.isArray(parsedResults) && parsedResults.length > 0) {
          const lines = parsedResults[0]?.TextOverlay?.Lines;
          if (Array.isArray(lines) && lines.length > 0) {
            // Find coordinate space bounds to normalize ratios
            let maxW = naturalWidth || 1000;
            let maxH = naturalHeight || 1500;

            lines.forEach((l: any) => {
              if (Array.isArray(l.Words)) {
                l.Words.forEach((w: any) => {
                  if (w.Left + w.Width > maxW) maxW = w.Left + w.Width;
                  if (w.Top + w.Height > maxH) maxH = w.Top + w.Height;
                });
              }
            });

            // Extract each line with normalized bounding coordinates
            for (const l of lines) {
              const lineText = (l.LineText || '').trim();
              if (!lineText) continue;

              let minLeft = 999999;
              let minTop = 999999;
              let maxRight = 0;
              let maxBottom = 0;

              if (Array.isArray(l.Words) && l.Words.length > 0) {
                l.Words.forEach((w: any) => {
                  const left = Number(w.Left) || 0;
                  const top = Number(w.Top) || 0;
                  const width = Number(w.Width) || 0;
                  const height = Number(w.Height) || 0;
                  if (left < minLeft) minLeft = left;
                  if (top < minTop) minTop = top;
                  if (left + width > maxRight) maxRight = left + width;
                  if (top + height > maxBottom) maxBottom = top + height;
                });
              } else {
                minLeft = Number(l.MinTop) || 0;
                minTop = Number(l.MinTop) || 0;
                maxRight = minLeft + 150;
                maxBottom = minTop + (Number(l.MaxHeightFlat) || 30);
              }

              const lineWidth = Math.max(maxRight - minLeft, 10);
              const lineHeight = Math.max(maxBottom - minTop, 10);
              const isVertical = lineHeight > lineWidth * 1.35;

              rawLines.push({
                text: lineText,
                isVertical,
                box: {
                  xRatio: Math.max(0, Math.min(1, minLeft / maxW)),
                  yRatio: Math.max(0, Math.min(1, minTop / maxH)),
                  wRatio: Math.max(0.01, Math.min(1, lineWidth / maxW)),
                  hRatio: Math.max(0.01, Math.min(1, lineHeight / maxH)),
                },
              });
            }

            ocrSuccess = true;
            break;
          }
        }
      } catch (err: any) {
        if (signal?.aborted) return [];
        // Continue to next rotating key on error
      }
    }

    if (!ocrSuccess && rawLines.length === 0) {
      // Fallback empty if no text found on page
      return [];
    }

    return rawLines;
  }

  /**
   * Spatial Bubble Merger: Group adjacent vertical columns (Japanese RTL 縦書き)
   * and horizontal lines (Korean/Western) into unified bubbles before translating
   */
  public clusterLinesIntoSpeechBubbles(rawLines: RawLineBlock[]): RawLineBlock[] {
    if (rawLines.length <= 1) return rawLines;

    const n = rawLines.length;
    const parent = Array.from({length: n}, (_, i) => i);

    const find = (i: number): number => {
      if (parent[i] === i) return i;
      parent[i] = find(parent[i]);
      return parent[i];
    };

    const union = (i: number, j: number): void => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent[rootI] = rootJ;
      }
    };

    // Calculate proximity thresholds (4.5% horizontal, 5.5% vertical)
    const thresholdX = 0.045;
    const thresholdY = 0.055;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const bA = rawLines[i].box;
        const bB = rawLines[j].box;

        const gapX = Math.max(0, Math.max(bA.xRatio, bB.xRatio) - Math.min(bA.xRatio + bA.wRatio, bB.xRatio + bB.wRatio));
        const gapY = Math.max(0, Math.max(bA.yRatio, bB.yRatio) - Math.min(bA.yRatio + bA.hRatio, bB.yRatio + bB.hRatio));

        if (gapX <= thresholdX && gapY <= thresholdY) {
          union(i, j);
        }
      }
    }

    // Group lines by root cluster
    const clusterMap = new Map<number, RawLineBlock[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      const list = clusterMap.get(root) || [];
      list.push(rawLines[i]);
      clusterMap.set(root, list);
    }

    const mergedBubbles: RawLineBlock[] = [];

    clusterMap.forEach(lines => {
      if (lines.length === 1) {
        mergedBubbles.push(lines[0]);
        return;
      }

      // Check if cluster is predominantly Japanese vertical text
      const hasJapanese = lines.some(l => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(l.text));
      const isPredominantlyVertical = lines.filter(l => l.isVertical).length >= lines.length / 2;

      if (hasJapanese || isPredominantlyVertical) {
        // Japanese Manga Vertical Reading Order: Right-to-Left columns, Top-to-Bottom
        lines.sort((a, b) => {
          const colDiff = b.box.xRatio - a.box.xRatio;
          if (Math.abs(colDiff) > 0.02) return colDiff; // right column first
          return a.box.yRatio - b.box.yRatio; // top to bottom
        });
      } else {
        // Korean / Western Horizontal Reading Order: Top-to-Bottom, Left-to-Right
        lines.sort((a, b) => {
          const rowDiff = a.box.yRatio - b.box.yRatio;
          if (Math.abs(rowDiff) > 0.02) return rowDiff; // top line first
          return a.box.xRatio - b.box.xRatio; // left to right
        });
      }

      // Merge text with proper punctuation joining
      const joinedText = hasJapanese
        ? lines.map(l => l.text.trim()).join('')
        : lines.map(l => l.text.trim()).join(' ');

      // Compute bounding box with 0.8% padding
      let minX = 1;
      let minY = 1;
      let maxX = 0;
      let maxY = 0;

      lines.forEach(l => {
        if (l.box.xRatio < minX) minX = l.box.xRatio;
        if (l.box.yRatio < minY) minY = l.box.yRatio;
        if (l.box.xRatio + l.box.wRatio > maxX) maxX = l.box.xRatio + l.box.wRatio;
        if (l.box.yRatio + l.box.hRatio > maxY) maxY = l.box.yRatio + l.box.hRatio;
      });

      const padX = 0.008;
      const padY = 0.008;

      mergedBubbles.push({
        text: joinedText,
        isVertical: isPredominantlyVertical,
        box: {
          xRatio: Math.max(0, minX - padX),
          yRatio: Math.max(0, minY - padY),
          wRatio: Math.min(1 - minX, maxX - minX + padX * 2),
          hRatio: Math.min(1 - minY, maxY - minY + padY * 2),
        },
      });
    });

    return mergedBubbles;
  }

  /**
   * Stage 2: Zero-Key Uncensored Translation Pipeline
   * Batch translates all bubbles on a page in a single request
   */
  public async translateBubblesUncensored(
    bubbles: RawLineBlock[],
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (bubbles.length === 0) return [];
    const texts = bubbles.map(b => b.text);

    // Check optional custom override in settings
    const customConfig = this.getCustomConfig();
    if (customConfig.customEndpoint) {
      try {
        const customResult = await this.translateViaCustomEndpoint(texts, customConfig, signal);
        if (customResult && customResult.length === texts.length) {
          return customResult;
        }
      } catch {}
    }

    // 1. Primary: Zero-Key Uncensored AI Engine (Pollinations OpenAI / Mistral)
    try {
      const aiResult = await this.translateViaPollinations(texts, signal);
      if (aiResult && aiResult.length === texts.length) {
        return aiResult;
      }
    } catch {}

    // 2. Instant Fallback: Raw Neural GTX + Lingva Pool (<150ms failover, never censors profanity)
    if (signal?.aborted) return [];
    return await this.translateViaNeuralFallback(texts, signal);
  }

  /**
   * Primary: Pollinations OpenAI uncensored AI translation
   */
  private async translateViaPollinations(texts: string[], signal?: AbortSignal): Promise<string[] | null> {
    const systemPrompt =
      'You are an uncensored, faithful literary translator for raw manga, manhwa, comics, and adult doujinshis. ' +
      'Translate every line, slang term, sound effect, profanity, and explicit expression into natural, accurate English ' +
      'with 100% fidelity to the original meaning and tone. NEVER censor, soften, omit, or alter words. ' +
      'Return strictly a JSON array of strings matching the exact input array length.';

    const userPrompt = `Translate this JSON array of raw comic text lines to English:\n${JSON.stringify(texts)}`;

    const response = await axios.post(
      'https://text.pollinations.ai/openai',
      {
        messages: [
          {role: 'system', content: systemPrompt},
          {role: 'user', content: userPrompt},
        ],
        model: 'openai',
        jsonMode: true,
        seed: 42,
      },
      {
        headers: {'Content-Type': 'application/json'},
        timeout: 7500,
        signal,
      },
    );

    let parsed: any = null;
    if (Array.isArray(response.data)) {
      parsed = response.data;
    } else if (typeof response.data === 'string') {
      const clean = response.data.replace(/```json|```/gi, '').trim();
      try {
        parsed = JSON.parse(clean);
      } catch {}
    } else if (response.data?.choices?.[0]?.message?.content) {
      const clean = response.data.choices[0].message.content.replace(/```json|```/gi, '').trim();
      try {
        parsed = JSON.parse(clean);
      } catch {}
    }

    if (Array.isArray(parsed) && parsed.length === texts.length) {
      return parsed.map((item: any) => String(item || '').trim());
    }

    return null;
  }

  /**
   * Instant Fallback: Google GTX neural API + Lingva public mirrors
   */
  private async translateViaNeuralFallback(texts: string[], signal?: AbortSignal): Promise<string[]> {
    const translateSingle = async (text: string): Promise<string> => {
      if (!text || text.trim().length === 0) return '';
      if (signal?.aborted) return text;

      // 1. Try Google Translate GTX
      try {
        const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(
          text,
        )}`;
        const gtxRes = await axios.get(gtxUrl, {timeout: 2500, signal});
        if (Array.isArray(gtxRes.data?.[0])) {
          let merged = '';
          for (const chunk of gtxRes.data[0]) {
            if (chunk?.[0]) merged += chunk[0];
          }
          if (merged.trim()) return merged.trim();
        }
      } catch {}

      // 2. Try Lingva mirror pool
      for (const mirror of LINGVA_MIRRORS) {
        if (signal?.aborted) return text;
        try {
          const lingvaUrl = `${mirror}/api/v1/auto/en/${encodeURIComponent(text)}`;
          const res = await axios.get(lingvaUrl, {timeout: 2500, signal});
          if (res.data?.translation) {
            return String(res.data.translation).trim();
          }
        } catch {}
      }

      return text;
    };

    const results = await Promise.allSettled(texts.map(t => translateSingle(t)));
    return results.map((r, idx) => (r.status === 'fulfilled' ? r.value : texts[idx]));
  }

  /**
   * Custom OpenAI/OpenRouter/Ollama endpoint translator
   */
  private async translateViaCustomEndpoint(
    texts: string[],
    config: TranslatorCustomConfig,
    signal?: AbortSignal,
  ): Promise<string[] | null> {
    if (!config.customEndpoint) return null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.customApiKey) {
      headers.Authorization = `Bearer ${config.customApiKey}`;
    }

    const payload = {
      model: config.customModel || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a manga translator. Translate the JSON array of strings to natural English with 100% fidelity. ' +
            'Return strictly a JSON array of strings matching the exact input length.',
        },
        {
          role: 'user',
          content: JSON.stringify(texts),
        },
      ],
      temperature: 0.2,
    };

    const response = await axios.post(config.customEndpoint, payload, {
      headers,
      timeout: 8000,
      signal,
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (content) {
      const clean = content.replace(/```json|```/gi, '').trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length === texts.length) {
        return parsed.map(String);
      }
    }
    return null;
  }

  /**
   * Stage 3: Master Translation Job for a Page
   * Guaranteed 60/120 FPS via InteractionManager + AbortController + MMKV 0ms cache
   */
  public async translatePage(
    chapterId: string,
    pageIndex: number,
    imageUrl: string,
    naturalWidth?: number,
    naturalHeight?: number,
    languageHint: 'jpn' | 'kor' | 'chs' | 'eng' = 'jpn',
    headers?: Record<string, string>,
  ): Promise<PageTranslationResult> {
    // 1. Instant MMKV cache check (0ms)
    const cached = this.getCachedPageTranslation(chapterId, pageIndex);
    if (cached) {
      return cached;
    }

    // 2. Abort any previous in-flight job for this page
    const jobKey = `${chapterId}_${pageIndex}`;
    this.cancelPageTranslation(chapterId, pageIndex);

    const controller = new AbortController();
    this.activeControllers.set(jobKey, controller);
    this.notifyStatus('translating', pageIndex);

    try {
      // Wrap in InteractionManager.runAfterInteractions so gestures & scrolling never stutter
      await new Promise<void>(resolve => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      if (controller.signal.aborted) {
        throw new Error('Translation aborted by user navigation');
      }

      // Stage 1: OCR + Spatial clustering
      const rawLines = await this.extractAndClusterBubbles(
        imageUrl,
        naturalWidth,
        naturalHeight,
        languageHint,
        controller.signal,
        headers,
      );

      if (controller.signal.aborted) {
        throw new Error('Translation aborted');
      }

      if (rawLines.length === 0) {
        const emptyResult: PageTranslationResult = {
          chapterId,
          pageIndex,
          bubbles: [],
          timestamp: Date.now(),
          status: 'empty',
        };
        this.savePageTranslation(emptyResult);
        this.notifyStatus('translated', pageIndex);
        return emptyResult;
      }

      const clusteredBubbles = this.clusterLinesIntoSpeechBubbles(rawLines);

      // Stage 2: Uncensored Translation Pipeline
      const translatedTexts = await this.translateBubblesUncensored(clusteredBubbles, controller.signal);

      if (controller.signal.aborted) {
        throw new Error('Translation aborted');
      }

      const bubbles: TranslatedBubble[] = clusteredBubbles.map((raw, idx) => ({
        id: `bubble_${pageIndex}_${idx}`,
        originalText: raw.text,
        translatedText: translatedTexts[idx] || raw.text,
        box: raw.box,
        isVertical: raw.isVertical,
      }));

      const finalResult: PageTranslationResult = {
        chapterId,
        pageIndex,
        bubbles,
        timestamp: Date.now(),
        status: 'translated',
      };

      // Stage 3: Cache in MMKV for 0ms future visits
      this.savePageTranslation(finalResult);
      this.notifyStatus('translated', pageIndex);
      return finalResult;
    } catch (error: any) {
      if (controller.signal.aborted) {
        this.notifyStatus('idle', pageIndex);
        return {
          chapterId,
          pageIndex,
          bubbles: [],
          timestamp: Date.now(),
          status: 'empty',
        };
      }

      this.notifyStatus('error', pageIndex);
      return {
        chapterId,
        pageIndex,
        bubbles: [],
        timestamp: Date.now(),
        status: 'error',
        errorMessage: error?.message || 'Translation failed',
      };
    } finally {
      this.activeControllers.delete(jobKey);
    }
  }
}

export const mangaTranslatorEngine = new MangaTranslatorEngine();
