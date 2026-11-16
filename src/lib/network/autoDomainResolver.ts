import {parse} from 'tldts';
import {mainStorage} from '../storage/StorageService';
import {extensionStorage} from '../storage/extensionStorage';

const RESOLVED_DOMAINS_KEY = 'resolvedDomainsMap';
const REMOTE_REGISTRY_CACHE_KEY = 'remoteDomainsRegistryCache';
const DOH_CLOUDFLARE = 'https://cloudflare-dns.com/dns-query';

export const CANDIDATE_TLDS = [
  'to',
  'net',
  'org',
  'cc',
  'gg',
  'me',
  'la',
  'su',
  'is',
  'bz',
  'io',
  'ws',
  'ru',
  'sh',
  'one',
  'xyz',
  'com',
] as const;

const PARKED_DOMAIN_PATTERNS = [
  /domain\s+(?:is\s+)?for\s+sale/i,
  /buy\s+this\s+domain/i,
  /parked\s+(?:free|domain)/i,
  /hugedomains/i,
  /dan\.com/i,
  /sedo(?:\.com)?/i,
  /godaddy(?:\s+domain)?/i,
  /namecheap(?:\s+parking)?/i,
  /domain\s+broker/i,
  /sponsored\s+listings/i,
  /inquire\s+about\s+this\s+domain/i,
  /this\s+page\s+is\s+parked/i,
  /parkingcrew/i,
  /bodis/i,
];

const VALID_COMIC_DOM_MARKERS = [
  'manga',
  'comic',
  'chapter',
  'reader',
  'webtoon',
  'gallery',
  'manhwa',
  'manhua',
  'doujin',
  'pages',
  'scan',
  'author',
  'artist',
  'cover',
];

export interface DomainResolutionOptions {
  providerValue?: string;
  forceProbe?: boolean;
  signal?: AbortSignal;
}

export class AutoDomainResolver {
  private inMemoryMap: Map<string, string> = new Map();
  private inFlightResolutions: Map<string, Promise<string>> = new Map();
  private initialized = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (this.initialized) return;
    try {
      const stored = mainStorage.getObject<Record<string, string>>(
        RESOLVED_DOMAINS_KEY,
      );
      if (stored && typeof stored === 'object') {
        for (const [oldDomain, newDomain] of Object.entries(stored)) {
          if (oldDomain && newDomain) {
            this.inMemoryMap.set(oldDomain.toLowerCase(), newDomain.toLowerCase());
          }
        }
      }
      this.initialized = true;
    } catch (e) {
      console.warn('[AutoDomainResolver] Failed to load stored domains:', e);
    }
  }

  private persistToStorage(): void {
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of this.inMemoryMap.entries()) {
        obj[k] = v;
      }
      mainStorage.setObject(RESOLVED_DOMAINS_KEY, obj);
    } catch (e) {
      console.warn('[AutoDomainResolver] Failed to persist domains:', e);
    }
  }

  /**
   * Get all currently known domain rewrites
   */
  public getResolvedDomains(): Record<string, string> {
    this.loadFromStorage();
    const result: Record<string, string> = {};
    for (const [k, v] of this.inMemoryMap.entries()) {
      result[k] = v;
    }
    return result;
  }

  /**
   * Clear in-memory mappings and reset initialization (useful for tests and manual cache invalidation)
   */
  public clearCache(): void {
    this.inMemoryMap.clear();
    this.initialized = false;
  }

  /**
   * Check if a given hostname has an active rewrite mapping
   */
  public hasRewrite(hostname: string): boolean {
    this.loadFromStorage();
    const lower = hostname.toLowerCase().trim();
    if (this.inMemoryMap.has(lower)) return true;

    const parsed = parse(lower);
    if (parsed.domain && this.inMemoryMap.has(parsed.domain.toLowerCase())) {
      return true;
    }
    return false;
  }

  /**
   * Rewrite any URL or hostname using resolved domains.
   * Handles subdomains dynamically (e.g. cdn.manga.com -> cdn.manga.to).
   */
  public rewriteUrlWithResolvedDomain(originalUrl: string): string {
    if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
    this.loadFromStorage();

    const trimmed = originalUrl.trim();
    if (!trimmed.includes('://')) {
      // It's a plain hostname
      const lower = trimmed.toLowerCase();
      if (this.inMemoryMap.has(lower)) {
        return this.inMemoryMap.get(lower)!;
      }
      const parsed = parse(lower);
      if (parsed.domain && this.inMemoryMap.has(parsed.domain)) {
        const targetDomain = this.inMemoryMap.get(parsed.domain)!;
        return parsed.subdomain ? `${parsed.subdomain}.${targetDomain}` : targetDomain;
      }
      return originalUrl;
    }

    try {
      const url = new URL(trimmed);
      const host = url.hostname.toLowerCase();

      // Direct exact hostname match
      if (this.inMemoryMap.has(host)) {
        const newHost = this.inMemoryMap.get(host)!;
        return trimmed.replace(`://${url.host}`, `://${newHost}`);
      }

      // Base domain match (preserve subdomain)
      const parsed = parse(host);
      if (parsed.domain && this.inMemoryMap.has(parsed.domain)) {
        const targetBaseDomain = this.inMemoryMap.get(parsed.domain)!;
        const newHost = parsed.subdomain
          ? `${parsed.subdomain}.${targetBaseDomain}`
          : targetBaseDomain;
        return trimmed.replace(`://${url.host}`, `://${newHost}`);
      }
    } catch {
      // Return original URL on parsing failure
    }

    return originalUrl;
  }

  /**
   * Stage A: Record a domain redirect observed from HTTP 301/302/307/308 or meta refresh
   */
  public recordRedirectDomain(oldHostname: string, newHostname: string): void {
    if (!oldHostname || !newHostname) return;
    const oldHost = oldHostname.toLowerCase().trim();
    const newHost = newHostname.toLowerCase().trim();
    if (oldHost === newHost) return;

    const oldParsed = parse(oldHost);
    const newParsed = parse(newHost);

    // Ensure we are redirecting between relevant domain updates
    if (oldParsed.domain && newParsed.domain) {
      this.inMemoryMap.set(oldHost, newHost);
      if (oldParsed.domain !== newParsed.domain) {
        this.inMemoryMap.set(oldParsed.domain, newParsed.domain);
      }
      this.persistToStorage();
      console.log(
        `[AutoDomainResolver] Stage A: Recorded redirect ${oldHost} -> ${newHost}`,
      );
    }
  }

  /**
   * Detect <meta http-equiv="refresh"> redirect targets
   */
  public checkMetaRefreshRedirect(html: string, currentUrl: string): string | null {
    if (!html || typeof html !== 'string') return null;
    const match = html.match(
      /<meta\s+[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?[^"'>]*url=([^"'>\s]+)/i,
    );
    if (!match || !match[1]) return null;

    try {
      const target = match[1].trim();
      const resolved = new URL(target, currentUrl);
      const currentHost = new URL(currentUrl).hostname.toLowerCase();
      const nextHost = resolved.hostname.toLowerCase();
      if (currentHost !== nextHost) {
        this.recordRedirectDomain(currentHost, nextHost);
        return resolved.toString();
      }
    } catch {}
    return null;
  }

  /**
   * Check if an HTML document is a parked domain or dead cloudflare error page
   */
  public isParkedOrFailedHtml(html: string, statusCode?: number): boolean {
    if (!html || typeof html !== 'string') return true;
    if (statusCode && statusCode >= 500 && statusCode <= 526) return true;

    for (const pattern of PARKED_DOMAIN_PATTERNS) {
      if (pattern.test(html)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Refresh working domains immediately from remote domains.json registry
   */
  public async refreshWorkingDomains(sourceAuthor?: string): Promise<number> {
    const registry = await this.fetchRemoteDomainsRegistry(sourceAuthor);
    return Object.keys(registry || {}).length;
  }

  /**
   * Stage B: Fetch Remote domains.json registry from provider source or mirrors
   */
  public async fetchRemoteDomainsRegistry(
    sourceAuthor?: string,
  ): Promise<Record<string, string>> {
    try {
      const author = sourceAuthor || extensionStorage.getProviderSource()?.author || 'vega-org';
      const url = `https://raw.githubusercontent.com/${author}/vega-komix-providers/refs/heads/main/domains.json`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, {signal: controller.signal});
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        if (json?.domains && typeof json.domains === 'object') {
          for (const [oldD, newD] of Object.entries(json.domains)) {
            if (oldD && newD && typeof newD === 'string') {
              this.inMemoryMap.set(oldD.toLowerCase(), newD.toLowerCase());
            }
          }
          this.persistToStorage();
          mainStorage.setObject(REMOTE_REGISTRY_CACHE_KEY, json.domains);
          console.log('[AutoDomainResolver] Stage B: Updated domains from remote registry');
          return json.domains;
        }
      }
    } catch (e) {
      // Fallback to cached registry if remote network fails
      const cached = mainStorage.getObject<Record<string, string>>(
        REMOTE_REGISTRY_CACHE_KEY,
      );
      if (cached) return cached;
    }
    return {};
  }

  /**
   * Stage C: Probe domain via Cloudflare DNS-over-HTTPS
   */
  private async probeDoh(domain: string, signal?: AbortSignal): Promise<boolean> {
    try {
      const queryUrl = `${DOH_CLOUDFLARE}?name=${encodeURIComponent(domain)}&type=A`;
      const res = await fetch(queryUrl, {
        headers: {Accept: 'application/dns-json'},
        signal,
      });
      if (!res.ok) return false;
      const data = await res.json();
      return (
        data.Status === 0 &&
        Array.isArray(data.Answer) &&
        data.Answer.length > 0
      );
    } catch {
      return false;
    }
  }

  /**
   * Stage D: Verify DOM Fingerprint of candidate domain
   */
  private async verifyDomFingerprint(
    candidateHost: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      const targetUrl = `https://${candidateHost}`;
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal,
      });

      // 403 or 503 can happen on Cloudflare WAF, but 520, 521, 522, 523, 502 means dead server
      if (res.status >= 520 && res.status <= 526) return false;
      if (res.status === 502 || res.status === 504) return false;

      const html = await res.text();
      if (!html || this.isParkedOrFailedHtml(html, res.status)) {
        return false;
      }

      const lower = html.toLowerCase();
      const hasStructure =
        lower.includes('<html') || lower.includes('<body') || lower.includes('<!doctype');
      const hasComicMarker = VALID_COMIC_DOM_MARKERS.some(marker =>
        lower.includes(marker),
      );

      return hasStructure && (hasComicMarker || res.status === 200 || res.status === 403);
    } catch {
      return false;
    }
  }

  /**
   * Full 4-Stage Domain Resolution Pipeline
   */
  public async resolveDomain(
    urlOrHostname: string,
    options: DomainResolutionOptions = {},
  ): Promise<string> {
    this.loadFromStorage();
    let hostname = urlOrHostname.trim();
    if (hostname.includes('://')) {
      try {
        hostname = new URL(hostname).hostname;
      } catch {}
    }
    hostname = hostname.toLowerCase();

    // Check if already rewritten and alive
    if (!options.forceProbe && this.inMemoryMap.has(hostname)) {
      return this.inMemoryMap.get(hostname)!;
    }

    // Deduplicate in-flight requests for the same domain
    if (this.inFlightResolutions.has(hostname)) {
      return this.inFlightResolutions.get(hostname)!;
    }

    const resolutionPromise = (async () => {
      console.log(`[AutoDomainResolver] Initiating 4-stage resolution for: ${hostname}`);

      // Stage B: Remote Registry Check
      try {
        const remoteDomains = await this.fetchRemoteDomainsRegistry();
        if (remoteDomains[hostname]) {
          const newDomain = remoteDomains[hostname];
          this.inMemoryMap.set(hostname, newDomain);
          this.persistToStorage();
          console.log(`[AutoDomainResolver] Stage B matched: ${hostname} -> ${newDomain}`);
          return newDomain;
        }
      } catch (err) {
        console.warn('[AutoDomainResolver] Stage B registry lookup failed:', err);
      }

      // Stage C: DoH + Concurrent TLD Probing
      const parsed = parse(hostname);
      const sld = parsed.domainWithoutSuffix;
      const subdomain = parsed.subdomain;

      if (!sld) {
        return hostname;
      }

      const candidates: string[] = CANDIDATE_TLDS.filter(
        tld => tld !== parsed.publicSuffix,
      ).map(tld => {
        const base = `${sld}.${tld}`;
        return subdomain ? `${subdomain}.${base}` : base;
      });

      console.log(
        `[AutoDomainResolver] Stage C: Probing ${candidates.length} candidate TLDs for SLD '${sld}' over DoH...`,
      );

      // Probe in concurrent batches of 6 with 3-second timeouts
      const batchSize = 6;
      let workingDomain: string | null = null;

      for (let i = 0; i < candidates.length; i += batchSize) {
        if (options.signal?.aborted) break;
        const batch = candidates.slice(i, i + batchSize);

        const probePromises = batch.map(async candidate => {
          const dnsOk = await this.probeDoh(candidate, options.signal);
          if (!dnsOk) return null;

          // Stage D: DOM Fingerprint verification on DNS-alive candidate
          const domOk = await this.verifyDomFingerprint(candidate, options.signal);
          return domOk ? candidate : null;
        });

        const results = await Promise.all(probePromises);
        const match = results.find(
          (c): c is string => typeof c === 'string' && Boolean(c),
        );
        if (match) {
          workingDomain = match;
          break;
        }
      }

      if (workingDomain) {
        console.log(
          `[AutoDomainResolver] Stage C+D Success: ${hostname} resolved to ${workingDomain}`,
        );
        this.inMemoryMap.set(hostname, workingDomain);
        if (parsed.domain) {
          const matchParsed = parse(workingDomain);
          if (matchParsed.domain) {
            this.inMemoryMap.set(parsed.domain, matchParsed.domain);
          }
        }
        this.persistToStorage();
        return workingDomain;
      }

      console.log(`[AutoDomainResolver] Resolution complete; keeping original: ${hostname}`);
      return hostname;
    })();

    this.inFlightResolutions.set(hostname, resolutionPromise);
    try {
      return await resolutionPromise;
    } finally {
      this.inFlightResolutions.delete(hostname);
    }
  }
}

export const autoDomainResolver = new AutoDomainResolver();
