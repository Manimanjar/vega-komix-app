import {cacheStorageService} from '../storage';
import {autoDomainResolver} from '../network/autoDomainResolver';

// 1 hour
const expireTime = 60 * 60 * 1000;

export const getBaseUrl = async (providerValue: string) => {
  try {
    let baseUrl = '';
    const cacheKey = 'CacheBaseUrl' + providerValue;
    const timeKey = 'baseUrlTime' + providerValue;

    const cachedUrl = cacheStorageService.getString(cacheKey);
    const cachedTime = cacheStorageService.getObject<number>(timeKey);

    if (cachedUrl && cachedTime && Date.now() - cachedTime < expireTime) {
      baseUrl = cachedUrl;
    }
    return baseUrl ? autoDomainResolver.rewriteUrlWithResolvedDomain(baseUrl) : '';
  } catch (error) {
    console.error(`Error fetching baseUrl: ${providerValue}`, error);
    return '';
  }
};
