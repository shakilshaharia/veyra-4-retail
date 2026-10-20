import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { menuLocationLabels, type MenuLocation } from '@workspace/cms-content';
import { ChevronRight, CornerDownRight, ExternalLink, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/dialog';
import { SortableList } from '@/components/sortable';
import { Badge, Button, Card, CardHeader, Checkbox, ErrorState, IconButton, Notice, PageHeader, PageLoader, Switch, Tabs, TextField } from '@/components/ui';
import { errorMessage, fieldErrors, get, put } from '@/lib/api';
import { cn, newId } from '@/lib/format';
import { useUnsavedChanges } from '@/lib/hooks';
import type { MenuData, MenuItemNode } from '@/lib/types';

type Node = Omit<MenuItemNode, 'children'> & { key: string; children: Node[] };

const withKeys = (items: MenuItemNode[]): Node[] => items.map((item) => ({ ...item, key: item.id ?? newId('item'), children: withKeys(item.children ?? []) }));
const stripKeys = (items: Node[]): MenuItemNode[] => items.map(({ key: _k, id: _id, children, ...rest }) => ({ ...rest, children: stripKeys(children) }));
// Only the fields an editor can change, in a fixed order, for change detection.
const canon = (items: MenuItemNode[]): unknown[] => items.map((item) => [item.label, item.url, item.newTab, item.enabled, canon(item.children ?? [])]);

const hints: Record<MenuLocation, string> = {
  'home-header': 'Top of the homepage. Links starting with # jump to a section on the same page.',
  'home-footer': 'Bottom of the homepage.',
  'page-header': 'Top of every other page, such as Contact and Resources.',
  'page-footer': 'Bottom of every other page.',
};

function ItemRow({ item, onChange, onRemove, onAddChild, handle, depth, errors }: {
  item: Node;
  onChange: (next: Node) => void;
  onRemove: () => void;
  onAddChild?: () => void;
  handle: React.ReactNode;
  depth: number;
  errors: Record<string, string>;
}) {
  const [open, setOpen] = useState(!item.label);
  const external = /^https?:\/\//i.test(item.url);
  return (
    <div className={cn('bg-white', !item.enabled && 'bg-zinc-50')}>
      <div className="flex items-center gap-1.5 px-2 py-2">
        {depth > 0 && <CornerDownRight className="ml-1 size-4 shrink-0 text-zinc-300" aria-hidden="true" />}
        {handle}
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronRight className={cn('size-4 shrink-0 text-zinc-400 transition-transform', open && 'rotate-90')} aria-hidden="true" />
          <span className="min-w-0">
            <span className={cn('block truncate text-sm font-medium', !item.enabled && 'text-zinc-400 line-through')}>{item.label || 'New link'}</span>
            <span className="flex items-center gap-1 truncate font-mono text-[11px] text-zinc-500">{item.url || '—'}{external && <ExternalLink className="size-3" aria-label="external" />}</span>
          </span>
        </button>
        {item.children.length > 0 && <Badge>{item.children.length} in dropdown</Badge>}
        <IconButton label={item.enabled ? 'Disable link' : 'Enable link'} onClick={() => onChange({ ...item, enabled: !item.enabled })}>{item.enabled ? <Eye /> : <EyeOff />}</IconButton>
        <IconButton label="Remove link" className="hover:text-red-600" onClick={onRemove}><Trash2 /></IconButton>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-zinc-100 px-4 py-4 sm:grid-cols-2" style={{ paddingLeft: depth ? 48 : undefined }}>
          <TextField label="Label" value={item.label} onChange={(label) => onChange({ ...item, label })} error={errors.label} />
          <TextField label="Link" value={item.url} onChange={(url) => onChange({ ...item, url })} placeholder="/contact, #faq or https://…" error={errors.url} />
          <Checkbox checked={item.newTab} onChange={(newTab) => onChange({ ...item, newTab })} label="Open in a new tab" />
          {onAddChild && (
            <div className="sm:text-right">
              <Button size="sm" variant="ghost" icon={<Plus />} onClick={onAddChild}>Add dropdown item</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuEditor({ menu, onSaved }: { menu: MenuData; onSaved: (menu: MenuData) => void }) {
  const confirm = useConfirm();
  const [items, setItems] = useState<Node[]>(() => withKeys(menu.items));
  const [ctaEnabled, setCtaEnabled] = useState(menu.ctaEnabled);
  const [ctaLabel, setCtaLabel] = useState(menu.ctaLabel);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify([canon(menu.items), menu.ctaEnabled, menu.ctaLabel]) !== JSON.stringify([canon(items), ctaEnabled, ctaLabel]);
  useUnsavedChanges(dirty);

  useEffect(() => {
    setItems(withKeys(menu.items));
    setCtaEnabled(menu.ctaEnabled);
    setCtaLabel(menu.ctaLabel);
  }, [menu]);

  const save = useMutation({
    mutationFn: () => put<{ menu: MenuData }>(`/api/admin/menus/${menu.location}`, { ctaEnabled, ctaLabel, items: stripKeys(items) }),
    onSuccess: (result) => {
      toast.success('Menu saved. It is live on the site.');
      setErrors({});
      onSaved(result.menu);
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      toast.error(errorMessage(error));
    },
  });

  const errorsFor = (path: string) => Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith(path)).map(([k, v]) => [k.slice(path.length), v]));
  const blank = (): Node => ({ key: newId('item'), label: '', url: '', newTab: false, enabled: true, children: [] });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Links" description={hints[menu.location as MenuLocation]} actions={<Button size="sm" icon={<Plus />} onClick={() => setItems([...items, blank()])}>Add link</Button>} />
        {items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500">No links. Add one, or leave the menu empty to show only the button.</p>
        ) : (
          <SortableList
            items={items}
            getId={(item) => item.key}
            onReorder={setItems}
            className="divide-y divide-zinc-100"
            renderItem={(item, handle, index) => (
              <div>
                <ItemRow
                  item={item}
                  depth={0}
                  handle={handle}
                  errors={errorsFor(`items.${index}.`)}
                  onChange={(next) => setItems(items.map((it, i) => (i === index ? next : it)))}
                  onRemove={async () => {
                    if (!item.children.length || (await confirm({ title: 'Remove this link and its dropdown?', message: `Its ${item.children.length} dropdown item${item.children.length === 1 ? '' : 's'} will be removed too.`, confirmLabel: 'Remove' }))) {
                      setItems(items.filter((_, i) => i !== index));
                    }
                  }}
                  onAddChild={() => setItems(items.map((it, i) => (i === index ? { ...it, children: [...it.children, blank()] } : it)))}
                />
                {item.children.length > 0 && (
                  <SortableList
                    items={item.children}
                    getId={(child) => child.key}
                    onReorder={(children) => setItems(items.map((it, i) => (i === index ? { ...it, children } : it)))}
                    className="divide-y divide-zinc-100 border-t border-zinc-100 bg-zinc-50/50"
                    renderItem={(child, childHandle, childIndex) => (
                      <ItemRow
                        item={child}
                        depth={1}
                        handle={childHandle}
                        errors={errorsFor(`items.${index}.children.${childIndex}.`)}
                        onChange={(next) => setItems(items.map((it, i) => (i === index ? { ...it, children: it.children.map((c, ci) => (ci === childIndex ? next : c)) } : it)))}
                        onRemove={() => setItems(items.map((it, i) => (i === index ? { ...it, children: it.children.filter((_, ci) => ci !== childIndex) } : it)))}
                      />
                    )}
                  />
                )}
              </div>
            )}
          />
        )}
      </Card>
      <Card className="space-y-4 p-5">
        <Switch checked={ctaEnabled} onChange={setCtaEnabled} label="Show the demo button" description="The highlighted button beside the links. It opens the demo form, or your booking link if one is set in Settings." />
        {ctaEnabled && <TextField label="Button label" value={ctaLabel} onChange={setCtaLabel} error={errors.ctaLabel} className="max-w-xs" />}
      </Card>
      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
        <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>Save menu</Button>
      </div>
    </div>
  );
}

export function MenusPage() {
  const queryClient = useQueryClient();
  const [location, setLocation] = useState<MenuLocation>('home-header');
  const query = useQuery({ queryKey: ['menus'], queryFn: ({ signal }) => get<{ items: MenuData[] }>('/api/admin/menus', signal) });
  const menu = query.data?.items.find((m) => m.location === location);

  return (
    <>
      <PageHeader title="Menus" description="The navigation in the site’s headers and footers. Saving publishes immediately." />
      <Tabs
        value={location}
        onChange={setLocation}
        tabs={(Object.keys(menuLocationLabels) as MenuLocation[]).map((value) => ({ value, label: menuLocationLabels[value] }))}
        className="mb-5"
      />
      {query.isLoading ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : menu ? (
        <MenuEditor
          key={location}
          menu={menu}
          onSaved={(saved) => queryClient.setQueryData<{ items: MenuData[] }>(['menus'], (old) => old && { items: old.items.map((m) => (m.location === saved.location ? saved : m)) })}
        />
      ) : (
        <Notice tone="warn">This menu could not be found.</Notice>
      )}
    </>
  );
}
