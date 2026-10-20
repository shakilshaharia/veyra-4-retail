import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Inbox, Mail, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { toast } from 'sonner';
import { useConfirm } from '@/components/dialog';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Notice, PageHeader, PageLoader, Pagination, Select, SelectField, Tabs, TextAreaField, buttonClass } from '@/components/ui';
import { del, errorMessage, get, patch, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { Paged, Submission } from '@/lib/types';

const statusLabels: Record<Submission['status'], string> = { NEW: 'New', CONTACTED: 'Contacted', COMPLETED: 'Completed', SPAM: 'Spam' };
const statusTone: Record<Submission['status'], 'blue' | 'amber' | 'green' | 'neutral'> = { NEW: 'blue', CONTACTED: 'amber', COMPLETED: 'green', SPAM: 'neutral' };
const fieldLabels: Record<string, string> = { interest: 'Interested in', inquiryType: 'Inquiry type', solution: 'Solution of interest', message: 'Message' };

export function SubmissionsPage() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<'' | Submission['status']>('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const list = useQuery({
    queryKey: ['submissions', { status, type, search, page }],
    queryFn: ({ signal }) => get<Paged<Submission> & { statusCounts: Record<string, number> }>(`/api/admin/submissions${qs({ status, type, q: search, page })}`, signal),
    placeholderData: (previous) => previous,
  });
  const counts = list.data?.statusCounts ?? {};
  const exportHref = `/api/admin/submissions/export.csv${qs({ status, type, q: search })}`;

  return (
    <>
      <PageHeader
        title="Form submissions"
        description="Demo requests and contact messages from the website."
        actions={<a href={exportHref} className={buttonClass('secondary')} download><Download aria-hidden="true" /> Export CSV</a>}
      />
      <Card>
        <Tabs
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          className="px-4 pt-1"
          tabs={[
            { value: '' as const, label: 'Inbox' },
            { value: 'NEW' as const, label: 'New', count: counts.NEW ?? 0 },
            { value: 'CONTACTED' as const, label: 'Contacted', count: counts.CONTACTED ?? 0 },
            { value: 'COMPLETED' as const, label: 'Completed', count: counts.COMPLETED ?? 0 },
            { value: 'SPAM' as const, label: 'Spam', count: counts.SPAM ?? 0 },
          ]}
        />
        <div className="flex flex-wrap gap-2 border-b border-zinc-100 p-4">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Search name, email or company" className="pl-9" aria-label="Search submissions" />
          </div>
          <Select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="w-44" aria-label="Form">
            <option value="">Both forms</option>
            <option value="DEMO">Demo requests</option>
            <option value="CONTACT">Contact messages</option>
          </Select>
        </div>
        {list.isLoading ? (
          <PageLoader />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Inbox />} title="Nothing here" description={status === 'SPAM' ? 'No submissions have been flagged as spam.' : 'New demo requests and messages will appear here.'} />
        ) : (
          <>
            <ul className="divide-y divide-zinc-100">
              {list.data.items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => navigate(`/submissions/${item.id}`)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left hover:bg-zinc-50">
                    <div className="min-w-0 flex-1 basis-60">
                      <p className={item.status === 'NEW' ? 'text-sm font-semibold' : 'text-sm font-medium'}>
                        {item.name}{item.company && <span className="font-normal text-zinc-500"> · {item.company}</span>}
                      </p>
                      <p className="truncate text-xs text-zinc-500">{item.email} · {item.data.message || item.data.interest || item.data.inquiryType || '—'}</p>
                    </div>
                    <Badge tone={item.type === 'DEMO' ? 'violet' : 'neutral'}>{item.type === 'DEMO' ? 'Demo' : 'Contact'}</Badge>
                    <Badge tone={statusTone[item.status]}>{statusLabels[item.status]}</Badge>
                    <span className="w-28 text-right text-xs text-zinc-500">{timeAgo(item.createdAt)}</span>
                  </button>
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

export function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = useAuth();
  const query = useQuery({ queryKey: ['submission', id], queryFn: ({ signal }) => get<{ item: Submission }>(`/api/admin/submissions/${id}`, signal) });
  const item = query.data?.item;
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(item?.notes ?? ''), [item?.notes]);

  const update = useMutation({
    mutationFn: (body: Partial<Pick<Submission, 'status' | 'notes'>>) => patch<{ item: Submission }>(`/api/admin/submissions/${id}`, body),
    onSuccess: (result) => {
      queryClient.setQueryData(['submission', id], result);
      queryClient.invalidateQueries({ queryKey: ['submissions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Saved');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => del(`/api/admin/submissions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions'] });
      toast.success('Deleted');
      navigate('/submissions');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError || !item) return <ErrorState error={query.error} />;

  const subject = item.type === 'DEMO' ? 'Your Veyra demo request' : 'Your message to Veyra';
  return (
    <>
      <PageHeader
        back={<Link href="/submissions" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-ink"><ArrowLeft className="size-3.5" aria-hidden="true" /> All submissions</Link>}
        title={item.name}
        description={`${item.type === 'DEMO' ? 'Demo request' : 'Contact message'} · ${formatDateTime(item.createdAt)}`}
        actions={<a href={`mailto:${item.email}?subject=${encodeURIComponent(subject)}`} className={buttonClass('primary')}><Mail aria-hidden="true" /> Reply by email</a>}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Details" />
          <dl className="divide-y divide-zinc-100">
            {[
              ['Name', item.name],
              ['Email', <a key="e" href={`mailto:${item.email}`} className="text-brand-700 hover:underline">{item.email}</a>],
              ['Company', item.company || '—'],
              ...Object.entries(item.data).filter(([, v]) => v).map(([k, v]) => [fieldLabels[k] ?? k, v]),
            ].map(([label, value]) => (
              <div key={String(label)} className="grid gap-1 px-5 py-3 sm:grid-cols-[160px_1fr]">
                <dt className="text-[13px] text-zinc-500">{label}</dt>
                <dd className="text-sm whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <SelectField
              label="Status"
              value={item.status}
              disabled={!can('forms.manage') || update.isPending}
              onChange={(status) => update.mutate({ status: status as Submission['status'] })}
              options={(Object.keys(statusLabels) as Submission['status'][]).map((s) => ({ value: s, label: statusLabels[s] }))}
            />
            <TextAreaField label="Internal notes" value={notes} onChange={setNotes} rows={5} disabled={!can('forms.manage')} hint="Only visible to admins." />
            {can('forms.manage') && <Button size="sm" variant="primary" disabled={notes === item.notes} loading={update.isPending} onClick={() => update.mutate({ notes })}>Save notes</Button>}
          </Card>
          <Card className="space-y-2 p-5 text-[13px] text-zinc-600">
            <p>Notification email: <span className="text-ink">{item.emailed ? 'sent' : 'not sent'}</span></p>
            <p>Last updated {timeAgo(item.updatedAt)}</p>
          </Card>
          {item.status === 'SPAM' && <Notice tone="warn">Flagged as spam{item.notes.startsWith('Flagged automatically') ? ' automatically' : ''}. Change the status if it is genuine.</Notice>}
          {can('forms.manage') && (
            <Button variant="ghost" className="text-red-600 hover:bg-red-50" icon={<Trash2 />} onClick={async () => { if (await confirm({ title: 'Delete this submission?', message: 'It is removed permanently, including your notes.' })) remove.mutate(); }}>
              Delete submission
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
