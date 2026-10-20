import { useMutation, useQueryClient } from '@tanstack/react-query';
import { slugify } from '@workspace/cms-content';
import { FolderTree, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal, useConfirm } from '@/components/dialog';
import { Button, Card, CardHeader, EmptyState, IconButton, PageHeader, TextAreaField, TextField } from '@/components/ui';
import { del, errorMessage, fieldErrors, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pluralize } from '@/lib/format';
import type { Term } from '@/lib/types';
import { useTerms } from './posts';

type Editing = { kind: 'category' | 'tag'; term: Partial<Term> } | null;

export function TaxonomyPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { categories, tags } = useTerms();
  const [editing, setEditing] = useState<Editing>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const manage = can('categories.manage');

  const save = useMutation({
    mutationFn: ({ kind, term }: NonNullable<Editing>) => {
      const base = kind === 'category' ? '/api/admin/categories' : '/api/admin/tags';
      const body = { name: term.name, slug: term.slug || undefined, ...(kind === 'category' ? { description: term.description ?? '' } : {}) };
      return term.id ? patch(`${base}/${term.id}`, body) : post(base, body);
    },
    onSuccess: (_, { kind }) => {
      queryClient.invalidateQueries({ queryKey: [kind === 'category' ? 'categories' : 'tags'] });
      toast.success(`${kind === 'category' ? 'Category' : 'Tag'} saved`);
      setEditing(null);
      setErrors({});
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      toast.error(errorMessage(error));
    },
  });

  const remove = useMutation({
    mutationFn: ({ kind, id }: { kind: 'category' | 'tag'; id: string }) => del(`/api/admin/${kind === 'category' ? 'categories' : 'tags'}/${id}`),
    onSuccess: (_, { kind }) => {
      queryClient.invalidateQueries({ queryKey: [kind === 'category' ? 'categories' : 'tags'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Deleted');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const askDelete = async (kind: 'category' | 'tag', term: Term) => {
    const ok = await confirm({
      title: `Delete “${term.name}”?`,
      message: term.postCount ? `It is used on ${pluralize(term.postCount, 'post')}. The posts stay; they just lose this ${kind}.` : `No posts use this ${kind}.`,
    });
    if (ok) remove.mutate({ kind, id: term.id });
  };

  const list = (kind: 'category' | 'tag', items: Term[]) =>
    items.length ? (
      <ul className="divide-y divide-zinc-100">
        {items.map((term) => (
          <li key={term.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{term.name}</p>
              <p className="truncate text-xs text-zinc-500"><span className="font-mono">{term.slug}</span> · {pluralize(term.postCount ?? 0, 'post')}{term.description ? ` · ${term.description}` : ''}</p>
            </div>
            {manage && (
              <>
                <IconButton label={`Edit ${term.name}`} onClick={() => { setErrors({}); setEditing({ kind, term }); }}><Pencil /></IconButton>
                <IconButton label={`Delete ${term.name}`} className="hover:text-red-600" onClick={() => askDelete(kind, term)}><Trash2 /></IconButton>
              </>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <EmptyState icon={kind === 'category' ? <FolderTree /> : <Tag />} title={`No ${kind === 'category' ? 'categories' : 'tags'} yet`} />
    );

  return (
    <>
      <PageHeader title="Categories & tags" description="Categories group Resources posts into sections readers can browse; tags are finer-grained topics." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Categories" actions={manage && <Button size="sm" icon={<Plus />} onClick={() => { setErrors({}); setEditing({ kind: 'category', term: { name: '', slug: '', description: '' } }); }}>Add category</Button>} />
          {list('category', categories)}
        </Card>
        <Card>
          <CardHeader title="Tags" description={!manage ? 'Add tags while editing a post.' : undefined} actions={manage && <Button size="sm" icon={<Plus />} onClick={() => { setErrors({}); setEditing({ kind: 'tag', term: { name: '', slug: '' } }); }}>Add tag</Button>} />
          {list('tag', tags)}
        </Card>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing?.term.id ? `Edit ${editing.kind}` : `New ${editing?.kind ?? ''}`}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} disabled={!editing?.term.name?.trim()} onClick={() => editing && save.mutate(editing)}>Save</Button>
          </>
        }
      >
        {editing && (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(editing); }}>
            <TextField label="Name" autoFocus value={editing.term.name ?? ''} onChange={(name) => setEditing({ ...editing, term: { ...editing.term, name } })} error={errors.name} required />
            <TextField label="Slug" value={editing.term.slug ?? ''} placeholder={slugify(editing.term.name ?? '')} onChange={(slug) => setEditing({ ...editing, term: { ...editing.term, slug } })} hint="Used in addresses. Leave empty to generate it from the name." error={errors.slug} />
            {editing.kind === 'category' && (
              <TextAreaField label="Description" rows={2} value={editing.term.description ?? ''} onChange={(description) => setEditing({ ...editing, term: { ...editing.term, description } })} error={errors.description} />
            )}
          </form>
        )}
      </Modal>
    </>
  );
}
