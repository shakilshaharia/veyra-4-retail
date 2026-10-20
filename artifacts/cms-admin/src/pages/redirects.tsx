import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal, useConfirm } from '@/components/dialog';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, PageHeader, PageLoader, SelectField, Switch, TextField } from '@/components/ui';
import { del, errorMessage, fieldErrors, get, patch, post } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { RedirectRow } from '@/lib/types';

type Draft = { id?: string; fromPath: string; toPath: string; statusCode: 301 | 302; enabled: boolean };

export function RedirectsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = useQuery({ queryKey: ['redirects'], queryFn: ({ signal }) => get<{ items: RedirectRow[] }>('/api/admin/redirects', signal) });

  const save = useMutation({
    mutationFn: ({ id, ...body }: Draft) => (id ? patch(`/api/admin/redirects/${id}`, body) : post('/api/admin/redirects', body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirects'] });
      toast.success('Redirect saved. It works immediately.');
      setEditing(null);
      setErrors({});
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      toast.error(errorMessage(error));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/admin/redirects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirects'] });
      toast.success('Redirect removed');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title="Redirects"
        description="Send visitors and search engines from an old address to a new one. Renaming a published page or post adds one here automatically."
        actions={<Button variant="primary" icon={<Plus />} onClick={() => { setErrors({}); setEditing({ fromPath: '', toPath: '', statusCode: 301, enabled: true }); }}>Add redirect</Button>}
      />
      <Card>
        {list.isLoading ? (
          <PageLoader />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Repeat />} title="No redirects" description="Add one when you move or remove a page that people may have bookmarked." />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {list.data.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex min-w-0 flex-1 basis-72 items-center gap-2 font-mono text-[13px]">
                  <span className="truncate">{r.fromPath}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-zinc-400" aria-label="to" />
                  <span className="truncate text-brand-700">{r.toPath}</span>
                </div>
                <Badge tone={r.statusCode === 301 ? 'blue' : 'violet'}>{r.statusCode === 301 ? 'Permanent' : 'Temporary'}</Badge>
                {!r.enabled && <Badge>Off</Badge>}
                <span className="w-32 text-right text-xs text-zinc-500 tabular-nums">{r.hits} hit{r.hits === 1 ? '' : 's'}{r.lastHitAt ? ` · ${timeAgo(r.lastHitAt)}` : ''}</span>
                <IconButton label="Edit redirect" onClick={() => { setErrors({}); setEditing({ id: r.id, fromPath: r.fromPath, toPath: r.toPath, statusCode: r.statusCode, enabled: r.enabled }); }}><Pencil /></IconButton>
                <IconButton label="Delete redirect" className="hover:text-red-600" onClick={async () => { if (await confirm({ title: 'Remove this redirect?', message: `${r.fromPath} will show the “not found” page again.` })) remove.mutate(r.id); }}><Trash2 /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing?.id ? 'Edit redirect' : 'New redirect'}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => editing && save.mutate(editing)}>Save</Button></>}
      >
        {editing && (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(editing); }}>
            <TextField label="Old address" value={editing.fromPath} onChange={(fromPath) => setEditing({ ...editing, fromPath })} placeholder="/old-page" required autoFocus error={errors.fromPath} />
            <TextField label="Send visitors to" value={editing.toPath} onChange={(toPath) => setEditing({ ...editing, toPath })} placeholder="/new-page or https://…" required error={errors.toPath} />
            <SelectField label="Type" value={String(editing.statusCode)} onChange={(v) => setEditing({ ...editing, statusCode: Number(v) as 301 | 302 })} options={[{ value: '301', label: 'Permanent (301) — the page has moved for good' }, { value: '302', label: 'Temporary (302) — it will come back' }]} />
            <Switch checked={editing.enabled} onChange={(enabled) => setEditing({ ...editing, enabled })} label="Active" />
          </form>
        )}
      </Modal>
    </>
  );
}
