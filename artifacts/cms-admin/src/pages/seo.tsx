import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { maxImagePreviews, orgTypes, robotsDirectives, twitterCards, type RobotsDirective, type SeoSettings, type SiteSettings } from '@workspace/cms-content';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearch } from 'wouter';
import { toast } from 'sonner';
import { useConfirm } from '@/components/dialog';
import { Modal } from '@/components/dialog';
import { StringListEditor } from '@/components/list-editor';
import { ImageField } from '@/components/media';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Notice, PageHeader, PageLoader, Pagination, SelectField, Switch, Tabs, TextAreaField, TextField } from '@/components/ui';
import { del, errorMessage, fieldErrors, get, post, put } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Paged } from '@/lib/types';

type SettingsResponse = { site: SiteSettings; seo: SeoSettings };

const tabs = [
  { value: 'titles', label: 'Titles & Meta' },
  { value: 'local', label: 'Local SEO' },
  { value: 'social', label: 'Social & Verification' },
  { value: 'sitemap', label: 'Sitemap & Robots' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'monitor', label: '404 Monitor' },
] as const;
type Tab = (typeof tabs)[number]['value'];

const robotsLabels: Record<RobotsDirective, string> = {
  nofollow: 'Nofollow',
  noarchive: 'No archive',
  noimageindex: 'No image index',
  nosnippet: 'No snippet',
};

export function SeoPage() {
  const queryClient = useQueryClient();
  const initialTab = (new URLSearchParams(useSearch()).get('tab') as Tab | null) ?? 'titles';
  const [tab, setTab] = useState<Tab>(tabs.some((t) => t.value === initialTab) ? initialTab : 'titles');
  const query = useQuery({ queryKey: ['settings'], queryFn: ({ signal }) => get<SettingsResponse>('/api/admin/settings', signal) });
  const [seo, setSeo] = useState<SeoSettings | null>(null);
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (query.data) {
      setSeo(query.data.seo);
      setSite(query.data.site);
    }
  }, [query.data]);

  const dirtySeo = Boolean(query.data && seo && JSON.stringify(seo) !== JSON.stringify(query.data.seo));
  const dirtySite = Boolean(query.data && site && JSON.stringify(site) !== JSON.stringify(query.data.site));
  const dirty = dirtySeo || dirtySite;

  const save = useMutation({
    mutationFn: async () => {
      if (dirtySeo) await put('/api/admin/settings/seo', seo);
      if (dirtySite) await put('/api/admin/settings/site', site);
    },
    onSuccess: () => {
      toast.success('SEO settings saved. They are live on the site.');
      setErrors({});
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      toast.error(errorMessage(error));
    },
  });

  if (query.isLoading || !seo || !site) return query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : <PageLoader />;
  const s = <K extends keyof SeoSettings>(key: K) => (value: SeoSettings[K]) => setSeo({ ...seo, [key]: value });
  const st = <K extends keyof SiteSettings>(key: K) => (value: SiteSettings[K]) => setSite({ ...site, [key]: value });
  const toggleRobot = (d: RobotsDirective, on: boolean) => s('defaultRobots')(on ? [...seo.defaultRobots, d] : seo.defaultRobots.filter((r) => r !== d));

  return (
    <>
      <PageHeader
        title="SEO"
        description="How the site appears in search and when shared."
        actions={
          tab !== 'monitor' && (
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
              <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>Save SEO settings</Button>
            </div>
          )
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={tabs.map((t) => ({ ...t }))} className="mb-5" />
      <Card className="max-w-3xl space-y-6 p-6">
        {tab === 'titles' && (
          <>
            <TextField label="Site default SEO title" value={site.defaultSeoTitle} onChange={st('defaultSeoTitle')} hint="Used for the homepage and anywhere without its own title." error={errors.defaultSeoTitle} />
            <TextAreaField label="Site default meta description" value={site.defaultMetaDescription} onChange={st('defaultMetaDescription')} rows={2} error={errors.defaultMetaDescription} />
            <TextField label="Title separator" value={seo.titleSeparator} onChange={s('titleSeparator')} className="max-w-[140px]" hint="The %sep% character between title parts." error={errors.titleSeparator} />
            <TextField label="Resource title template" value={seo.postTitleTemplate} onChange={s('postTitleTemplate')} hint="Variables: %title% %sitename% %sep% %excerpt% %currentyear%." error={errors.postTitleTemplate} />
            <TextField label="Resource description template" value={seo.postDescriptionTemplate} onChange={s('postDescriptionTemplate')} error={errors.postDescriptionTemplate} />
            <TextField label="Page title template" value={seo.pageTitleTemplate} onChange={s('pageTitleTemplate')} error={errors.pageTitleTemplate} />
            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium text-zinc-800">Default robots directives</legend>
              <p className="text-xs text-zinc-500">Applied site-wide, on top of index/follow. Individual pages can add more.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {robotsDirectives.map((d) => <Checkbox key={d} label={robotsLabels[d]} checked={seo.defaultRobots.includes(d)} onChange={(on) => toggleRobot(d, on)} />)}
              </div>
            </fieldset>
            <div className="grid gap-5 sm:grid-cols-3">
              <TextField label="Max snippet" type="number" value={String(seo.maxSnippet)} onChange={(v) => s('maxSnippet')(Number(v))} hint="-1 = no limit" />
              <SelectField label="Max image preview" value={seo.maxImagePreview} onChange={(v) => s('maxImagePreview')(v as SeoSettings['maxImagePreview'])} options={maxImagePreviews.map((m) => ({ value: m, label: m }))} />
              <TextField label="Max video preview" type="number" value={String(seo.maxVideoPreview)} onChange={(v) => s('maxVideoPreview')(Number(v))} hint="-1 = no limit" />
            </div>
          </>
        )}

        {tab === 'local' && (
          <>
            <SelectField label="Entity type" value={seo.orgType} onChange={(v) => s('orgType')(v as SeoSettings['orgType'])} options={orgTypes.map((o) => ({ value: o, label: o }))} hint="How search engines see the site owner. LocalBusiness enables address + map data." />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Name" value={seo.orgName} onChange={s('orgName')} placeholder={site.siteName} error={errors.orgName} />
              <TextField label="Phone" value={seo.orgPhone} onChange={s('orgPhone')} error={errors.orgPhone} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Email" type="email" value={seo.orgEmail} onChange={s('orgEmail')} error={errors.orgEmail} />
              <ImageField label="Logo" value={seo.orgLogo} onChange={s('orgLogo')} hint="Square, at least 112px. Used in Google's knowledge panel." />
            </div>
            <TextField label="Street address" value={seo.orgStreet} onChange={s('orgStreet')} error={errors.orgStreet} />
            <div className="grid gap-5 sm:grid-cols-3">
              <TextField label="City" value={seo.orgCity} onChange={s('orgCity')} />
              <TextField label="Region / State" value={seo.orgRegion} onChange={s('orgRegion')} />
              <TextField label="Postal code" value={seo.orgPostalCode} onChange={s('orgPostalCode')} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Country" value={seo.orgCountry} onChange={s('orgCountry')} />
              {seo.orgType === 'LocalBusiness' && <TextField label="Price range" value={seo.orgPriceRange} onChange={s('orgPriceRange')} placeholder="$$" />}
            </div>
            {seo.orgType === 'LocalBusiness' && (
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Latitude" value={seo.orgLat} onChange={s('orgLat')} placeholder="43.6532" />
                <TextField label="Longitude" value={seo.orgLng} onChange={s('orgLng')} placeholder="-79.3832" />
              </div>
            )}
            <Notice tone="info">Social profile links come from Settings → Contact &amp; social and are added automatically.</Notice>
          </>
        )}

        {tab === 'social' && (
          <>
            <ImageField label="Default sharing image" value={site.defaultOgImage} onChange={st('defaultOgImage')} hint="1200 × 630. Used when a page has no image of its own." />
            <SelectField label="Twitter / X card type" value={seo.twitterCard} onChange={(v) => s('twitterCard')(v as SeoSettings['twitterCard'])} options={twitterCards.map((t) => ({ value: t, label: t === 'summary_large_image' ? 'Large image' : 'Summary' }))} />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Twitter / X username" value={seo.twitterSite} onChange={s('twitterSite')} placeholder="@yourbrand" error={errors.twitterSite} />
              <TextField label="Facebook App ID" value={seo.facebookAppId} onChange={s('facebookAppId')} error={errors.facebookAppId} />
            </div>
            <div className="border-t border-zinc-100 pt-5">
              <p className="mb-1 text-sm font-medium">Site verification</p>
              <p className="mb-4 text-xs text-zinc-500">Paste just the code from each service (the verification meta tag is added to the homepage).</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Google Search Console" value={seo.googleVerify} onChange={s('googleVerify')} error={errors.googleVerify} />
                <TextField label="Bing Webmaster" value={seo.bingVerify} onChange={s('bingVerify')} error={errors.bingVerify} />
                <TextField label="Yandex" value={seo.yandexVerify} onChange={s('yandexVerify')} error={errors.yandexVerify} />
                <TextField label="Pinterest" value={seo.pinterestVerify} onChange={s('pinterestVerify')} error={errors.pinterestVerify} />
                <TextField label="Baidu" value={seo.baiduVerify} onChange={s('baiduVerify')} error={errors.baiduVerify} />
              </div>
            </div>
          </>
        )}

        {tab === 'sitemap' && (
          <>
            <div className="flex flex-wrap gap-2">
              {['/sitemap.xml', '/robots.txt'].map((p) => (
                <a key={p} href={p} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
                  {p} <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              ))}
            </div>
            <Switch checked={seo.sitemapImages} onChange={s('sitemapImages')} label="Include images in the sitemap" description="Lists each page's featured image so they can be indexed." />
            <Switch checked={seo.autoImageAlt} onChange={s('autoImageAlt')} label="Image SEO: auto alt text" description="New image uploads get alt text from the file name when none is set." />
            <Switch checked={seo.breadcrumbsEnabled} onChange={s('breadcrumbsEnabled')} label="Breadcrumbs structured data" description="Adds BreadcrumbList schema so search can show the page's place in the site." />
            {seo.breadcrumbsEnabled && (
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Home crumb label" value={seo.breadcrumbHomeLabel} onChange={s('breadcrumbHomeLabel')} />
                <TextField label="Separator" value={seo.breadcrumbSeparator} onChange={s('breadcrumbSeparator')} className="max-w-[140px]" />
              </div>
            )}
            <StringListEditor label="Hide paths from search (robots.txt Disallow)" values={site.robotsDisallow} onChange={st('robotsDisallow')} placeholder="/private-page" addLabel="Add path" hint="/admin and /api are always excluded." />
            <TextAreaField label="Custom robots.txt rules" value={seo.robotsTxtCustom} onChange={s('robotsTxtCustom')} rows={5} className="[&_textarea]:font-mono [&_textarea]:text-xs" hint="Appended to the generated robots.txt. One rule per line." error={errors.robotsTxtCustom} />
            <Switch checked={seo.monitor404} onChange={s('monitor404')} label="404 monitor" description="Record the missing URLs visitors hit (see the 404 Monitor tab)." />
          </>
        )}

        {tab === 'analytics' && (
          <>
            <TextField label="Google Analytics 4 ID" value={site.googleAnalyticsId} onChange={st('googleAnalyticsId')} placeholder="G-XXXXXXXXXX" hint="Measures visits. Found in your GA4 property's data stream." error={errors.googleAnalyticsId} />
            <TextField label="Google Tag Manager ID" value={site.googleTagManagerId} onChange={st('googleTagManagerId')} placeholder="GTM-XXXXXXX" error={errors.googleTagManagerId} />
            <Notice tone="info">These load the official Google scripts on every page, respecting the IDs you enter here.</Notice>
          </>
        )}

        {tab === 'monitor' && <Monitor404 />}
      </Card>
    </>
  );
}

function Monitor404() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [redirectFor, setRedirectFor] = useState<{ id: string; path: string } | null>(null);
  const [target, setTarget] = useState('');
  const list = useQuery({ queryKey: ['monitor-404', page], queryFn: ({ signal }) => get<Paged<{ id: string; path: string; hits: number; lastHitAt: string; resolved: boolean }>>(`/api/admin/monitor-404?page=${page}`, signal), placeholderData: (p) => p });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['monitor-404'] });
  const remove = useMutation({ mutationFn: (id: string) => del(`/api/admin/monitor-404/${id}`), onSuccess: refresh });
  const clear = useMutation({ mutationFn: () => post('/api/admin/monitor-404/clear', { only: 'all' }), onSuccess: () => { toast.success('Cleared.'); refresh(); } });
  const makeRedirect = useMutation({
    mutationFn: ({ id, toPath }: { id: string; toPath: string }) => post(`/api/admin/monitor-404/${id}/redirect`, { toPath }),
    onSuccess: () => { toast.success('Redirect created.'); setRedirectFor(null); setTarget(''); refresh(); queryClient.invalidateQueries({ queryKey: ['redirects'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (list.isLoading) return <PageLoader />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">Missing URLs that visitors have hit. Turn one into a redirect to fix a broken link.</p>
        {items.length > 0 && (
          <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => { if (await confirm({ title: 'Clear all logged 404s?', message: 'This removes the whole list. It does not affect redirects you created.' })) clear.mutate(); }}>Clear all</Button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState title="No 404s logged" description="When a visitor hits a page that doesn't exist, it will show up here." />
      ) : (
        <>
          <ul className="divide-y divide-zinc-100 rounded-lg ring-1 ring-zinc-200">
            {items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
                <span className="min-w-0 flex-1 basis-60 truncate font-mono text-xs">{row.path}</span>
                {row.resolved && <Badge tone="green">Redirected</Badge>}
                <span className="text-xs text-zinc-500">{row.hits} hit{row.hits === 1 ? '' : 's'}</span>
                <span className="w-24 text-right text-xs text-zinc-500">{formatDate(row.lastHitAt)}</span>
                {!row.resolved && <Button size="sm" variant="subtle" onClick={() => { setRedirectFor({ id: row.id, path: row.path }); setTarget(''); }}>Redirect</Button>}
                <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 />} aria-label="Delete" onClick={() => remove.mutate(row.id)} />
              </li>
            ))}
          </ul>
          <Pagination page={list.data!.page} pages={list.data!.pages} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(redirectFor)}
        onClose={() => setRedirectFor(null)}
        title="Create a redirect"
        description={redirectFor ? `Send ${redirectFor.path} to:` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRedirectFor(null)}>Cancel</Button>
            <Button variant="primary" loading={makeRedirect.isPending} disabled={!target.trim()} onClick={() => redirectFor && makeRedirect.mutate({ id: redirectFor.id, toPath: target.trim() })}>Create redirect</Button>
          </>
        }
      >
        <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="/new-page" aria-label="Redirect target" autoFocus />
        <p className="mt-2 text-xs text-zinc-500">A site path like /new-page or a full https:// URL. A 301 redirect is created.</p>
      </Modal>
    </div>
  );
}
