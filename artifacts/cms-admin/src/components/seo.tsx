import { robotsDirectives, schemaTypes, type RobotsDirective, type Seo } from '@workspace/cms-content';
import { Check, Minus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeSeo, scoreTone, type CheckStatus } from '@/lib/seo-analysis';
import { cn } from '@/lib/format';
import { ImageField } from './media';
import { Checkbox, SelectField, Switch, Tabs, TextAreaField, TextField } from './ui';

// How the result could look in Google: titles beyond ~60 characters and
// descriptions beyond ~160 are usually cut off.
function GooglePreview({ title, description, url }: { title: string; description: string; url: string }) {
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
  const display = url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/').join(' › ');
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-zinc-200">
      <p className="truncate text-[12.5px] text-zinc-600">{display}</p>
      <p className="mt-0.5 text-[18px] leading-snug text-[#1a0dab]">{clip(title, 60)}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">{clip(description, 160) || 'Add a meta description to control this text.'}</p>
    </div>
  );
}

function SocialPreview({ title, description, image, url }: { title: string; description: string; image: string; url: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200">
      <div className="aspect-[1200/630] bg-zinc-100">
        {image ? <img src={image} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-xs text-zinc-400">No sharing image</div>}
      </div>
      <div className="border-t border-zinc-100 bg-zinc-50 px-3 py-2.5">
        <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{url.replace(/^https?:\/\//, '').split('/')[0]}</p>
        <p className="mt-0.5 line-clamp-1 text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600">{description}</p>
      </div>
    </div>
  );
}

const statusIcon: Record<CheckStatus, typeof Check> = { good: Check, warn: Minus, bad: X };
const statusColor: Record<CheckStatus, string> = { good: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-red-500' };

const robotsLabels: Record<RobotsDirective, string> = {
  nofollow: 'Nofollow — don’t follow links on this page',
  noarchive: 'No archive — no cached copy in search',
  noimageindex: 'No image index — don’t index images here',
  nosnippet: 'No snippet — no text snippet in search',
};
const schemaLabels: Record<string, string> = {
  auto: 'Automatic (recommended)',
  none: 'None',
  Article: 'Article',
  BlogPosting: 'Blog post',
  NewsArticle: 'News article',
  FAQPage: 'FAQ',
  HowTo: 'How-to',
  Product: 'Product',
  Service: 'Service',
  WebPage: 'Web page',
  AboutPage: 'About page',
  ContactPage: 'Contact page',
};

export function SeoPanel({
  value,
  onChange,
  fallbackTitle,
  fallbackDescription,
  fallbackImage,
  url,
  analysis,
  errors = {},
}: {
  value: Seo;
  onChange: (next: Seo) => void;
  fallbackTitle: string;
  fallbackDescription: string;
  fallbackImage: string;
  url: string;
  // When provided, the content-analysis score and checklist are shown.
  analysis?: { slug: string; contentText?: string; contentHtml?: string; hasFeaturedImage?: boolean; isArticle?: boolean };
  errors?: Record<string, string>;
}) {
  const [preview, setPreview] = useState<'google' | 'social'>('google');
  const set = <K extends keyof Seo>(key: K, next: Seo[K]) => onChange({ ...value, [key]: next });
  const title = value.seoTitle || fallbackTitle;
  const description = value.metaDescription || fallbackDescription;
  const absoluteImage = (value.ogImage || fallbackImage) && !(value.ogImage || fallbackImage).startsWith('http') ? `${new URL(url).origin}${value.ogImage || fallbackImage}` : value.ogImage || fallbackImage;

  const result = useMemo(
    () =>
      analysis
        ? analyzeSeo({ focusKeyword: value.focusKeyword, seoTitle: title, metaDescription: description, slug: analysis.slug, contentText: analysis.contentText, contentHtml: analysis.contentHtml, hasFeaturedImage: analysis.hasFeaturedImage, isArticle: analysis.isArticle })
        : null,
    [analysis, value.focusKeyword, title, description],
  );
  // Keep the stored score in step as the editor is changed (but not on open,
  // so simply viewing a page never marks it as edited).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (result && result.score !== value.score) set('score', result.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.score]);

  const toggleRobot = (d: RobotsDirective, on: boolean) => set('robots', on ? [...value.robots, d] : value.robots.filter((r) => r !== d));

  return (
    <div className="space-y-5">
      {result && (
        <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-zinc-800">SEO score</span>
            <span className={cn('text-sm font-semibold', scoreTone(result.score).className)}>{result.score}/100 · {scoreTone(result.score).label}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
            <div className={cn('h-full rounded-full', result.score >= 80 ? 'bg-emerald-500' : result.score >= 50 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${result.score}%` }} />
          </div>
          <ul className="mt-3 space-y-1.5">
            {result.checks.map((c) => {
              const Icon = statusIcon[c.status];
              return (
                <li key={c.id} className="flex items-start gap-2 text-xs text-zinc-700">
                  <Icon className={cn('mt-0.5 size-3.5 shrink-0', statusColor[c.status])} aria-hidden="true" />
                  <span>{c.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <Tabs value={preview} onChange={setPreview} tabs={[{ value: 'google', label: 'Google' }, { value: 'social', label: 'Social card' }]} className="mb-3" />
        {preview === 'google' ? (
          <GooglePreview title={title} description={description} url={value.canonicalUrl || url} />
        ) : (
          <SocialPreview title={value.ogTitle || title} description={value.ogDescription || description} image={absoluteImage} url={url} />
        )}
      </div>

      {analysis && (
        <TextField label="Focus keyword" value={value.focusKeyword} onChange={(next) => set('focusKeyword', next)} placeholder="e.g. AI shopping assistant" hint="The term you want this page to rank for. Drives the analysis above." error={errors['seo.focusKeyword']} />
      )}
      <TextField label="SEO title" value={value.seoTitle} onChange={(next) => set('seoTitle', next)} placeholder={fallbackTitle} counter={60} hint="Leave empty to use the title template." error={errors['seo.seoTitle']} />
      <TextAreaField label="Meta description" value={value.metaDescription} onChange={(next) => set('metaDescription', next)} placeholder={fallbackDescription} counter={160} rows={3} error={errors['seo.metaDescription']} />
      <TextField label="Canonical URL" value={value.canonicalUrl} onChange={(next) => set('canonicalUrl', next)} placeholder={url} hint="Only set this if the same content lives at another address." error={errors['seo.canonicalUrl']} />

      <details className="group rounded-lg ring-1 ring-zinc-200">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-medium text-zinc-800 select-none">
          <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>Social sharing
        </summary>
        <div className="space-y-4 border-t border-zinc-100 p-3">
          <TextField label="Social title" value={value.ogTitle} onChange={(next) => set('ogTitle', next)} placeholder={title} error={errors['seo.ogTitle']} />
          <TextAreaField label="Social description" value={value.ogDescription} onChange={(next) => set('ogDescription', next)} placeholder={description} rows={2} error={errors['seo.ogDescription']} />
          <ImageField label="Social image" hint="1200 × 630 works best. Falls back to the featured image, then the site default." value={value.ogImage} onChange={(next) => set('ogImage', next)} error={errors['seo.ogImage']} />
        </div>
      </details>

      <details className="group rounded-lg ring-1 ring-zinc-200">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-medium text-zinc-800 select-none">
          <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>Advanced
        </summary>
        <div className="space-y-4 border-t border-zinc-100 p-3">
          <Switch checked={value.noIndex} onChange={(next) => set('noIndex', next)} label="Hide from search engines" description="Adds noindex and leaves this out of the sitemap." />
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-zinc-800">Robots directives</legend>
            {robotsDirectives.map((d) => (
              <Checkbox key={d} label={robotsLabels[d]} checked={value.robots.includes(d)} onChange={(on) => toggleRobot(d, on)} />
            ))}
          </fieldset>
          <SelectField label="Schema type" value={value.schemaType} onChange={(next) => set('schemaType', next as Seo['schemaType'])} options={schemaTypes.map((t) => ({ value: t, label: schemaLabels[t] ?? t }))} hint="Automatic picks the right type (article, event…). Choose None to output none." />
          <TextAreaField
            label="Custom schema (JSON-LD)"
            value={value.schemaJson}
            onChange={(next) => set('schemaJson', next)}
            rows={6}
            className={cn('[&_textarea]:font-mono [&_textarea]:text-xs')}
            placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "WebPage"\n}'}
            hint="Optional. Replaces the automatic structured data when set."
            error={errors['seo.schemaJson']}
          />
        </div>
      </details>
    </div>
  );
}
