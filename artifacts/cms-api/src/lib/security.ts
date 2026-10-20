// HTTP security headers that are set per response: the Content-Security-Policy
// (which needs a fresh nonce for the scripts the server injects into each page)
// and the Permissions-Policy. The static headers — HSTS, X-Frame-Options,
// X-Content-Type-Options, Referrer-Policy — are set once by helmet in app.ts.

import { randomBytes } from 'node:crypto';
import type { SecuritySettings, SiteSettings } from '@workspace/cms-content';

// Browsers that run Google Analytics / Tag Manager need these origins allowed.
const ANALYTICS_SCRIPT = ['https://www.googletagmanager.com', 'https://www.google-analytics.com'];
const ANALYTICS_CONNECT = ['https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://www.googletagmanager.com', 'https://*.analytics.google.com'];

// Video embeds allowed in rich text (kept in step with lib/sanitize.ts).
const EMBED_FRAME = ['https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'];

export function newNonce() {
  return randomBytes(16).toString('base64');
}

// Add the per-request nonce to any <script> tag in a trusted HTML fragment that
// does not already carry one. Used for fragments the server itself emits (the
// page template, admin-authored snippets and custom code) — never for
// attacker-influenced data, which is escaped before it reaches the HTML.
export function addNonce(fragment: string, nonce: string) {
  return fragment.replace(/<script\b(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
}

type CspContext = {
  nonce: string;
  security: SecuritySettings;
  site: Pick<SiteSettings, 'googleAnalyticsId' | 'googleTagManagerId'>;
  https: boolean;
};

// The strict Content-Security-Policy for a public page. Scripts run only when
// they carry this request's nonce or come from an allowed origin, which is the
// real defence against cross-site scripting; everything else is scoped to the
// site's own origin plus the handful of origins the site genuinely uses.
export function buildPageCsp({ nonce, security, site, https }: CspContext) {
  const usesAnalytics = Boolean(site.googleAnalyticsId || site.googleTagManagerId);

  const scriptSrc = ["'self'", `'nonce-${nonce}'`];
  if (usesAnalytics) scriptSrc.push(...ANALYTICS_SCRIPT);
  scriptSrc.push(...security.cspScriptSrc);

  const connectSrc = ["'self'"];
  if (usesAnalytics) connectSrc.push(...ANALYTICS_CONNECT);
  connectSrc.push(...security.cspConnectSrc);

  // img-src is deliberately broad (https:) because images legitimately come
  // from uploads, S3/CDN origins and Open Graph previews; script-src is what
  // stops code execution.
  const imgSrc = ["'self'", 'data:', 'blob:', 'https:', ...security.cspImgSrc];
  const styleSrc = ["'self'", "'unsafe-inline'", ...security.cspStyleSrc];
  const fontSrc = ["'self'", 'data:', ...security.cspFontSrc];
  const frameSrc = ["'self'", ...EMBED_FRAME, ...security.cspFrameSrc];
  const mediaSrc = ["'self'", 'https:', 'blob:'];

  const directives: Record<string, string[] | null> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'self'"],
    'form-action': ["'self'"],
    'script-src': dedupe(scriptSrc),
    'style-src': dedupe(styleSrc),
    'img-src': dedupe(imgSrc),
    'font-src': dedupe(fontSrc),
    'connect-src': dedupe(connectSrc),
    'media-src': dedupe(mediaSrc),
    'frame-src': dedupe(frameSrc),
    // Only meaningful over https; harmless but pointless on plain http (dev).
    'upgrade-insecure-requests': https ? [] : null,
  };
  return serialize(directives);
}

// The admin dashboard is a single-page app that only talks to its own API and
// shows images from uploads/CDN. It injects no inline scripts, so no nonce or
// 'unsafe-inline' for scripts is needed, and it must never be framed.
export function buildAdminCsp() {
  return serialize({
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'frame-src': ["'none'"],
  });
}

// Disable powerful browser features the site does not use, so injected or
// embedded content cannot quietly reach for the camera, mic or location.
export const PERMISSIONS_POLICY =
  'accelerometer=(), autoplay=(self), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()';

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function serialize(directives: Record<string, string[] | null>) {
  return Object.entries(directives)
    .filter(([, value]) => value !== null)
    .map(([name, value]) => (value && value.length ? `${name} ${value.join(' ')}` : name))
    .join('; ');
}
