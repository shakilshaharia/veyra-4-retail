import { useQuery } from '@tanstack/react-query';
import { Activity as ActivityIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge, Card, EmptyState, ErrorState, PageHeader, PageLoader, Pagination } from '@/components/ui';
import { get, qs } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Activity, Paged } from '@/lib/types';

const tone = (action: string) =>
  action === 'delete' ? 'red' : action === 'publish' ? 'green' : action === 'create' || action === 'upload' ? 'blue' : action === 'login' ? 'neutral' : 'violet';

export function ActivityPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['activity', page],
    queryFn: ({ signal }) => get<Paged<Activity>>(`/api/admin/activity${qs({ page, pageSize: 50 })}`, signal),
    placeholderData: (previous) => previous,
  });
  return (
    <>
      <PageHeader title="Activity log" description="Who changed what, and when." />
      <Card>
        {query.isLoading ? (
          <PageLoader />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !query.data?.items.length ? (
          <EmptyState icon={<ActivityIcon />} title="No activity yet" />
        ) : (
          <>
            <ul className="divide-y divide-zinc-100">
              {query.data.items.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <Badge tone={tone(entry.action)} className="w-20 justify-center capitalize">{entry.action}</Badge>
                  <p className="min-w-0 flex-1 basis-64 text-sm">{entry.summary}</p>
                  <p className="text-xs text-zinc-500">{entry.user} · {formatDateTime(entry.createdAt)}</p>
                </li>
              ))}
            </ul>
            <Pagination page={query.data.page} pages={query.data.pages} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
