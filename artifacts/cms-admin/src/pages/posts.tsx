import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resourceTypeLabel, resourceTypeSegment, slugify, solutionNames, type Seo } from '@workspace/cms-content';
import type { JSONContent } from '@tiptap/react';
import { Archive, ArrowLeft, Clock, Newspaper, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearch } from 'wouter';
import { toast } from 'sonner';
import { useConfirm } from '@/components/dialog';
import { RichTextEditor } from '@/components/editor';
import { ImageField } from '@/components/media';
import { PublishBox, StatusBadge } from '@/components/publishing';
import { SeoPanel } from '@/components/seo';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Field, Input, Notice, PageHeader, PageLoader, Pagination, Select, SelectField, Switch, Tabs, TextAreaField } from '@/components/ui';
import { del, errorMessage, fieldErrors, get, patch, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useDebounced, useDraft, useUnsavedChanges } from '@/lib/hooks';
import type { EventDetails, Paged, PostDetail, PostSummary, ResourceType, SolutionName, Term, UseCaseDetails } from '@/lib/types';
import { EventFields, NewResourceMenu, UseCaseFields, eventFrom, resourceTypes, useCaseFrom } from './resource-fields';

const statusTabs = [
  { value: '', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

export function useTerms() {
  const categories = useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => get<{ items: Term[] }>('/api/admin/categories', signal) });
  const tags = useQuery({ queryKey: ['tags'], queryFn: ({ signal }) => get<{ items: Term[] }>('/api/admin/tags', signal) });
  return { categories: categories.data?.items ?? [], tags: tags.data?.items ?? [] };
}

export function PostsListPage() {
  const { can } = useAuth();
  const [, navigate] = useLocation();
  const initial = new URLSearchParams(useSearch());
  const [status, setStatus] = useState(initial.get('status') ?? '');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [author, setAuthor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const { categories, tags } = useTerms();
  const authors = useQuery({ queryKey: ['authors'], queryFn: ({ signal }) => get<{ items: { id: string; name: string }[] }>('/api/admin/authors', signal), enabled: can('posts.editAll') });

  const list = useQuery({
    queryKey: ['posts', { status, type, search, category, tag, author, from, to, page }],
    queryFn: ({ signal }) =>
      get<Paged<PostSummary>>(`/api/admin/posts${qs({ status, type, q: search, category, tag, author, from: from && new Date(from).toISOString(), to: to && new Date(`${to}T23:59:59`).toISOString(), page })}`, signal),
    placeholderData: (previous) => previous,
  });

  const create = useMutation({
    mutationFn: (kind: ResourceType) => post<{ post: PostDetail }>('/api/admin/posts', { title: `Untitled ${resourceTypeLabel[kind].toLowerCase()}`, type: kind }),
    onSuccess: (result) => navigate(`/posts/${result.post.id}`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const filtered = Boolean(search || type || category || tag || author || from || to);
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  return (
    <>
      <PageHeader
        title="Resources"
        description={can('posts.editAll') ? 'Blogs, use cases and events published at /resources.' : 'Your resources for /resources.'}
        actions={<NewResourceMenu loading={create.isPending} onPick={(kind) => create.mutate(kind)} />}
      />
      <Card>
        <Tabs value={status} onChange={resetPage(setStatus)} tabs={statusTabs.map((t) => ({ ...t }))} className="px-4 pt-1" />
        <div className="grid gap-2 border-b border-zinc-100 p-4 sm:grid-cols-2 lg:grid-cols-7">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Search title or excerpt" className="pl-9" aria-label="Search resources" />
          </div>
          <Select value={type} onChange={(event) => resetPage(setType)(event.target.value)} aria-label="Type">
            <option value="">All types</option>
            {resourceTypes.map((t) => <option key={t} value={t}>{resourceTypeLabel[t]}</option>)}
          </Select>
          <Select value={category} onChange={(event) => resetPage(setCategory)(event.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </Select>
          <Select value={tag} onChange={(event) => resetPage(setTag)(event.target.value)} aria-label="Tag">
            <option value="">All tags</option>
            {tags.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}
          </Select>
          {can('posts.editAll') ? (
            <Select value={author} onChange={(event) => resetPage(setAuthor)(event.target.value)} aria-label="Author">
              <option value="">All authors</option>
              {authors.data?.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          ) : <span className="hidden lg:block" />}
          <div className="flex items-center gap-1.5 sm:col-span-2 lg:col-span-1">
            <Input type="date" value={from} onChange={(event) => resetPage(setFrom)(event.target.value)} aria-label="Edited from" className="px-2 text-xs" />
            <Input type="date" value={to} onChange={(event) => resetPage(setTo)(event.target.value)} aria-label="Edited to" className="px-2 text-xs" />
          </div>
        </div>
        {filtered && (
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/60 px-5 py-2 text-xs text-zinc-600">
            <span>{list.data ? `${list.data.total} matching resource${list.data.total === 1 ? '' : 's'}` : 'Filtering…'}</span>
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => { setQ(''); setType(''); setCategory(''); setTag(''); setAuthor(''); setFrom(''); setTo(''); setPage(1); }}>Clear filters</button>
          </div>
        )}
        {list.isLoading ? (
          <PageLoader />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Newspaper />} title={filtered || status ? 'No resources match' : 'No resources yet'} description={filtered || status ? 'Try different filters.' : 'Create the first blog, use case or event for the Resources section.'} action={!filtered && !status && <NewResourceMenu loading={create.isPending} onPick={(kind) => create.mutate(kind)} variant="subtle" />} />
        ) : (
          <>
            <ul className="divide-y divide-zinc-100">
              {list.data.items.map((item) => (
                <li key={item.id}>
                  <Link href={`/posts/${item.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 hover:bg-zinc-50">
                    <div className="hidden size-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 sm:block">
                      {item.featuredImage && <img src={item.featuredImage} alt="" className="size-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {item.featured && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />}
                        {item.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                        <span>{item.author.name}</span>
                        {item.solutions.length > 0 && <span>· {item.solutions.join(', ')}</span>}
                        {item.type === 'BLOG' && <span className="inline-flex items-center gap-1">· <Clock className="size-3" aria-hidden="true" />{item.readingMinutes} min</span>}
                      </p>
                    </div>
                    <Badge tone="neutral">{resourceTypeLabel[item.type]}</Badge>
                    <StatusBadge status={item.status} />
                    <p className="w-28 text-right text-xs text-zinc-500">{item.status === 'PUBLISHED' ? formatDate(item.publishedAt) : `Edited ${formatDate(item.updatedAt)}`}</p>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

function TagPicker({ selected, onChange, all, canCreate }: { selected: Term[]; onChange: (next: Term[]) => void; all: Term[]; canCreate: boolean }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const create = useMutation({
    mutationFn: (name: string) => post<{ tag: Term }>('/api/admin/tags', { name }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      if (!selected.some((t) => t.id === result.tag.id)) onChange([...selected, result.tag]);
      setText('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const matches = text ? all.filter((t) => t.name.toLowerCase().includes(text.toLowerCase()) && !selected.some((s) => s.id === t.id)).slice(0, 6) : [];
  const add = () => {
    const name = text.trim();
    if (!name) return;
    const existing = all.find((t) => t.name.toLowerCase() === name.toLowerCase() || t.slug === slugify(name));
    if (existing) {
      if (!selected.some((t) => t.id === existing.id)) onChange([...selected, existing]);
      setText('');
    } else if (canCreate) create.mutate(name);
  };
  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <li key={tag.id}>
              <Badge tone="blue" className="pr-1">
                {tag.name}
                <button type="button" className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove tag ${tag.name}`} onClick={() => onChange(selected.filter((t) => t.id !== tag.id))}>
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Type a tag and press Enter"
          aria-label="Add tag"
          className="h-9"
        />
        {matches.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-zinc-200">
            {matches.map((tag) => (
              <li key={tag.id}>
                <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => { onChange([...selected, tag]); setText(''); }}>{tag.name}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RelatedPicker({ postId, selected, onChange }: { postId: string; selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const results = useQuery({
    queryKey: ['posts', 'related', search],
    queryFn: ({ signal }) => get<Paged<PostSummary>>(`/api/admin/posts${qs({ q: search, status: 'PUBLISHED', pageSize: 8 })}`, signal),
    enabled: search.length > 1,
  });
  const chosen = useQuery({
    queryKey: ['posts', 'related-chosen', selected],
    queryFn: async () => Promise.all(selected.map((id) => get<{ post: PostDetail }>(`/api/admin/posts/${id}`).then((r) => r.post).catch(() => null))),
    enabled: selected.length > 0,
  });
  return (
    <div className="space-y-2">
      {chosen.data?.filter(Boolean).map((p) => (
        <div key={p!.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200">
          <span className="truncate">{p!.title}</span>
          <button type="button" className="shrink-0 rounded p-1 text-zinc-400 hover:text-red-600" aria-label={`Remove ${p!.title}`} onClick={() => onChange(selected.filter((id) => id !== p!.id))}>
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
      {selected.length < 6 && (
        <div className="relative">
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search published posts" aria-label="Find a related post" className="h-9" />
          {search.length > 1 && results.data && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white shadow-lg ring-1 ring-zinc-200">
              {results.data.items.filter((p) => p.id !== postId && !selected.includes(p.id)).map((p) => (
                <li key={p.id}>
                  <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => { onChange([...selected, p.id]); setQ(''); }}>{p.title}</button>
                </li>
              ))}
              {!results.data.items.length && <li className="px-3 py-2 text-sm text-zinc-500">No published posts match.</li>}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-zinc-500">Up to 6. Without picks, posts sharing a category or tag are shown.</p>
    </div>
  );
}

type PostDraft = {
  title: string;
  slug: string;
  type: ResourceType;
  excerpt: string;
  featured: boolean;
  solutions: SolutionName[];
  useCase: UseCaseDetails;
  event: EventDetails;
  featuredImage: string;
  featuredImageAlt: string;
  contentHtml: string;
  contentJson: Record<string, unknown>;
  categories: Term[];
  tags: Term[];
  relatedIds: string[];
  seo: Seo;
  authorId: string;
};

export function PostEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can, user } = useAuth();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(false);
  const { categories, tags } = useTerms();
  const authors = useQuery({ queryKey: ['authors'], queryFn: ({ signal }) => get<{ items: { id: string; name: string }[] }>('/api/admin/authors', signal), enabled: can('posts.editAll') });

  const query = useQuery({ queryKey: ['post', id], queryFn: ({ signal }) => get<{ post: PostDetail }>(`/api/admin/posts/${id}`, signal) });
  const item = query.data?.post;
  const source = useMemo<PostDraft | undefined>(
    () =>
      item && {
        title: item.title,
        slug: item.slug,
        type: item.type,
        excerpt: item.excerpt,
        featured: item.featured,
        solutions: item.solutions,
        useCase: useCaseFrom(item.details),
        event: eventFrom(item.details),
        featuredImage: item.featuredImage,
        featuredImageAlt: item.featuredImageAlt,
        contentHtml: item.contentHtml,
        contentJson: item.contentJson,
        categories: item.categories,
        tags: item.tags,
        relatedIds: item.relatedIds,
        seo: item.seo,
        authorId: item.author.id,
      },
    [item],
  );
  const { draft, setDraft, dirty } = useDraft(source);
  useUnsavedChanges(dirty);

  const detailsFor = (d: PostDraft) => {
    if (d.type === 'USE_CASE') return d.useCase;
    if (d.type === 'EVENT') return { ...d.event, startsAt: d.event.startsAt, endsAt: d.event.endsAt || undefined };
    return {};
  };
  const payload = (d: PostDraft) => ({
    title: d.title,
    slug: d.slug,
    type: d.type,
    excerpt: d.excerpt,
    featured: d.featured,
    solutions: d.solutions,
    details: detailsFor(d),
    featuredImage: d.featuredImage,
    featuredImageAlt: d.featuredImageAlt,
    contentHtml: d.contentHtml,
    contentJson: d.contentJson,
    categoryIds: d.categories.map((c) => c.id),
    tagIds: d.tags.map((t) => t.id),
    relatedIds: d.relatedIds,
    seo: d.seo,
    ...(can('posts.editAll') ? { authorId: d.authorId } : {}),
  });

  const apply = (result: { post: PostDetail }) => {
    queryClient.setQueryData(['post', id], result);
    queryClient.invalidateQueries({ queryKey: ['posts'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    setErrors({});
  };
  const onFail = (error: unknown) => {
    setErrors(fieldErrors(error));
    toast.error(errorMessage(error));
  };

  const save = useMutation({ mutationFn: () => patch<{ post: PostDetail }>(`/api/admin/posts/${id}`, payload(draft!)), onSuccess: apply, onError: onFail });
  const saveFirst = async () => {
    if (dirty) await save.mutateAsync();
  };
  const action = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: unknown }) => {
      await saveFirst();
      return post<{ post: PostDetail }>(`/api/admin/posts/${id}/${path}`, body);
    },
    onSuccess: (result, variables) => {
      apply(result);
      const messages: Record<string, string> = { publish: 'Published.', schedule: 'Scheduled.', unpublish: 'Moved back to draft.', archive: 'Archived. It is no longer on the site.' };
      toast.success(messages[variables.path] ?? 'Done');
    },
    onError: onFail,
  });
  const remove = useMutation({
    mutationFn: () => del(`/api/admin/posts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Post deleted');
      navigate('/posts');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!item || !draft) return null;

  const set = <K extends keyof PostDraft>(key: K, value: PostDraft[K]) => setDraft({ ...draft, [key]: value });
  // Keep the slug following the title until it is published or edited by hand.
  const autoSlug = !slugTouched && !item.publishedAt;
  const setTitle = (title: string) => setDraft({ ...draft, title, ...(autoSlug ? { slug: slugify(title) || draft.slug } : {}) });
  const words = draft.contentHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 225));
  const canDelete = can('posts.delete') || !item.publishedAt;
  const segment = resourceTypeSegment[draft.type];
  const origin = new URL(item.liveUrl).origin;

  const preview = async () => {
    try {
      await saveFirst();
      window.open(`${origin}/resources/${segment}/${draft.slug}?preview=1`, '_blank', 'noopener');
    } catch {
      /* shown already */
    }
  };

  return (
    <>
      <PageHeader
        back={<Link href="/posts" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-ink"><ArrowLeft className="size-3.5" aria-hidden="true" /> All resources</Link>}
        title={draft.title || 'Untitled resource'}
        description={<span className="font-mono">/resources/{segment}/{draft.slug}</span>}
        actions={<><Badge tone="neutral">{resourceTypeLabel[draft.type]}</Badge><StatusBadge status={item.status} /></>}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <Field label="Title" error={errors.title} required>
              {(wiring) => <Input {...wiring} value={draft.title} onChange={(event) => setTitle(event.target.value)} className="h-12 text-lg font-semibold" />}
            </Field>
            <Field label="URL slug" error={errors.slug} hint={item.publishedAt ? 'Changing it adds a redirect from the old address automatically.' : autoSlug ? 'Follows the title until you edit it.' : undefined}>
              {(wiring) => (
                <div className="flex rounded-lg shadow-sm">
                  <span className="inline-flex items-center rounded-l-lg bg-zinc-50 px-2.5 font-mono text-xs text-zinc-500 ring-1 ring-zinc-300 ring-inset">/resources/{segment}/</span>
                  <Input {...wiring} value={draft.slug} onChange={(event) => { setSlugTouched(true); set('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')); }} className="rounded-l-none font-mono text-xs shadow-none" />
                </div>
              )}
            </Field>
            <TextAreaField label="Summary" value={draft.excerpt} onChange={(v) => set('excerpt', v)} rows={2} counter={300} hint="Shown on the Resources card and used as the search description by default." error={errors.excerpt} />
          </Card>

          {draft.type === 'BLOG' ? (
            <>
              <RichTextEditor
                key={item.id}
                initialJson={draft.contentJson as JSONContent}
                initialHtml={draft.contentHtml}
                onChange={(html, json) => setDraft((current) => (current ? { ...current, contentHtml: html, contentJson: json as Record<string, unknown> } : current))}
                label="Article content"
                error={errors.contentHtml}
              />
              <p className="flex items-center gap-1.5 text-xs text-zinc-500"><Clock className="size-3.5" aria-hidden="true" /> {words} words · about {minutes} min read</p>
            </>
          ) : draft.type === 'USE_CASE' ? (
            <UseCaseFields value={draft.useCase} onChange={(v) => set('useCase', v)} errors={errors} />
          ) : (
            <EventFields value={draft.event} onChange={(v) => set('event', v)} errors={errors} />
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-5">
            <PublishBox
              status={item.status}
              publishAt={item.publishAt}
              publishedAt={item.publishedAt}
              updatedAt={item.updatedAt}
              dirty={dirty}
              saving={save.isPending}
              busy={action.isPending}
              canPublish={can('posts.publish')}
              liveUrl={item.liveUrl}
              onSave={() => save.mutate(undefined, { onSuccess: () => toast.success('Draft saved') })}
              onPreview={preview}
              onPublish={() => action.mutate({ path: 'publish' })}
              onSchedule={(publishAt) => action.mutate({ path: 'schedule', body: { publishAt } })}
              onUnpublish={() => action.mutate({ path: 'unpublish' })}
              unpublishLabel="Revert to draft"
              extra={
                <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                  {item.status !== 'ARCHIVED' && (
                    <Button size="sm" variant="ghost" icon={<Archive />} onClick={async () => { if (await confirm({ title: 'Archive this post?', message: 'It comes off the site but stays here, and you can publish it again later.', confirmLabel: 'Archive', tone: 'primary' })) action.mutate({ path: 'archive' }); }}>
                      Archive
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" icon={<Trash2 />} onClick={async () => { if (await confirm({ title: `Delete “${item.title}”?`, message: 'The post is removed permanently. To take it off the site but keep it, archive it instead.' })) remove.mutate(); }}>
                      Delete
                    </Button>
                  )}
                </div>
              }
            />
          </Card>

          <Card>
            <CardHeader title="Type & visibility" />
            <div className="space-y-4 p-5">
              <SelectField
                label="Resource type"
                value={draft.type}
                onChange={(v) => set('type', v as ResourceType)}
                options={resourceTypes.map((t) => ({ value: t, label: resourceTypeLabel[t] }))}
                hint={draft.type === 'BLOG' ? 'An article with a rich-text body.' : draft.type === 'USE_CASE' ? 'A structured story: challenge, approach, benefits.' : 'An event with a date, time zone and registration.'}
              />
              <Switch
                checked={draft.featured}
                onChange={(v) => set('featured', v)}
                label="Feature on Resources"
                description="Shows in the large card at the top. Only one resource is featured at a time."
              />
              <fieldset className="space-y-2">
                <legend className="text-[13px] font-medium text-zinc-800">Solutions</legend>
                <p className="text-xs text-zinc-500">Which products this relates to. Used by the solution filter.</p>
                {solutionNames.map((s) => (
                  <Checkbox
                    key={s}
                    label={s}
                    checked={draft.solutions.includes(s)}
                    onChange={(checked) => set('solutions', checked ? [...draft.solutions, s] : draft.solutions.filter((x) => x !== s))}
                  />
                ))}
                {errors.solutions && <p className="text-xs text-red-600">{errors.solutions}</p>}
              </fieldset>
            </div>
          </Card>

          <Card>
            <CardHeader title="Categories" description="Optional grouping" />
            <div className="space-y-2 p-5">
              {categories.length ? (
                categories.map((category) => (
                  <Checkbox
                    key={category.id}
                    label={category.name}
                    checked={draft.categories.some((c) => c.id === category.id)}
                    onChange={(checked) => set('categories', checked ? [...draft.categories, category] : draft.categories.filter((c) => c.id !== category.id))}
                  />
                ))
              ) : (
                <p className="text-sm text-zinc-500">No categories yet.{can('categories.manage') && <> <Link href="/taxonomy" className="font-medium text-brand-700 hover:underline">Create one</Link>.</>}</p>
              )}
              {errors.categoryIds && <p className="text-xs text-red-600">{errors.categoryIds}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Tags" />
            <div className="p-5">
              <TagPicker selected={draft.tags} onChange={(v) => set('tags', v)} all={tags} canCreate={can('tags.create')} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Featured image" />
            <div className="p-5">
              <ImageField label="Image" value={draft.featuredImage} onChange={(v) => set('featuredImage', v)} alt={draft.featuredImageAlt} onAltChange={(v) => set('featuredImageAlt', v)} hint="Shown on the listing, at the top of the post and when shared." />
            </div>
          </Card>

          {can('posts.editAll') && (
            <Card>
              <CardHeader title="Author" />
              <div className="p-5">
                <SelectField label="Written by" value={draft.authorId} onChange={(v) => set('authorId', v)} options={(authors.data?.items ?? [{ id: item.author.id, name: item.author.name }]).map((a) => ({ value: a.id, label: a.id === user?.id ? `${a.name} (you)` : a.name }))} />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Related posts" />
            <div className="p-5">
              <RelatedPicker postId={item.id} selected={draft.relatedIds} onChange={(v) => set('relatedIds', v)} />
            </div>
          </Card>

          <Card>
            <CardHeader title="SEO" />
            <div className="p-5">
              <SeoPanel
                value={draft.seo}
                onChange={(v) => set('seo', v)}
                fallbackTitle={`${draft.title} | Veyra`}
                fallbackDescription={draft.excerpt}
                fallbackImage={draft.featuredImage}
                url={`${origin}/resources/${segment}/${draft.slug}`}
                analysis={{
                  slug: draft.slug,
                  contentText: draft.type === 'BLOG' ? draft.contentHtml.replace(/<[^>]+>/g, ' ') : [draft.excerpt, draft.useCase.challenge, ...draft.useCase.approach, ...draft.useCase.benefits, draft.event.audience, ...draft.event.learn].filter(Boolean).join(' '),
                  contentHtml: draft.type === 'BLOG' ? draft.contentHtml : undefined,
                  hasFeaturedImage: Boolean(draft.featuredImage),
                  isArticle: draft.type === 'BLOG',
                }}
                errors={errors}
              />
            </div>
          </Card>
          {item.status === 'ARCHIVED' && <Notice tone="warn">This post is archived and not on the site. Publish it to bring it back.</Notice>}
        </div>
      </div>
    </>
  );
}
