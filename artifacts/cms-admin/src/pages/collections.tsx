import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { legacyMarks, slugify, type ProductFeature } from '@workspace/cms-content';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useParams } from 'wouter';
import { toast } from 'sonner';
import { Modal, useConfirm } from '@/components/dialog';
import { ImageField, VideoField } from '@/components/media';
import { SortableList, move } from '@/components/sortable';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Notice, PageHeader, PageLoader, SelectField, TextAreaField, TextField } from '@/components/ui';
import { del, errorMessage, fieldErrors, get, patch, post } from '@/lib/api';
import { cn, newId } from '@/lib/format';

type Item = Record<string, unknown> & { id: string; published: boolean; order: number };
type Errors = Record<string, string>;
type FormProps = { value: Item; onChange: (next: Item) => void; errors: Errors };

type Config = {
  title: string;
  singular: string;
  description: ReactNode;
  empty: () => Record<string, unknown>;
  summary: (item: Item) => { primary: ReactNode; secondary?: ReactNode; thumb?: string };
  Form: (props: FormProps) => ReactNode;
  wide?: boolean;
};

const str = (value: unknown) => (typeof value === 'string' ? value : '');

const configs: Record<string, Config> = {
  metrics: {
    title: 'Statistics',
    singular: 'statistic',
    description: 'The results grid under the trust strip. Shown in this order; hidden ones stay saved.',
    empty: () => ({ value: '', label: '' }),
    summary: (item) => ({ primary: <span className="font-semibold tabular-nums">{str(item.value)}</span>, secondary: str(item.label) }),
    Form: ({ value, onChange, errors }) => (
      <div className="space-y-4">
        <TextField label="Figure" value={str(value.value)} onChange={(v) => onChange({ ...value, value: v })} placeholder="+16%" required error={errors.value} hint="Kept short so it fits the card: +16%, 50X, 60%+." />
        <TextField label="Description" value={str(value.label)} onChange={(v) => onChange({ ...value, label: v })} placeholder="increase in shoppers who buy" required error={errors.label} />
      </div>
    ),
  },
  testimonials: {
    title: 'Testimonials',
    singular: 'testimonial',
    description: 'Customer stories in the carousel. Use role and company type rather than names unless you have permission to quote someone.',
    empty: () => ({ quote: '', role: '', segment: '', outcome: '', explanation: '' }),
    summary: (item) => ({ primary: `“${str(item.quote).slice(0, 110)}${str(item.quote).length > 110 ? '…' : ''}”`, secondary: [str(item.role), str(item.segment)].filter(Boolean).join(' · ') }),
    Form: ({ value, onChange, errors }) => (
      <div className="space-y-4">
        <TextAreaField label="Quote" value={str(value.quote)} onChange={(v) => onChange({ ...value, quote: v })} rows={4} required error={errors.quote} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Role or name" value={str(value.role)} onChange={(v) => onChange({ ...value, role: v })} required error={errors.role} />
          <TextField label="Company type" value={str(value.segment)} onChange={(v) => onChange({ ...value, segment: v })} placeholder="Fashion Retail · 500–1,000 employees" error={errors.segment} />
        </div>
        <TextField label="Outcome" value={str(value.outcome)} onChange={(v) => onChange({ ...value, outcome: v })} placeholder="+16% increase in conversion" error={errors.outcome} />
        <TextAreaField label="How Veyra helped" value={str(value.explanation)} onChange={(v) => onChange({ ...value, explanation: v })} rows={2} error={errors.explanation} />
      </div>
    ),
  },
  faqs: {
    title: 'FAQs',
    singular: 'question',
    description: 'Questions in the FAQ section. The first one opens by default.',
    empty: () => ({ question: '', answer: '' }),
    summary: (item) => ({ primary: str(item.question), secondary: str(item.answer) ? `${str(item.answer).slice(0, 120)}${str(item.answer).length > 120 ? '…' : ''}` : <span className="text-amber-700">No answer yet</span> }),
    Form: ({ value, onChange, errors }) => (
      <div className="space-y-4">
        <TextField label="Question" value={str(value.question)} onChange={(v) => onChange({ ...value, question: v })} required error={errors.question} />
        <TextAreaField label="Answer" value={str(value.answer)} onChange={(v) => onChange({ ...value, answer: v })} rows={6} error={errors.answer} hint="Without an answer the site shows that one is pending." />
      </div>
    ),
  },
  logos: {
    title: 'Client logos',
    singular: 'logo',
    description: 'The trust strip. Upload a logo image, or use one of the built-in wordmarks.',
    empty: () => ({ name: '', imageUrl: '', legacyMark: null }),
    summary: (item) => ({ primary: str(item.name), secondary: str(item.imageUrl) ? 'Uploaded logo' : item.legacyMark ? 'Built-in wordmark' : 'Text only', thumb: str(item.imageUrl) || undefined }),
    Form: ({ value, onChange, errors }) => (
      <div className="space-y-4">
        <TextField label="Company name" value={str(value.name)} onChange={(v) => onChange({ ...value, name: v })} required error={errors.name} hint="Also used as the image's alt text." />
        <ImageField label="Logo image" value={str(value.imageUrl)} onChange={(v) => onChange({ ...value, imageUrl: v })} hint="SVG or a transparent PNG works best. Displayed up to 32px tall." error={errors.imageUrl} />
        {!str(value.imageUrl) && (
          <SelectField
            label="Built-in wordmark"
            value={str(value.legacyMark)}
            onChange={(v) => onChange({ ...value, legacyMark: v || null })}
            options={[{ value: '', label: 'None — show the name as text' }, ...legacyMarks.map((mark) => ({ value: mark, label: mark }))]}
            hint="The hand-built marks the site launched with."
          />
        )}
      </div>
    ),
  },
  products: {
    title: 'Products & features',
    singular: 'product',
    description: 'The stacked product cards. Each has an introduction and a set of feature tabs, each tab with its own video.',
    wide: true,
    empty: () => ({ name: '', kicker: '', anchorId: '', introTitle: '', introBody: '', bridge: '', ctaLabel: 'Book a demo call', features: [newFeature()] }),
    summary: (item) => ({ primary: str(item.name), secondary: `${(item.features as ProductFeature[]).length} feature tab${(item.features as ProductFeature[]).length === 1 ? '' : 's'}${str(item.anchorId) ? ` · #${str(item.anchorId)}` : ''}` }),
    Form: (props) => <ProductForm {...props} />,
  },
};

function newFeature(): ProductFeature {
  return { id: newId('feature'), label: '', heading: '', body: '', impact: '', video: { mp4: '', webm: '', poster: '' } };
}

function ProductForm({ value, onChange, errors }: FormProps) {
  const features = (value.features as ProductFeature[]) ?? [];
  const setFeatures = (next: ProductFeature[]) => onChange({ ...value, features: next });
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Product name" value={str(value.name)} onChange={(v) => onChange({ ...value, name: v })} required error={errors.name} />
        <TextField label="Kicker" value={str(value.kicker)} onChange={(v) => onChange({ ...value, kicker: v })} placeholder="VEYRA ONLINE" error={errors.kicker} />
      </div>
      <TextAreaField label="Headline" value={str(value.introTitle)} onChange={(v) => onChange({ ...value, introTitle: v })} rows={2} error={errors.introTitle} />
      <TextAreaField label="Introduction" value={str(value.introBody)} onChange={(v) => onChange({ ...value, introBody: v })} rows={3} error={errors.introBody} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Line above the card" value={str(value.bridge)} onChange={(v) => onChange({ ...value, bridge: v })} hint="Optional, shown between cards." error={errors.bridge} />
        <TextField label="Button label" value={str(value.ctaLabel)} onChange={(v) => onChange({ ...value, ctaLabel: v })} error={errors.ctaLabel} />
        <TextField label="Anchor" value={str(value.anchorId)} onChange={(v) => onChange({ ...value, anchorId: slugify(v, 60) })} placeholder={slugify(str(value.name))} hint="For links like /#veyra-online." error={errors.anchorId} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-zinc-800">Feature tabs</legend>
        {errors.features && <p className="text-xs text-red-600">{errors.features}</p>}
        <ul className="space-y-2">
          {features.map((feature, index) => {
            const open = openIndex === index;
            const set = (patchValue: Partial<ProductFeature>) => setFeatures(features.map((f, i) => (i === index ? { ...f, ...patchValue } : f)));
            const fe = (key: string) => errors[`features.${index}.${key}`];
            return (
              <li key={feature.id} className="rounded-lg ring-1 ring-zinc-200">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button type="button" className="min-w-0 flex-1 truncate px-2 py-1 text-left text-sm font-medium" onClick={() => setOpenIndex(open ? null : index)} aria-expanded={open}>
                    {feature.label || <span className="text-zinc-400">Untitled tab</span>}
                    {!feature.video.mp4 && !feature.video.webm && <Badge tone="amber" className="ml-2">No video</Badge>}
                  </button>
                  <IconButton label="Move up" disabled={index === 0} onClick={() => setFeatures(move(features, index, -1))}><ArrowUp /></IconButton>
                  <IconButton label="Move down" disabled={index === features.length - 1} onClick={() => setFeatures(move(features, index, 1))}><ArrowDown /></IconButton>
                  <IconButton label="Remove tab" disabled={features.length === 1} className="hover:text-red-600" onClick={() => setFeatures(features.filter((_, i) => i !== index))}><Trash2 /></IconButton>
                </div>
                {open && (
                  <div className="space-y-4 border-t border-zinc-100 p-4">
                    <TextField label="Tab label" value={feature.label} onChange={(v) => set({ label: v })} required error={fe('label')} />
                    <TextField label="Heading" value={feature.heading} onChange={(v) => set({ heading: v })} error={fe('heading')} />
                    <TextAreaField label="Description" value={feature.body} onChange={(v) => set({ body: v })} rows={3} error={fe('body')} />
                    <TextField label="Impact line" value={feature.impact} onChange={(v) => set({ impact: v })} placeholder="+16% online conversion" error={fe('impact')} />
                    <VideoField label="Video" value={feature.video} onChange={(video) => set({ video })} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {features.length < 8 && (
          <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => { setFeatures([...features, newFeature()]); setOpenIndex(features.length); }}>Add feature tab</Button>
        )}
      </fieldset>
    </div>
  );
}

export function CollectionPage() {
  const { type } = useParams<{ type: string }>();
  const config = configs[type];
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Item | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const key = ['collection', type];

  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => get<{ items: Item[] }>(`/api/admin/collections/${type}`, signal), enabled: Boolean(config) });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: (item: Item) => {
      const { id, order: _order, createdAt: _c, updatedAt: _u, ...body } = item;
      return id ? patch(`/api/admin/collections/${type}/${id}`, body) : post(`/api/admin/collections/${type}`, body);
    },
    onSuccess: (_, item) => {
      refresh();
      toast.success(item.id ? 'Saved' : `${config.singular[0].toUpperCase()}${config.singular.slice(1)} added`);
      setEditing(null);
      setErrors({});
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      toast.error(errorMessage(error));
    },
  });

  const toggle = useMutation({
    mutationFn: (item: Item) => patch(`/api/admin/collections/${type}/${item.id}`, { published: !item.published }),
    onMutate: async (item) => {
      queryClient.setQueryData<{ items: Item[] }>(key, (old) => old && { items: old.items.map((i) => (i.id === item.id ? { ...i, published: !i.published } : i)) });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      refresh();
    },
    onSettled: refresh,
  });

  const reorder = useMutation({
    mutationFn: (items: Item[]) => post(`/api/admin/collections/${type}/reorder`, { ids: items.map((i) => i.id) }),
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, { items });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/admin/collections/${type}/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Deleted');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!config) return <ErrorState error={new Error('There is no such collection.')} />;

  return (
    <>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => { setErrors({}); setEditing({ id: '', published: true, order: 0, ...config.empty() }); }}>Add {config.singular}</Button>}
      />
      <Notice tone="info" className="mb-4">Changes here go live on the homepage as soon as you save them. Use the eye button to hide an item without deleting it.</Notice>
      <Card>
        {list.isLoading ? (
          <PageLoader />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          <EmptyState title={`No ${config.title.toLowerCase()} yet`} action={<Button variant="subtle" icon={<Plus />} onClick={() => setEditing({ id: '', published: true, order: 0, ...config.empty() })}>Add the first one</Button>} />
        ) : (
          <SortableList
            items={list.data.items}
            getId={(item) => item.id}
            onReorder={(next) => reorder.mutate(next)}
            className="divide-y divide-zinc-100"
            renderItem={(item, handle) => {
              const summary = config.summary(item);
              return (
                <div className={cn('flex items-center gap-2 bg-white px-3 py-3', !item.published && 'bg-zinc-50/70')}>
                  {handle}
                  {summary.thumb && <img src={summary.thumb} alt="" className="h-8 w-14 rounded object-contain" />}
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setErrors({}); setEditing(item); }}>
                    <p className={cn('truncate text-sm', !item.published && 'text-zinc-500')}>{summary.primary}</p>
                    {summary.secondary && <p className="truncate text-xs text-zinc-500">{summary.secondary}</p>}
                  </button>
                  {!item.published && <Badge>Hidden</Badge>}
                  <IconButton label={item.published ? 'Hide from the site' : 'Show on the site'} onClick={() => toggle.mutate(item)}>{item.published ? <Eye /> : <EyeOff />}</IconButton>
                  <IconButton label="Edit" onClick={() => { setErrors({}); setEditing(item); }}><Pencil /></IconButton>
                  <IconButton
                    label="Delete"
                    className="hover:text-red-600"
                    onClick={async () => {
                      if (await confirm({ title: `Delete this ${config.singular}?`, message: 'It is removed from the site and cannot be recovered. To take it off the site temporarily, hide it instead.' })) remove.mutate(item.id);
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              );
            }}
          />
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size={config.wide ? 'lg' : 'md'}
        title={editing?.id ? `Edit ${config.singular}` : `New ${config.singular}`}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => editing && save.mutate(editing)}>Save</Button>
          </>
        }
      >
        {editing && <config.Form value={editing} onChange={setEditing} errors={errors} />}
      </Modal>
    </>
  );
}
