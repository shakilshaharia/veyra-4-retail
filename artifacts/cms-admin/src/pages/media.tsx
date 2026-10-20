import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, ImageIcon, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { Modal, useConfirm } from '@/components/dialog';
import { ACCEPT, Dropzone, Thumb, useUpload } from '@/components/media';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Notice, PageHeader, PageLoader, Pagination, Select, TextAreaField, TextField } from '@/components/ui';
import { api, errorMessage, get, patch, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatBytes, formatDateTime } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { MediaItem, MediaUsage, Paged } from '@/lib/types';

function CopyButton({ text, label = 'Copy URL' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      icon={copied ? <Check /> : <Copy />}
      onClick={async () => {
        const absolute = text.startsWith('http') ? text : `${window.location.origin}${text}`;
        try {
          await navigator.clipboard.writeText(absolute);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Could not copy. Select the address and copy it manually.');
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can, user } = useAuth();
  const replaceInput = useRef<HTMLInputElement>(null);
  const query = useQuery({ queryKey: ['media', 'item', id], queryFn: ({ signal }) => get<{ item: MediaItem; usage: MediaUsage[] }>(`/api/admin/media/${id}`, signal) });
  const [meta, setMeta] = useState<Pick<MediaItem, 'title' | 'alt' | 'caption' | 'description'> | null>(null);
  const item = query.data?.item;
  const usage = query.data?.usage ?? [];
  const current = meta ?? (item ? { title: item.title, alt: item.alt, caption: item.caption, description: item.description } : null);
  const canManage = can('media.manageAll') || item?.uploadedBy === user?.name;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['media'] });
  };
  const save = useMutation({
    mutationFn: () => patch(`/api/admin/media/${id}`, current),
    onSuccess: () => {
      toast.success('Details saved');
      setMeta(null);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const replace = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<{ item: MediaItem; referencesUpdated: number }>(`/api/admin/media/${id}/replace`, { method: 'POST', body: form });
    },
    onSuccess: (result) => {
      toast.success(`File replaced${result.referencesUpdated ? `; ${result.referencesUpdated} reference${result.referencesUpdated === 1 ? '' : 's'} updated` : ''}`);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/admin/media/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('File deleted');
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal open onClose={onClose} side title={item?.title || item?.filename || 'File'} description={item ? `${item.mimeType} · ${formatBytes(item.sizeBytes)}` : undefined}>
      {query.isLoading ? (
        <PageLoader />
      ) : query.isError || !item || !current ? (
        <ErrorState error={query.error} />
      ) : (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200">
            {item.kind === 'image' ? (
              <img src={item.url} alt={item.alt} className="mx-auto max-h-80 object-contain" />
            ) : item.kind === 'video' ? (
              <video src={item.url} controls preload="metadata" className="max-h-80 w-full bg-black" />
            ) : (
              <div className="aspect-[3/1]"><Thumb item={item} /></div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-zinc-500">File name</dt><dd className="truncate text-right">{item.filename}</dd>
            {item.width && item.height && (<><dt className="text-zinc-500">Dimensions</dt><dd className="text-right tabular-nums">{item.width} × {item.height}</dd></>)}
            <dt className="text-zinc-500">Size</dt><dd className="text-right tabular-nums">{formatBytes(item.sizeBytes)}</dd>
            <dt className="text-zinc-500">Uploaded</dt><dd className="text-right">{formatDateTime(item.createdAt)}{item.uploadedBy ? ` · ${item.uploadedBy}` : ''}</dd>
            {item.builtIn && (<><dt className="text-zinc-500">Source</dt><dd className="text-right">Ships with the site</dd></>)}
          </dl>

          <div className="space-y-2">
            <p className="text-[13px] font-medium text-zinc-800">Address</p>
            <div className="flex gap-2">
              <Input value={item.url} readOnly className="h-8 font-mono text-xs" aria-label="File address" onFocus={(event) => event.target.select()} />
              <CopyButton text={item.url} />
            </div>
            {item.variants.length > 0 && (
              <details className="text-xs text-zinc-600">
                <summary className="cursor-pointer select-none">{item.variants.length} responsive sizes (WebP)</summary>
                <ul className="mt-2 space-y-1">
                  {item.variants.map((variant) => (
                    <li key={variant.width} className="flex items-center justify-between gap-2">
                      <span className="tabular-nums">{variant.width}px · {formatBytes(variant.sizeBytes)}</span>
                      <a href={variant.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Open</a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
            {item.kind === 'image' && (
              <TextAreaField label="Alt text" value={current.alt} onChange={(alt) => setMeta({ ...current, alt })} rows={2} disabled={!canManage} hint="Describe the image for people using screen readers. Used when this image is inserted." />
            )}
            <TextField label="Title" value={current.title} onChange={(title) => setMeta({ ...current, title })} disabled={!canManage} />
            <TextField label="Caption" value={current.caption} onChange={(caption) => setMeta({ ...current, caption })} disabled={!canManage} />
            <TextAreaField label="Description" value={current.description} onChange={(description) => setMeta({ ...current, description })} rows={2} disabled={!canManage} />
            {canManage && <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!meta}>Save details</Button>}
          </form>

          <div className="space-y-2">
            <p className="text-[13px] font-medium text-zinc-800">Used in</p>
            {usage.length ? (
              <ul className="space-y-1">
                {usage.map((use) => (
                  <li key={`${use.type}-${use.id}`}>
                    <Link href={use.href} onClick={onClose} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-[13px] hover:bg-brand-50">
                      <span className="truncate"><span className="text-zinc-500">{use.type}:</span> {use.label}</span>
                      <ExternalLink className="size-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-zinc-500">Not used anywhere, so it can be deleted safely.</p>
            )}
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
              <Button icon={<RefreshCw />} loading={replace.isPending} onClick={() => replaceInput.current?.click()}>Replace file</Button>
              <input ref={replaceInput} type="file" className="sr-only" tabIndex={-1} accept={ACCEPT[item.kind]} onChange={(event) => { const file = event.target.files?.[0]; if (file) replace.mutate(file); event.target.value = ''; }} />
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                icon={<Trash2 />}
                disabled={usage.length > 0}
                title={usage.length ? 'Remove it from the places above first' : undefined}
                onClick={async () => { if (await confirm({ title: 'Delete this file?', message: 'It is removed from the media library and storage permanently.' })) remove.mutate(); }}
              >
                Delete
              </Button>
              {usage.length > 0 && <p className="w-full text-xs text-zinc-500">Replacing swaps the file everywhere it is used. Deleting is disabled while it is in use.</p>}
            </div>
          )}
          {item.builtIn && <Notice tone="info">This file ships with the site. Replacing it uploads your file and points everything at it; the original stays in the site build.</Notice>}
        </div>
      )}
    </Modal>
  );
}

export function MediaPage() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const search = useDebounced(q);
  const upload = useUpload();
  const list = useQuery({
    queryKey: ['media', 'library', search, kind, page],
    queryFn: ({ signal }) => get<Paged<MediaItem>>(`/api/admin/media${qs({ q: search, kind, page, pageSize: 48 })}`, signal),
    placeholderData: (previous) => previous,
  });

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (files.length) upload.mutate(files);
  };

  return (
    <div
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={onDrop}
      className="relative"
    >
      <PageHeader title="Media library" description="Images, videos and documents used across the site. Drop files anywhere on this page to upload." />
      <div className="mb-5">
        <Dropzone onFiles={(files) => upload.mutate(files)} busy={upload.isPending} compact>
          <p className="text-xs text-zinc-500">JPG, PNG, WebP, AVIF, GIF, SVG, MP4, WebM, PDF, Office documents · photos are optimised and resized automatically</p>
        </Dropzone>
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-zinc-100 p-4">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Search by name, title or alt text" className="pl-9" aria-label="Search media" />
          </div>
          <Select value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }} className="w-40" aria-label="File type">
            <option value="">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="document">Documents</option>
          </Select>
        </div>
        {list.isLoading ? (
          <PageLoader />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<ImageIcon />} title={search || kind ? 'No files match' : 'The library is empty'} />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {list.data.items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => setSelected(item.id)} className="group block w-full overflow-hidden rounded-xl text-left ring-1 ring-zinc-200 transition-shadow hover:shadow-md hover:ring-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500">
                    <div className="relative aspect-square bg-zinc-100">
                      <Thumb item={item} />
                      {item.kind === 'image' && !item.alt && <Badge tone="amber" className="absolute top-2 left-2">No alt text</Badge>}
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="truncate text-xs font-medium">{item.title || item.filename}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">
                        {item.width && item.height ? `${item.width}×${item.height} · ` : ''}{formatBytes(item.sizeBytes)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} />
          </>
        )}
      </Card>
      {dragging && (
        <div className={cn('pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-600/10 backdrop-blur-[1px] lg:left-64')}>
          <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 text-sm font-medium shadow-xl ring-2 ring-brand-500">
            <Upload className="size-5 text-brand-600" aria-hidden="true" /> Drop to upload
          </div>
        </div>
      )}
      {selected && <Detail id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
