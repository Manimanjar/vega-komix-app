import {mainStorage} from './StorageService';

/**
 * AsyncStorage facade backed by ultra-fast native MMKV mainStorage
 */
export const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const val = mainStorage.getString(key);
      return val !== undefined ? val : null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      mainStorage.setString(key, value);
    } catch {}
  },
  async removeItem(key: string): Promise<void> {
    try {
      mainStorage.delete(key);
    } catch {}
  },
  async clear(): Promise<void> {
    try {
      mainStorage.clearAll();
    } catch {}
  },
};

export default AsyncStorage;
