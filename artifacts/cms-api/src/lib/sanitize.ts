// Rich text is the one place editors put markup on the public site, so it is
// sanitised on the server on every save, whatever the editor sent. Only
// formatting, links, images and video embeds from known providers survive.

import sanitizeHtml from 'sanitize-html';

const EMBED_HOSTS = ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'];

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2', 'h3', 'h4', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
    'img', 'figure', 'figcaption', 'div', 'iframe',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    iframe: ['src', 'title', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy'],
    div: ['class'],
  },
  allowedClasses: { div: ['cms-embed'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'], iframe: ['https'] },
  allowProtocolRelative: false,
  allowedIframeHostnames: EMBED_HOSTS,
  transformTags: {
    a: (tagName, attribs) => {
      const next: Record<string, string> = { href: attribs.href ?? '' };
      if (attribs.target === '_blank') {
        next.target = '_blank';
        next.rel = 'noopener noreferrer';
      }
      return { tagName, attribs: next };
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
    iframe: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin', allowfullscreen: '' },
    }),
  },
  // A wrapper div is only meaningful around an embed; drop empty ones.
  exclusiveFilter: (frame) => frame.tag === 'div' && !frame.text.trim() && !frame.mediaChildren.length,
};

export function sanitizeRichText(html: string) {
  return sanitizeHtml(html, options).trim();
}

export function plainText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Admin-supplied header/footer code. Super Admins only, but still checked:
// only tags that belong in a document head or before </body> are allowed,
// and inline event handlers and javascript: URLs are rejected outright.
const SCRIPT_TAGS = new Set(['script', 'noscript', 'link', 'meta', 'style', 'iframe', 'img']);

export function validateCustomCode(code: string): string | null {
  if (!code.trim()) return null;
  const tags = [...code.matchAll(/<\s*\/?\s*([a-zA-Z][\w-]*)/g)].map((match) => match[1].toLowerCase());
  const disallowed = [...new Set(tags.filter((tag) => !SCRIPT_TAGS.has(tag)))];
  if (disallowed.length) return `Only <script>, <noscript>, <link>, <meta>, <style>, <iframe> and <img> tags are allowed here (found <${disallowed.join('>, <')}>).`;
  if (/\son[a-z]+\s*=/i.test(code)) return 'Inline event handlers such as onclick= are not allowed.';
  if (/javascript\s*:/i.test(code)) return 'javascript: URLs are not allowed.';
  for (const tag of code.match(/<\s*script\b[^>]*>/gi) ?? []) {
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const url = src ? (src[1] ?? src[2] ?? src[3] ?? '').trim() : null;
    if (url !== null && !/^https:\/\//i.test(url)) return 'External scripts must load over https://.';
  }
  return null;
}
