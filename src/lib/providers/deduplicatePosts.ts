import type {Post} from './types';
import {settingsStorage} from '../storage/SettingsStorage';

/** Keep the first copy of each comic within one provider's catalog, with optional duplicate title filtering. */
export function deduplicatePosts(posts: Post[]): Post[] {
  const hideDuplicates = settingsStorage.isHideDuplicatePosts();
  const seen = new Set<string>();
  const seenTitles = new Set<string>();

  return posts.filter(post => {
    if (!post.link) return true;
    const key = JSON.stringify([post.provider || '', post.link]);
    if (seen.has(key)) return false;
    seen.add(key);

    if (hideDuplicates && post.title) {
      // Normalize title (lowercase, remove brackets, parentheses, non-alphanumeric)
      const cleanTitle = post.title
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\([^\)]*\)/g, '')
        .replace(/[^a-z0-9]/g, '');
      if (cleanTitle.length > 3) {
        if (seenTitles.has(cleanTitle)) return false;
        seenTitles.add(cleanTitle);
      }
    }

    return true;
  });
}
