import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slugify, type Section, type Seo } from '@workspace/cms-content';
import { ArrowLeft, ChevronDown, Eye, EyeOff, FilePlus2, FileText, Lock, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { toast } from 'sonner';
import { Modal, useConfirm } from '@/components/dialog';
import { ImageField } from '@/components/media';
import { PublishBox, StatusBadge } from '@/components/publishing';
import { SeoPanel } from '@/components/seo';
import { SortableList } from '@/components/sortable';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, IconButton, Input, Notice, PageHeader, PageLoader, Select, TextAreaField, TextField } from '@/components/ui';
import { del, errorMessage, fieldErrors, get, patch, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDateTime } from '@/lib/format';
import { useDraft, useUnsavedChanges } from '@/lib/hooks';
import type { PageDetail, PageSummary } from '@/lib/types';
import { SectionEditor, newSection, sectionMeta } from './sections';

export function PagesListPage() {
  const [, navigate] = useLocation();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = useQuery({
    queryKey: ['pages', q, status],
    queryFn: ({ signal }) => get<{ items: PageSummary[] }>(`/api/admin/pages${qs({ q, status })}`, signal),
  });
  const create = useMutation({
    mutationFn: (title: string) => post<{ page: PageDetail }>('/api/admin/pages', { title }),
    onSuccess: (result) => navigate(`/pages/${result.page.id}`),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  return (
    <>
      <PageHeader
        title="Pages"
        description="The homepage, the contact page, and any page you add. Changes stay in draft until you publish them."
        actions={can('pages.edit') && <Button variant="primary" icon={<FilePlus2 />} onClick={() => setCreating(true)}>New page</Button>}
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-zinc-100 p-4">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search pages" className="pl-9" aria-label="Search pages" />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-44" aria-label="Status">
            <option value="">All statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
          </Select>
        </div>
        {list.isLoading ? (
          <PageLoader />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<FileText />} title={q || status ? 'No pages match' : 'No pages yet'} />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {list.data.items.map((page) => (
              <li key={page.id}>
                <Link href={`/pages/${page.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 hover:bg-zinc-50">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {page.title}
                      {page.isSystem && <Lock className="size-3.5 text-zinc-400" aria-label="Built-in page" />}
                    </p>
                    <p className="font-mono text-xs text-zinc-500">{page.path}</p>
                  </div>
                  <StatusBadge status={page.status} hasChanges={page.hasChanges} />
                  <p className="w-48 text-right text-xs text-zinc-500">
                    {formatDateTime(page.updatedAt)}
                    {page.updatedBy && <><br />by {page.updatedBy}</>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        size="sm"
        title="New page"
        description="You can change the title and URL afterwards. It stays a draft until you publish it."
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" loading={create.isPending} disabled={!title.trim()} onClick={() => create.mutate(title.trim())}>Create page</Button>
          </>
        }
      >
        <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) create.mutate(title.trim()); }}>
          <TextField label="Page title" value={title} onChange={setTitle} autoFocus hint={title ? <>Address: <span className="font-mono">/{slugify(title) || '…'}</span></> : undefined} />
        </form>
      </Modal>
    </>
  );
}

type PageDraft = { title: string; slug: string; excerpt: string; featuredImage: string; sections: Section[]; seo: Seo };

function fieldsFor(errors: Record<string, string>, index: number) {
  const prefix = `sections.${index}.`;
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
}

export function PageEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  // Bumped whenever the draft is replaced wholesale, so rich text editors
  // (which keep their own state) remount with the new content.
  const [generation, setGeneration] = useState(0);

  const query = useQuery({ queryKey: ['page', id], queryFn: ({ signal }) => get<{ page: PageDetail }>(`/api/admin/pages/${id}`, signal) });
  const page = query.data?.page;
  const source = useMemo<PageDraft | undefined>(
    () => page && { title: page.title, slug: page.slug, excerpt: page.excerpt, featuredImage: page.featuredImage, sections: page.sections, seo: page.seo },
    [page],
  );
  const { draft, setDraft, dirty } = useDraft(source);
  useUnsavedChanges(dirty);

  const apply = (result: { page: PageDetail }) => {
    queryClient.setQueryData(['page', id], result);
    queryClient.invalidateQueries({ queryKey: ['pages'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    setErrors({});
  };
  const onFail = (error: unknown) => {
    setErrors(fieldErrors(error));
    toast.error(errorMessage(error));
  };

  const save = useMutation({
    mutationFn: () => patch<{ page: PageDetail }>(`/api/admin/pages/${id}`, page?.isSystem ? { ...draft, slug: undefined } : draft),
    onSuccess: apply,
    onError: onFail,
  });

  const saveFirst = async () => {
    if (dirty) await save.mutateAsync();
  };

  const action = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: unknown }) => {
      await saveFirst();
      return post<{ page: PageDetail }>(`/api/admin/pages/${id}/${path}`, body);
    },
    onSuccess: (result, variables) => {
      apply(result);
      const messages: Record<string, string> = { publish: 'Published. Visitors now see this version.', schedule: 'Scheduled.', unpublish: 'Unpublished. The page is now a draft.', discard: 'Unpublished changes discarded.' };
      toast.success(messages[variables.path] ?? 'Done');
      if (variables.path === 'discard') setGeneration((n) => n + 1);
    },
    onError: onFail,
  });

  const remove = useMutation({
    mutationFn: () => del(`/api/admin/pages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      toast.success('Page deleted');
      navigate('/pages');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!page || !draft) return null;

  const set = <K extends keyof PageDraft>(key: K, value: PageDraft[K]) => setDraft({ ...draft, [key]: value });
  const setSection = (index: number, next: Section) => set('sections', draft.sections.map((s, i) => (i === index ? next : s)));
  const usedTypes = new Set(draft.sections.map((s) => s.type));
  const addable = page.allowedSections.filter((type) => type === 'richText' || !usedTypes.has(type));
  const path = page.isSystem ? page.path : `/${draft.slug}`;

  const preview = async () => {
    try {
      await saveFirst();
      window.open(page.previewUrl.replace(page.path, path), '_blank', 'noopener');
    } catch {
      /* errors already shown */
    }
  };

  return (
    <>
      <PageHeader
        back={<Link href="/pages" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-ink"><ArrowLeft className="size-3.5" aria-hidden="true" /> All pages</Link>}
        title={draft.title || 'Untitled page'}
        description={<span className="font-mono">{path}</span>}
        actions={<StatusBadge status={page.status} hasChanges={page.hasChanges} />}
      />

      {errors._ && <Notice tone="error" className="mb-4">{errors._}</Notice>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Sections"
              description="Drag to reorder. Hidden sections stay saved but are not shown to visitors."
              actions={addable.length > 0 && <Button size="sm" icon={<Plus />} onClick={() => setAdding(true)}>Add section</Button>}
            />
            {draft.sections.length === 0 ? (
              <EmptyState title="This page has no sections" action={<Button variant="subtle" icon={<Plus />} onClick={() => setAdding(true)}>Add a section</Button>} />
            ) : (
              <SortableList
                items={draft.sections}
                getId={(section) => section.id}
                onReorder={(next) => set('sections', next)}
                className="divide-y divide-zinc-100"
                renderItem={(section, handle, index) => {
                  const meta = sectionMeta[section.type];
                  const expanded = open[section.id] ?? false;
                  const sectionErrors = fieldsFor(errors, index);
                  const hasError = Object.keys(sectionErrors).length > 0 || Boolean(errors[`sections.${index}`]);
                  return (
                    <div className={cn('bg-white', !section.visible && 'bg-zinc-50/80')}>
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        {handle}
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen({ ...open, [section.id]: !expanded })} aria-expanded={expanded}>
                          <ChevronDown className={cn('size-4 shrink-0 text-zinc-400 transition-transform', !expanded && '-rotate-90')} aria-hidden="true" />
                          <span className="min-w-0">
                            <span className={cn('block text-sm font-medium', !section.visible && 'text-zinc-500')}>{meta.label}</span>
                            <span className="block truncate text-xs text-zinc-500">{meta.description}</span>
                          </span>
                        </button>
                        {hasError && <Badge tone="red">Needs attention</Badge>}
                        {!section.visible && <Badge>Hidden</Badge>}
                        <IconButton label={section.visible ? 'Hide section' : 'Show section'} onClick={() => setSection(index, { ...section, visible: !section.visible })}>
                          {section.visible ? <Eye /> : <EyeOff />}
                        </IconButton>
                        <IconButton
                          label="Remove section"
                          className="hover:text-red-600"
                          onClick={async () => {
                            if (await confirm({ title: `Remove the ${meta.label.toLowerCase()} section?`, message: 'Its content is removed from this page when you save. If you only want to hide it for now, use the eye button instead.', confirmLabel: 'Remove' })) {
                              set('sections', draft.sections.filter((_, i) => i !== index));
                            }
                          }}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                      {errors[`sections.${index}`] && <p className="px-14 pb-2 text-xs text-red-600">{errors[`sections.${index}`]}</p>}
                      {expanded && (
                        <div className="border-t border-zinc-100 px-5 py-5">
                          <SectionEditor key={`${section.id}-${generation}`} section={section} onChange={(next) => setSection(index, next)} errors={sectionErrors} />
                        </div>
                      )}
                    </div>
                  );
                }}
              />
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-5">
            <PublishBox
              status={page.status}
              hasChanges={page.hasChanges}
              publishAt={page.publishAt}
              publishedAt={page.publishedAt}
              updatedAt={page.updatedAt}
              updatedBy={page.updatedBy}
              dirty={dirty}
              saving={save.isPending}
              busy={action.isPending}
              canPublish={can('pages.publish')}
              liveUrl={page.liveUrl}
              onSave={() => save.mutate(undefined, { onSuccess: () => toast.success('Draft saved') })}
              onPreview={preview}
              onPublish={() => action.mutate({ path: 'publish' })}
              onSchedule={(publishAt) => action.mutate({ path: 'schedule', body: { publishAt } })}
              onUnpublish={page.isSystem ? undefined : () => action.mutate({ path: 'unpublish' })}
              extra={
                <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                  {page.hasChanges && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (await confirm({ title: 'Discard unpublished changes?', message: 'The page goes back to exactly what visitors see now. This cannot be undone.', confirmLabel: 'Discard changes' })) action.mutate({ path: 'discard' });
                      }}
                    >
                      Discard changes
                    </Button>
                  )}
                  {!page.isSystem && can('pages.delete') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      icon={<Trash2 />}
                      onClick={async () => {
                        if (await confirm({ title: `Delete “${page.title}”?`, message: 'The page and its content are removed permanently. Links to it will show the site’s “not found” page unless you add a redirect.' })) remove.mutate();
                      }}
                    >
                      Delete page
                    </Button>
                  )}
                </div>
              }
            />
          </Card>

          <Card>
            <CardHeader title="Page details" />
            <div className="space-y-4 p-5">
              <TextField label="Title" value={draft.title} onChange={(v) => set('title', v)} required error={errors.title} hint="Used in the admin and as the default browser-tab title." />
              {page.isSystem ? (
                <Field label="URL" hint="The homepage and contact page addresses are fixed.">
                  {(wiring) => <Input {...wiring} value={page.path} disabled className="font-mono text-xs" />}
                </Field>
              ) : (
                <Field label="URL slug" error={errors.slug} hint={page.hasPublishedVersion ? 'Changing it adds a redirect from the old address automatically.' : 'Lowercase letters, numbers and hyphens.'}>
                  {(wiring) => (
                    <div className="flex rounded-lg shadow-sm">
                      <span className="inline-flex items-center rounded-l-lg bg-zinc-50 px-2.5 font-mono text-xs text-zinc-500 ring-1 ring-zinc-300 ring-inset">/</span>
                      <Input {...wiring} value={draft.slug} onChange={(event) => set('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="rounded-l-none font-mono text-xs shadow-none" />
                    </div>
                  )}
                </Field>
              )}
              <TextAreaField label="Excerpt" value={draft.excerpt} onChange={(v) => set('excerpt', v)} rows={3} hint="A short summary, used as the search description when none is set below." error={errors.excerpt} />
              <ImageField label="Featured image" value={draft.featuredImage} onChange={(v) => set('featuredImage', v)} hint="Used for social sharing when no social image is set." error={errors.featuredImage} />
            </div>
          </Card>

          <Card>
            <CardHeader title="SEO" />
            <div className="p-5">
              <SeoPanel
                value={draft.seo}
                onChange={(next) => set('seo', next)}
                fallbackTitle={draft.title}
                fallbackDescription={draft.excerpt}
                fallbackImage={draft.featuredImage}
                url={page.liveUrl.replace(page.path, path)}
                analysis={{ slug: draft.slug, contentText: [draft.excerpt, JSON.stringify(draft.sections).replace(/"[a-z]+":/gi, ' ').replace(/[{}[\]":,]/g, ' ')].join(' '), hasFeaturedImage: Boolean(draft.featuredImage) }}
                errors={errors}
              />
            </div>
          </Card>
        </div>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a section" description="Each section looks exactly like it does elsewhere on the site.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {addable.map((type) => (
            <li key={type}>
              <button
                type="button"
                onClick={() => {
                  const section = newSection(type);
                  set('sections', [...draft.sections, section]);
                  setOpen({ ...open, [section.id]: true });
                  setAdding(false);
                }}
                className="h-full w-full rounded-lg p-3.5 text-left ring-1 ring-zinc-200 hover:bg-brand-50/50 hover:ring-brand-500"
              >
                <span className="block text-sm font-medium">{sectionMeta[type].label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{sectionMeta[type].description}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

