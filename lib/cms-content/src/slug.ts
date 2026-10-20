// URL slugs shared by the API (which enforces them) and the admin (which
// previews them as the author types).

const RESERVED = new Set([
  'admin',
  'api',
  'uploads',
  'assets',
  'media',
  'figma',
  'resources',
  'sitemap.xml',
  'robots.txt',
  'favicon.ico',
]);

export function slugify(input: string, maxLength = 80): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isReservedPageSlug(slug: string) {
  return RESERVED.has(slug);
}

// About 225 words a minute, never less than a minute.
export function readingMinutes(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}
