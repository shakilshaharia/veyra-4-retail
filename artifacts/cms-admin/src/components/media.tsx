import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Film, ImageIcon, Search, Upload, X } from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, errorMessage, get, qs } from '@/lib/api';
import { cn, formatBytes } from '@/lib/format';
import type { MediaItem, Paged } from '@/lib/types';
import { Modal } from './dialog';
import { Button, EmptyState, Field, Input, PageLoader, Select, Tabs } from './ui';

export type MediaKind = 'image' | 'video' | 'document';

export const ACCEPT: Record<MediaKind | 'any', string> = {
  image: 'image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml',
  video: 'video/mp4,video/webm',
  document: '.pdf,.docx,.xlsx,.pptx,.txt,.csv',
  any: 'image/*,video/mp4,video/webm,.pdf,.docx,.xlsx,.pptx,.txt,.csv',
};

export function useUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      files.forEach((file) => form.append('files', file));
      return api<{ items: MediaItem[]; failed: { filename: string; message: string }[] }>('/api/admin/media', { method: 'POST', body: form });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['media'] });
      if (result.items.length) toast.success(`Uploaded ${result.items.length} file${result.items.length === 1 ? '' : 's'}`);
      result.failed.forEach((failure) => toast.error(failure.message));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function Thumb({ item, className }: { item: Pick<MediaItem, 'kind' | 'url' | 'mimeType' | 'alt' | 'filename'>; className?: string }) {
  if (item.kind === 'image') {
    return <img src={item.url} alt={item.alt || ''} loading="lazy" className={cn('size-full object-cover', item.mimeType === 'image/svg+xml' && 'object-contain p-3', className)} />;
  }
  if (item.kind === 'video') {
    return (
      <div className={cn('relative size-full bg-zinc-900', className)}>
        <video src={item.url} muted preload="metadata" className="size-full object-cover opacity-90" />
        <Film className="absolute right-2 bottom-2 size-4 text-white drop-shadow" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className={cn('flex size-full flex-col items-center justify-center gap-1.5 bg-zinc-50 p-2 text-zinc-500', className)}>
      <FileText className="size-7" aria-hidden="true" />
      <span className="max-w-full truncate text-[11px] font-medium uppercase">{item.filename.split('.').pop()}</span>
    </div>
  );
}

// Drop files anywhere on it, or click to pick.
export function Dropzone({ accept = ACCEPT.any, onFiles, busy, compact, children }: { accept?: string; onFiles: (files: File[]) => void; busy?: boolean; compact?: boolean; children?: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const files = [...event.dataTransfer.files];
    if (files.length) onFiles(files);
  };
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors',
        compact ? 'gap-1 px-4 py-5' : 'gap-2 px-6 py-10',
        over ? 'border-brand-500 bg-brand-50' : 'border-zinc-300 bg-zinc-50/50',
      )}
    >
      <Upload className={cn('text-zinc-400', compact ? 'size-5' : 'size-7')} aria-hidden="true" />
      <p className="text-sm text-zinc-600">
        {busy ? 'Uploading…' : 'Drag files here, or'}{' '}
        {!busy && (
          <button type="button" className="font-medium text-brand-600 underline-offset-2 hover:underline" onClick={() => input.current?.click()}>
            browse
          </button>
        )}
      </p>
      {children}
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length) onFiles(files);
          event.target.value = '';
        }}
      />
    </div>
  );
}

export function MediaPicker({ open, onClose, onSelect, kind, title = 'Choose a file' }: { open: boolean; onClose: () => void; onSelect: (item: MediaItem) => void; kind?: MediaKind; title?: string }) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<MediaKind | ''>(kind ?? '');
  const upload = useUpload();
  const list = useQuery({
    queryKey: ['media', 'picker', q, filter],
    queryFn: ({ signal }) => get<Paged<MediaItem>>(`/api/admin/media${qs({ q, kind: filter, pageSize: 120 })}`, signal),
    enabled: open,
  });

  const choose = (item: MediaItem) => {
    onSelect(item);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'library', label: 'Media library' },
          { value: 'upload', label: 'Upload new' },
        ]}
        className="-mt-2 mb-4"
      />
      {tab === 'upload' ? (
        <Dropzone
          accept={kind ? ACCEPT[kind] : ACCEPT.any}
          busy={upload.isPending}
          onFiles={(files) =>
            upload.mutate(files, {
              onSuccess: (result) => {
                if (result.items.length === 1) choose(result.items[0]);
                else if (result.items.length > 1) setTab('library');
              },
            })
          }
        >
          <p className="text-xs text-zinc-500">One file is selected straight away; several are added to the library.</p>
        </Dropzone>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <Input placeholder="Search by name or alt text" value={q} onChange={(event) => setQ(event.target.value)} className="pl-9" aria-label="Search media" />
            </div>
            {!kind && (
              <Select value={filter} onChange={(event) => setFilter(event.target.value as MediaKind | '')} className="w-40" aria-label="File type">
                <option value="">All types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="document">Documents</option>
              </Select>
            )}
          </div>
          {list.isLoading ? (
            <PageLoader />
          ) : !list.data?.items.length ? (
            <EmptyState icon={<ImageIcon />} title="Nothing here yet" description="Upload a file to get started." action={<Button variant="subtle" onClick={() => setTab('upload')}>Upload</Button>} />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {list.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => choose(item)}
                    className="group block w-full overflow-hidden rounded-lg text-left ring-1 ring-zinc-200 hover:ring-2 hover:ring-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <div className="aspect-square bg-zinc-100">
                      <Thumb item={item} />
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="truncate text-xs font-medium text-ink">{item.title || item.filename}</p>
                      <p className="text-[11px] text-zinc-500">
                        {item.width && item.height ? `${item.width}×${item.height} · ` : ''}
                        {formatBytes(item.sizeBytes)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

// An image slot: preview, choose from the library, or paste a path.
export function ImageField({
  label,
  value,
  onChange,
  alt,
  onAltChange,
  hint,
  error,
  kind = 'image',
}: {
  label: ReactNode;
  value: string;
  onChange: (url: string) => void;
  alt?: string;
  onAltChange?: (alt: string) => void;
  hint?: ReactNode;
  error?: string;
  kind?: MediaKind;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <Field label={label} hint={hint} error={error}>
      {(wiring) => (
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200">
              {value ? (
                kind === 'video' ? <video src={value} muted preload="metadata" className="size-full object-cover" /> : <img src={value} alt="" className="size-full object-cover" />
              ) : kind === 'video' ? (
                <Film className="size-6 text-zinc-400" aria-hidden="true" />
              ) : (
                <ImageIcon className="size-6 text-zinc-400" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setPicking(true)}>
                  {value ? 'Replace' : 'Choose'}
                </Button>
                {value && (
                  <Button size="sm" variant="ghost" icon={<X />} onClick={() => onChange('')}>
                    Remove
                  </Button>
                )}
              </div>
              <Input {...wiring} value={value} onChange={(event) => onChange(event.target.value)} placeholder="/path/to/file or https://…" className="h-8 font-mono text-xs" aria-label={typeof label === 'string' ? `${label} URL` : 'File URL'} />
            </div>
          </div>
          {onAltChange && (
            <Input value={alt ?? ''} onChange={(event) => onAltChange(event.target.value)} placeholder="Alt text: describe the image for people who cannot see it" className="h-9 text-[13px]" aria-label="Alt text" />
          )}
          <MediaPicker
            open={picking}
            onClose={() => setPicking(false)}
            kind={kind}
            onSelect={(item) => {
              onChange(item.url);
              if (onAltChange && !alt && item.alt) onAltChange(item.alt);
            }}
          />
        </div>
      )}
    </Field>
  );
}

export function VideoField({ value, onChange, label = 'Video' }: { value: { mp4: string; webm: string; poster: string }; onChange: (next: { mp4: string; webm: string; poster: string }) => void; label?: string }) {
  return (
    <fieldset className="space-y-4 rounded-lg bg-zinc-50/70 p-4 ring-1 ring-zinc-200">
      <legend className="sr-only">{label}</legend>
      <p className="text-[13px] font-medium text-zinc-800">{label}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageField label="MP4 (all browsers)" kind="video" value={value.mp4} onChange={(mp4) => onChange({ ...value, mp4 })} />
        <ImageField label="WebM (smaller, optional)" kind="video" value={value.webm} onChange={(webm) => onChange({ ...value, webm })} />
      </div>
      <ImageField label="Poster image" hint="Shown before the video plays, and instead of it when motion is reduced." value={value.poster} onChange={(poster) => onChange({ ...value, poster })} />
    </fieldset>
  );
}
