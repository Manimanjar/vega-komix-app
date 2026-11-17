import {throwIfProviderAborted} from '../sandbox/abort';
import {getStreamDrm} from '../player/streamDrm';
import {ToastAndroid} from 'react-native';
import axios from 'axios';
import {headers as commonHeaders} from '../providers/headers';
import {
  Catalog,
  EpisodeLink,
  Info,
  Post,
  Stream,
  SettingsField,
  ChapterLink,
  PageImage,
} from '../providers/types';
import {extensionManager} from './ExtensionManager';
import {extensionStorage} from '../storage/extensionStorage';
import {providerKvStorage} from '../storage/StorageService';
import {getSourceAuthHeaders} from '../storage/sourceTokenStorage';
import {getProviderFilesUrl} from '../utils/helpers';
import {MAX_STATE_BYTES} from '../sandbox/protocol';
import {sandboxBridge, setSandboxStateHandler} from '../sandbox/sandboxBridge';
import {
  getProviderKvPrefix,
  providerAuthor,
  providerScopeId,
} from '../sandbox/providerScope';
import {getJarCookieHeader} from '../sandbox/providerCookieJar';

/** Module code and the source author it came from. */
interface ProviderCode {
  code: string;
  author: string;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized || fallback;
  } catch {
    return fallback;
  }
};

export class ProviderManager {
  // Keyed by providerScopeId(author, value).
  private readonly providerState = new Map<string, Record<string, unknown>>();
  private readonly settingsSchemaCache = new Map<string, SettingsField[]>();

  constructor() {
    setSandboxStateHandler((providerValue, author, state) => {
      try {
        this.saveProviderState(providerScopeId(author, providerValue), state);
      } catch (error) {
        console.warn('Discarding provider state:', error);
      }
    });
  }

  clearProviderState(providerValue: string): void {
    const suffix = `/${encodeURIComponent(providerValue)}`;
    for (const scope of Array.from(this.providerState.keys())) {
      if (scope.endsWith(suffix)) {
        this.providerState.delete(scope);
      }
    }
    for (const key of Array.from(this.settingsSchemaCache.keys())) {
      if (key.endsWith(`:${providerValue}`)) {
        this.settingsSchemaCache.delete(key);
        this.settingsActionModules.delete(key);
      }
    }
  }

  private getProviderState(scope: string): Record<string, unknown> {
    const current = this.providerState.get(scope);
    if (!current) {
      return {};
    }
    try {
      return JSON.parse(JSON.stringify(current));
    } catch {
      return {};
    }
  }

  private saveProviderState(scope: string, value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Provider state must be an object');
    }
    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized.length > MAX_STATE_BYTES) {
      throw new Error('Provider state exceeds the 256 KB limit');
    }
    this.providerState.set(
      scope,
      JSON.parse(serialized) as Record<string, unknown>,
    );
  }

  private getModule(
    providerValue: string,
    key:
      | 'catalog'
      | 'posts'
      | 'meta'
      | 'stream'
      | 'episodes'
      | 'settings'
      | 'chapters'
      | 'pages',
  ): ProviderCode | undefined {
    const module = extensionManager.getProviderModules(providerValue);
    const code = module?.modules[key];
    return code
      ? {code, author: providerAuthor(module?.sourceAuthor)}
      : undefined;
  }

  private executeModule<T>(
    module: ProviderCode,
    providerValue: string,
    exportName?: string,
    args: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    return sandboxBridge.invoke<T>({
      moduleCode: module.code,
      providerValue,
      author: module.author,
      exportName,
      // commonHeaders is passed per invoke because it is platform dependent and
      // the sandbox realm cannot read Platform itself.
      args: {...args, commonHeaders},
      state: this.getProviderState(
        providerScopeId(module.author, providerValue),
      ),
      signal,
    });
  }

  private requireArray<T>(
    value: unknown,
    providerValue: string,
    operation: string,
  ): T[] {
    if (!Array.isArray(value)) {
      const actualType = value === null ? 'null' : typeof value;
      throw new Error(
        `Provider ${providerValue} ${operation} returned ${actualType}, expected an array`,
      );
    }
    return value as T[];
  }
  getCatalog = async ({
    providerValue,
    signal,
  }: {
    providerValue: string;
    signal?: AbortSignal;
  }): Promise<Catalog[]> => {
    throwIfProviderAborted(signal);
    const catalogModule = this.getModule(providerValue, 'catalog');
    if (!catalogModule) {
      return [];
    }
    try {
      const moduleExports = await this.executeModule<{
        catalog?: Catalog[] | (() => Promise<Catalog[]> | Catalog[]);
      }>(catalogModule, providerValue, undefined, {}, signal);
      let catalog = moduleExports?.catalog;
      if (typeof catalog === 'function') {
        catalog = await (catalog as any)();
      }
      return this.requireArray<Catalog>(
        catalog ?? [],
        providerValue,
        'catalog',
      );
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      console.error('Error loading catalog:', error);
      throw new Error(
        getErrorMessage(
          error,
          `Invalid catalog module for provider: ${providerValue}`,
        ),
      );
    }
  };
  getGenres = async ({
    providerValue,
  }: {
    providerValue: string;
  }): Promise<Catalog[]> => {
    const catalogModule = this.getModule(providerValue, 'catalog');
    if (!catalogModule) {
      return [];
    }
    try {
      const moduleExports = await this.executeModule<{
        genres?: Catalog[] | (() => Promise<Catalog[]> | Catalog[]);
      }>(catalogModule, providerValue);
      let genres = moduleExports?.genres;
      if (typeof genres === 'function') {
        genres = await (genres as any)();
      }
      return this.requireArray<Catalog>(genres ?? [], providerValue, 'genres');
    } catch (error) {
      console.error('Error loading genres:', error);
      throw new Error(
        getErrorMessage(
          error,
          `Invalid catalog module for provider: ${providerValue}`,
        ),
      );
    }
  };
  getPosts = async ({
    filter,
    page,
    providerValue,
    signal,
  }: {
    filter: string;
    page: number;
    providerValue: string;
    signal: AbortSignal;
  }): Promise<Post[]> => {
    throwIfProviderAborted(signal);
    const getPostsModule = this.getModule(providerValue, 'posts');
    if (!getPostsModule) {
      throw new Error(`No posts module found for provider: ${providerValue}`);
    }
    try {
      const posts = await this.executeModule<Post[]>(
        getPostsModule,
        providerValue,
        'getPosts',
        {filter, page, providerValue},
        signal,
      );
      return this.requireArray<Post>(posts, providerValue, 'getPosts');
    } catch (error) {
      throwIfProviderAborted(signal);
      if (!signal.aborted) {
        console.error('Error in posts function:', error);
      }
      throw new Error(
        getErrorMessage(
          error,
          `Failed to get posts from provider: ${providerValue}`,
        ),
      );
    }
  };
  getSearchPosts = async ({
    searchQuery,
    page,
    providerValue,
    signal,
  }: {
    searchQuery: string;
    page: number;
    providerValue: string;
    signal: AbortSignal;
  }): Promise<Post[]> => {
    throwIfProviderAborted(signal);
    const getPostsModule = this.getModule(providerValue, 'posts');
    if (!getPostsModule) {
      throw new Error(`No posts module found for provider: ${providerValue}`);
    }
    try {
      const posts = await this.executeModule<Post[]>(
        getPostsModule,
        providerValue,
        'getSearchPosts',
        {searchQuery, page, providerValue},
        signal,
      );
      return this.requireArray<Post>(posts, providerValue, 'getSearchPosts');
    } catch (error) {
      throwIfProviderAborted(signal);
      console.error('Error in search posts function:', error);
      throw new Error(
        getErrorMessage(
          error,
          `Failed to search posts from provider: ${providerValue}`,
        ),
      );
    }
  };
  getMetaData = async ({
    link,
    provider,
    signal,
  }: {
    link: string;
    provider: string;
    signal?: AbortSignal;
  }): Promise<Info> => {
    throwIfProviderAborted(signal);
    const getMetaDataModule = this.getModule(provider, 'meta');
    if (!getMetaDataModule) {
      throw new Error(`No meta data module found for provider: ${provider}`);
    }
    try {
      return await this.executeModule<Info>(
        getMetaDataModule,
        provider,
        'getMeta',
        {link, provider},
        signal,
      );
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      if (getErrorMessage(error, '') !== 'Provider sandbox was torn down') {
        console.error('Error in meta data function:', error);
      }
      throw new Error(
        getErrorMessage(
          error,
          `Failed to get metadata from provider: ${provider}`,
        ),
      );
    }
  };
  getStream = async ({
    link,
    type,
    signal,
    providerValue,
    isDownload,
  }: {
    link: string;
    type: string;
    signal?: AbortSignal;
    providerValue: string;
    isDownload?: boolean;
  }): Promise<Array<Stream | PageImage>> => {
    throwIfProviderAborted(signal);
    const getStreamModule =
      this.getModule(providerValue, 'stream') ||
      this.getModule(providerValue, 'pages');
    if (!getStreamModule) {
      throw new Error(`No stream or pages module found for provider: ${providerValue}`);
    }
    try {
      const startedAt = Date.now();
      // Always ask for the canonical export. The sandbox worker resolves
      // the real export itself (getStream falls back to getPages when that
      // is what the provider exports) — never guess from the bundled code:
      // a provider that merely mentions getStream in a comment would be
      // called with the wrong export and fail.
      const exportName = 'getStream';
      const streams = await this.executeModule<Array<Stream | PageImage>>(
        getStreamModule,
        providerValue,
        exportName,
        {link, type, isDownload: Boolean(isDownload)},
        signal,
      );
      console.log(
        `[ProviderPerf] ${exportName} ${providerValue} ${
          Array.isArray(streams) ? streams.length : 0
        } items in ${Date.now() - startedAt}ms`,
      );
      const validatedStreams = this.requireArray<Stream | PageImage>(
        streams,
        providerValue,
        exportName,
      );
      for (const item of validatedStreams) {
        if ('drm' in item && item.drm) getStreamDrm(item.drm);
      }
      return this.withStreamOrPageJarCookies(
        getStreamModule.author,
        isDownload
          ? validatedStreams.filter(item => !('drm' in item && item.drm))
          : validatedStreams,
      );
    } catch (error) {
      console.error('Error in stream/pages function:', error);
      throw new Error(
        getErrorMessage(
          error,
          `Failed to get stream/pages from provider: ${providerValue}`,
        ),
      );
    }
  };

  getPages = async (params: {
    link: string;
    type?: string;
    signal?: AbortSignal;
    providerValue: string;
    isDownload?: boolean;
  }): Promise<PageImage[]> => {
    const results = await this.getStream({
      ...params,
      type: params.type || 'comic',
    });
    return results as PageImage[];
  };

  /**
   * Provider requests no longer share the native cookie store with the player/reader,
   * so streams/pages get their author's cookies (e.g. WAF clearance) as a header,
   * unless the provider set a Cookie header itself.
   */
  private withStreamOrPageJarCookies<T extends Stream | PageImage>(
    author: string,
    items: T[],
  ): T[] {
    return items.map(item => {
      const url =
        'link' in item ? (item as Stream).link : (item as PageImage).imageUrl;
      const headers =
        item.headers && typeof item.headers === 'object'
          ? (item.headers as Record<string, string>)
          : {};
      if (
        !/^https?:/i.test(url ?? '') ||
        Object.keys(headers).some(k => k.toLowerCase() === 'cookie')
      ) {
        return item;
      }
      const cookie = getJarCookieHeader(author, url);
      return cookie
        ? ({...item, headers: {...headers, Cookie: cookie}} as T)
        : item;
    });
  }

  getEpisodes = async ({
    url,
    providerValue,
    signal,
    silent = false,
  }: {
    url: string;
    providerValue: string;
    signal?: AbortSignal;
    silent?: boolean;
  }): Promise<Array<EpisodeLink | ChapterLink>> => {
    throwIfProviderAborted(signal);
    const getEpisodeLinksModule =
      this.getModule(providerValue, 'episodes') ||
      this.getModule(providerValue, 'chapters');
    if (!getEpisodeLinksModule) {
      throw new Error(
        `No episode/chapter links module found for provider: ${providerValue}`,
      );
    }
    try {
      // Always ask for the canonical export. The sandbox worker resolves
      // the real export itself (getEpisodes falls back to getChapters when
      // that is what the provider exports) — never guess from the bundled
      // code: a provider that merely mentions getEpisodes in a comment
      // would be called with the wrong export and fail.
      const exportName = 'getEpisodes';
      const episodes = await this.executeModule<Array<EpisodeLink | ChapterLink>>(
        getEpisodeLinksModule,
        providerValue,
        exportName,
        {url},
        signal,
      );
      return this.requireArray<EpisodeLink | ChapterLink>(
        episodes,
        providerValue,
        exportName,
      );
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      console.error('Error in episodes/chapters function:', error);
      const errorMessage = getErrorMessage(
        error,
        `Failed to get episodes/chapters from provider: ${providerValue}`,
      );
      // Background callers (e.g. the library update checker) pass silent so
      // a failed chapter fetch never pops a toast over the user's screen.
      if (!silent) {
        ToastAndroid.show(errorMessage, ToastAndroid.LONG);
      }
      throw new Error(errorMessage);
    }
  };

  getChapters = async (params: {
    url: string;
    providerValue: string;
    signal?: AbortSignal;
    silent?: boolean;
  }): Promise<ChapterLink[]> => {
    const results = await this.getEpisodes(params);
    return results as ChapterLink[];
  };

  private settingsActionModules = new Map<string, ProviderCode>();

  runSettingsAction = async ({providerValue, sourceAuthor, key}: {
    providerValue: string; sourceAuthor?: string; key: string;
  }): Promise<void> => {
    const schema = await this.getSettingsSchema({providerValue, sourceAuthor});
    if (!schema.some(field => field.type === 'button' && field.key === key)) {
      throw new Error('Unknown provider settings action');
    }
    const module = this.settingsActionModules.get(`${sourceAuthor || ''}:${providerValue}`);
    if (!module) throw new Error('Provider settings module is unavailable');
    await this.executeModule(module, providerValue, 'onSettingsAction', {key});
  };

  getSettingsSchema = async ({
    providerValue,
    sourceAuthor,
  }: {
    providerValue: string;
    sourceAuthor?: string;
  }): Promise<SettingsField[]> => {
    const cacheKey = `${sourceAuthor || ''}:${providerValue}`;
    const cached = this.settingsSchemaCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const installedModule = extensionManager.getProviderModules(
      providerValue,
      sourceAuthor,
    );
    let settingsModule = installedModule?.modules?.settings;
    let settingsAuthor = installedModule?.sourceAuthor ?? sourceAuthor;

    if (!settingsModule) {
      // Fallback: try on-demand fetch of settings.js
      const activeSource =
        extensionStorage
          .getProviderSources()
          .find(s => !sourceAuthor || s.author === sourceAuthor) ||
        extensionStorage.getProviderSource();
      if (activeSource?.url) {
        try {
          const path = extensionStorage
            .getInstalledProviders()
            .find(
              p =>
                p.value === providerValue &&
                p.source?.author === activeSource.author,
            )?.path;
          const url = `${getProviderFilesUrl(activeSource.url, providerValue, path)}/settings.js`;
          const res = await axios.get(url, {
            timeout: 6000,
            headers: getSourceAuthHeaders(activeSource.author, url),
          });
          if (res.data && typeof res.data === 'string') {
            settingsModule = res.data;
            settingsAuthor = activeSource.author;
            const existing = extensionStorage.getProviderModules(
              providerValue,
              sourceAuthor,
            );
            if (existing) {
              extensionStorage.cacheProviderModules({
                ...existing,
                modules: {
                  ...existing.modules,
                  settings: settingsModule,
                },
              });
            }
          }
        } catch {
          // ignore download error
        }
      }
    }

    if (!settingsModule) {
      return [];
    }

    this.settingsActionModules.set(`${sourceAuthor || ''}:${providerValue}`, {code: settingsModule, author: providerAuthor(settingsAuthor)});
    try {
      const raw = await this.executeModule<unknown>(
        {code: settingsModule, author: providerAuthor(settingsAuthor)},
        providerValue,
        'getSettingsSchema',
      );
      const parsed = this.requireArray<SettingsField>(
        raw,
        providerValue,
        'getSettingsSchema',
      );
      if (parsed.length > 0) {
        this.settingsSchemaCache.set(cacheKey, parsed);
      }
      return parsed;
    } catch (error) {
      console.warn(
        `Provider ${providerValue} getSettingsSchema failed:`,
        error,
      );
      return [];
    }
  };

  clearProviderStorage = async (
    providerValue: string,
    sourceAuthor?: string,
  ): Promise<void> => {
    this.providerState.delete(providerScopeId(sourceAuthor, providerValue));
    const allKeys = await providerKvStorage.getKeys();
    const prefix = getProviderKvPrefix(sourceAuthor, providerValue);
    for (const key of allKeys) {
      if (key.startsWith(prefix)) {
        providerKvStorage.delete(key);
      }
    }
  };
}

export const providerManager = new ProviderManager();
