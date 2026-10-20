import { useMutation, useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarClock, FilePlus2, FileText, ImageIcon, Inbox, LineChart, Newspaper, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { toast } from 'sonner';
import { Badge, ButtonLink, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageLoader, buttonClass } from '@/components/ui';
import { errorMessage, get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { Activity } from '@/lib/types';

type Dashboard = {
  counts: { pages: number; pagesPublished: number; posts: number; postsPublished: number; postsDraft: number; postsScheduled: number; media: number; submissionsNew: number };
  scheduled: { type: 'page' | 'post'; id: string; title: string; publishAt: string }[];
  drafts: { id: string; title: string; updatedAt: string }[];
  activity: Activity[];
  submissions: { id: string; type: 'DEMO' | 'CONTACT'; name: string; company: string; status: string; createdAt: string }[];
  analytics: { googleAnalyticsId: string; googleTagManagerId: string };
};

function Stat({ label, value, sub, icon, href }: { label: string; value: number; sub?: ReactNode; icon: ReactNode; href?: string }) {
  const body = (
    <Card className="h-full p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-zinc-500">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 [&_svg]:size-4">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block rounded-xl">{body}</Link> : body;
}

export function DashboardPage() {
  const { user, can } = useAuth();
  const [, navigate] = useLocation();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: ({ signal }) => get<Dashboard>('/api/admin/dashboard', signal) });

  const newPost = useMutation({
    mutationFn: () => post<{ post: { id: string } }>('/api/admin/posts', { title: 'Untitled post' }),
    onSuccess: (result) => navigate(`/posts/${result.post.id}`),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const newPage = useMutation({
    mutationFn: () => post<{ page: { id: string } }>('/api/admin/pages', { title: 'Untitled page' }),
    onSuccess: (result) => navigate(`/pages/${result.page.id}`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.name.split(' ')[0] ?? ''}`}
        description="Here is what is happening on the Veyra website."
        actions={
          <>
            {can('posts.editOwn') && (
              <button type="button" className={buttonClass('primary')} onClick={() => newPost.mutate()} disabled={newPost.isPending}>
                <PenLine aria-hidden="true" /> New post
              </button>
            )}
            {can('pages.edit') && (
              <button type="button" className={buttonClass('secondary')} onClick={() => newPage.mutate()} disabled={newPage.isPending}>
                <FilePlus2 aria-hidden="true" /> New page
              </button>
            )}
            {can('media.upload') && <ButtonLink href="/media" icon={<ImageIcon />}>Media library</ButtonLink>}
          </>
        }
      />

      {query.isLoading ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        query.data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {can('pages.edit') && <Stat label="Pages" value={query.data.counts.pages} sub={`${query.data.counts.pagesPublished} published`} icon={<FileText />} href="/pages" />}
              <Stat label={can('posts.editAll') ? 'Resources posts' : 'Your posts'} value={query.data.counts.posts} sub={`${query.data.counts.postsPublished} published`} icon={<Newspaper />} href="/posts" />
              <Stat label="Drafts" value={query.data.counts.postsDraft} sub={query.data.counts.postsScheduled ? `${query.data.counts.postsScheduled} scheduled` : 'None scheduled'} icon={<PenLine />} href="/posts?status=DRAFT" />
              {can('forms.view') ? (
                <Stat label="New leads" value={query.data.counts.submissionsNew} sub="Awaiting follow-up" icon={<Inbox />} href="/submissions" />
              ) : (
                <Stat label="Media files" value={query.data.counts.media} icon={<ImageIcon />} href="/media" />
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {can('forms.view') && (
                  <Card>
                    <CardHeader title="Latest form submissions" actions={<ButtonLink href="/submissions" size="sm">View all</ButtonLink>} />
                    {query.data.submissions.length ? (
                      <ul className="divide-y divide-zinc-100">
                        {query.data.submissions.map((submission) => (
                          <li key={submission.id}>
                            <Link href={`/submissions/${submission.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{submission.name}{submission.company && <span className="font-normal text-zinc-500"> · {submission.company}</span>}</p>
                                <p className="text-xs text-zinc-500">{submission.type === 'DEMO' ? 'Demo request' : 'Contact message'} · {timeAgo(submission.createdAt)}</p>
                              </div>
                              {submission.status === 'NEW' && <Badge tone="blue">New</Badge>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState icon={<Inbox />} title="No submissions yet" description="Demo requests and contact messages from the site will appear here." />
                    )}
                  </Card>
                )}

                <Card>
                  <CardHeader title="Recent activity" actions={can('activity.view') && <ButtonLink href="/activity" size="sm">Full log</ButtonLink>} />
                  {query.data.activity.length ? (
                    <ul className="divide-y divide-zinc-100">
                      {query.data.activity.map((entry) => (
                        <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-zinc-800">{entry.summary}</p>
                            <p className="text-xs text-zinc-500">{entry.user} · {timeAgo(entry.createdAt)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="No activity yet" />
                  )}
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader title="Scheduled" />
                  {query.data.scheduled.length ? (
                    <ul className="divide-y divide-zinc-100">
                      {query.data.scheduled.map((item) => (
                        <li key={`${item.type}-${item.id}`}>
                          <Link href={`/${item.type === 'page' ? 'pages' : 'posts'}/${item.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-zinc-50">
                            <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{item.title}</p>
                              <p className="text-xs text-zinc-500">{formatDateTime(item.publishAt)}</p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-5 py-4 text-sm text-zinc-500">Nothing is scheduled.</p>
                  )}
                </Card>

                <Card>
                  <CardHeader title={can('posts.editAll') ? 'Recent drafts' : 'Your drafts'} />
                  {query.data.drafts.length ? (
                    <ul className="divide-y divide-zinc-100">
                      {query.data.drafts.map((draft) => (
                        <li key={draft.id}>
                          <Link href={`/posts/${draft.id}`} className="block px-5 py-3 hover:bg-zinc-50">
                            <p className="truncate text-sm font-medium">{draft.title}</p>
                            <p className="text-xs text-zinc-500">Edited {timeAgo(draft.updatedAt)}</p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-5 py-4 text-sm text-zinc-500">No drafts in progress.</p>
                  )}
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader title="Analytics" />
                  <div className="space-y-3 px-5 py-4 text-sm">
                    {query.data.analytics.googleAnalyticsId || query.data.analytics.googleTagManagerId ? (
                      <>
                        <div className="flex items-center gap-2 text-zinc-700">
                          <LineChart className="size-4 text-emerald-600" aria-hidden="true" />
                          Tracking is on{query.data.analytics.googleAnalyticsId ? ` (${query.data.analytics.googleAnalyticsId})` : ''}.
                        </div>
                        <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
                          <BarChart3 aria-hidden="true" /> Open Google Analytics
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="leading-relaxed text-zinc-600">Add a Google Analytics or Tag Manager ID to start measuring visits. Traffic charts can be added here once it is connected.</p>
                        {can('settings.manage') && <ButtonLink href="/seo?tab=analytics" size="sm">Connect analytics</ButtonLink>}
                      </>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )
      )}
    </>
  );
}
