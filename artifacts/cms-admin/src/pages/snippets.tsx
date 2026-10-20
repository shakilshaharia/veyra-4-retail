import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { snippetLanguages, snippetLocations, snippetScopes, type SnippetLanguage, type SnippetLocation, type SnippetScope } from '@workspace/cms-content';
import { Code2, Copy, Download, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Modal, useConfirm } from '@/components/dialog';
import { StringListEditor } from '@/components/list-editor';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Notice, PageHeader, PageLoader, SelectField, Switch, TextAreaField, TextField } from '@/components/ui';
import { del, errorMessage, fieldErrors, get, patch, post } from '@/lib/api';
import { formatDate } from '@/lib/format';

type SnippetItem = {
  id: string;
  name: string;
  description: string;
  language: SnippetLanguage;
  code: string;
  location: SnippetLocation;
  scope: SnippetScope;
  paths: string[];
  priority: number;
  active: boolean;
  tags: string[];
  updatedAt: string;
};

const langLabel: Record<SnippetLanguage, string> = { html: 'HTML', css: 'CSS', js: 'JavaScript' };
const langTone: Record<SnippetLanguage, 'blue' | 'violet' | 'amber'> = { html: 'blue', css: 'violet', js: 'amber' };
const locLabel: Record<SnippetLocation, string> = { head: 'Head', body_open: 'Body (top)', footer: 'Footer' };
const scopeLabel: Record<SnippetScope, string> = { everywhere: 'Everywhere', home: 'Homepage only', resources: 'Resources', specific: 'Specific pages' };

type SnippetDraft = Omit<SnippetItem, 'id' | 'updatedAt'> & { id?: string };
const blank: SnippetDraft = { name: '', description: '', language: 'html', code: '', location: 'head', scope: 'everywhere', paths: [], priority: 10, active: false, tags: [] };

export function SnippetsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<SnippetDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const list = useQuery({ queryKey: ['snippets'], queryFn: ({ signal }) => get<{ items: SnippetItem[] }>('/api/admin/snippets', signal) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['snippets'] });

  const saveMut = useMutation({
    mutationFn: (s: SnippetDraft) => {
      const body = { name: s.name, description: s.description, language: s.language, code: s.code, location: s.location, scope: s.scope, paths: s.paths, priority: s.priority, active: s.active, tags: s.tags };
      return s.id ? patch(`/api/admin/snippets/${s.id}`, body) : post('/api/admin/snippets', body);
    },
    onSuccess: () => { toast.success('Snippet saved.'); setEditing(null); setErrors({}); invalidate(); },
    onError: (e) => { setErrors(fieldErrors(e)); toast.error(errorMessage(e)); },
  });
  const toggle = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => patch(`/api/admin/snippets/${id}`, { active }), onSuccess: invalidate, onError: (e) => toast.error(errorMessage(e)) });
  const duplicate = useMutation({ mutationFn: (id: string) => post(`/api/admin/snippets/${id}/duplicate`, {}), onSuccess: () => { toast.success('Duplicated.'); invalidate(); } });
  const remove = useMutation({ mutationFn: (id: string) => del(`/api/admin/snippets/${id}`), onSuccess: () => { toast.success('Deleted.'); invalidate(); } });
  const importMut = useMutation({
    mutationFn: (snippets: unknown[]) => post('/api/admin/snippets/import', { snippets }),
    onSuccess: (r: { created: number }) => { toast.success(`Imported ${r.created} snippet${r.created === 1 ? '' : 's'} (left inactive).`); invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onImportFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const snippets = Array.isArray(data) ? data : data.snippets;
      if (!Array.isArray(snippets)) throw new Error('No snippets array found.');
      importMut.mutate(snippets);
    } catch (e) {
      toast.error(`Could not read that file: ${e instanceof Error ? e.message : 'invalid JSON'}`);
    }
  };

  if (list.isLoading) return <PageLoader />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const all = list.data?.items ?? [];
  const items = query ? all.filter((s) => [s.name, s.description, s.language, ...s.tags].join(' ').toLowerCase().includes(query.toLowerCase())) : all;

  return (
    <>
      <PageHeader
        title="Code Snippets"
        description="Custom HTML, CSS or JavaScript added to the public site without touching the code."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ''; }} />
            <Button variant="ghost" size="sm" icon={<Upload />} onClick={() => fileInput.current?.click()} loading={importMut.isPending}>Import</Button>
            <a href="/api/admin/snippets/export" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100"><Download className="size-4" /> Export</a>
            <Button variant="primary" icon={<Plus />} onClick={() => { setErrors({}); setEditing({ ...blank }); }}>New snippet</Button>
          </div>
        }
      />
      <Notice tone="warn">Snippets run real code on your public site. Only add code you trust; a broken JavaScript snippet can affect how pages work.</Notice>
      <Card className="mt-4">
        {all.length > 0 && (
          <div className="border-b border-zinc-100 p-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search snippets" className="max-w-sm" aria-label="Search snippets" />
          </div>
        )}
        {items.length === 0 ? (
          <EmptyState icon={<Code2 />} title={all.length ? 'No snippets match' : 'No snippets yet'} description={all.length ? 'Try a different search.' : 'Add a snippet to inject custom HTML, CSS or JavaScript into the site.'} action={!all.length && <Button variant="subtle" icon={<Plus />} onClick={() => setEditing({ ...blank })}>New snippet</Button>} />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <Switch checked={s.active} onChange={(active) => toggle.mutate({ id: s.id, active })} label="" />
                <button type="button" className="min-w-0 flex-1 basis-60 text-left" onClick={() => { setErrors({}); setEditing({ ...s }); }}>
                  <p className="truncate text-sm font-medium">{s.name || 'Untitled snippet'}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                    {!s.active && <span className="text-amber-600">Inactive</span>}
                    {s.description && <span className="truncate">{s.description}</span>}
                  </p>
                </button>
                <Badge tone={langTone[s.language]}>{langLabel[s.language]}</Badge>
                <Badge tone="neutral">{locLabel[s.location]}</Badge>
                <Badge tone="neutral">{scopeLabel[s.scope]}</Badge>
                <span className="w-20 text-right text-xs text-zinc-500">{formatDate(s.updatedAt)}</span>
                <Button size="sm" variant="ghost" icon={<Copy />} aria-label="Duplicate" onClick={() => duplicate.mutate(s.id)} />
                <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 />} aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete “${s.name}”?`, message: 'This removes the snippet from the site permanently.' })) remove.mutate(s.id); }} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <SnippetEditor
          value={editing}
          errors={errors}
          saving={saveMut.isPending}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => saveMut.mutate(editing)}
        />
      )}
    </>
  );
}

function SnippetEditor({ value, errors, saving, onChange, onClose, onSave }: {
  value: SnippetDraft;
  errors: Record<string, string>;
  saving: boolean;
  onChange: (v: SnippetDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof typeof value>(key: K, v: (typeof value)[K]) => onChange({ ...value, [key]: v });
  const placeholder = value.language === 'css' ? '.my-banner { background: #231fcd; }' : value.language === 'js' ? "console.log('hello from a snippet');" : '<!-- raw HTML, e.g. a verification tag or a widget -->';
  return (
    <Modal open onClose={onClose} title={value.id ? 'Edit snippet' : 'New snippet'} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={onSave}>Save snippet</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={value.name} onChange={(v) => set('name', v)} required error={errors.name} />
          <SelectField label="Language" value={value.language} onChange={(v) => set('language', v as SnippetLanguage)} options={snippetLanguages.map((l) => ({ value: l, label: langLabel[l] }))} />
        </div>
        <TextField label="Description" value={value.description} onChange={(v) => set('description', v)} hint="Just for you — a note about what this snippet does." />
        <Field label="Code" error={errors.code} required>
          {() => <textarea value={value.code} onChange={(e) => set('code', e.target.value)} rows={10} spellCheck={false} className="w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none" placeholder={placeholder} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Location" value={value.location} onChange={(v) => set('location', v as SnippetLocation)} options={snippetLocations.map((l) => ({ value: l, label: locLabel[l] }))} />
          <SelectField label="Run on" value={value.scope} onChange={(v) => set('scope', v as SnippetScope)} options={snippetScopes.map((s) => ({ value: s, label: scopeLabel[s] }))} />
          <TextField label="Priority" type="number" value={String(value.priority)} onChange={(v) => set('priority', Number(v) || 0)} hint="Lower runs first." />
        </div>
        {value.scope === 'specific' && (
          <StringListEditor label="Paths" values={value.paths} onChange={(v) => set('paths', v)} placeholder="/contact or /resources/*" addLabel="Add path" hint="Exact paths, or end with /* to match a section." />
        )}
        <StringListEditor label="Tags" values={value.tags} onChange={(v) => set('tags', v)} placeholder="analytics" addLabel="Add tag" />
        <Switch checked={value.active} onChange={(v) => set('active', v)} label="Active" description="Off keeps the snippet saved but out of the live site." />
      </div>
    </Modal>
  );
}
