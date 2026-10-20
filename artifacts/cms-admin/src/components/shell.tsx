import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Boxes,
  Code2,
  ExternalLink,
  FileText,
  FolderTree,
  HelpCircle,
  Image,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  MessageSquareQuote,
  Newspaper,
  Repeat,
  Search,
  Settings,
  Shapes,
  ShieldCheck,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { get } from '@/lib/api';
import { roleLabel, useAuth } from '@/lib/auth';
import { cn } from '@/lib/format';

type NavItem = { href: string; label: string; icon: LucideIcon; caps: string[]; badge?: 'submissions' };
type NavGroup = { label?: string; items: NavItem[] };

const groups: NavGroup[] = [
  { items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, caps: ['dashboard.view'] }] },
  {
    label: 'Content',
    items: [
      { href: '/pages', label: 'Pages', icon: FileText, caps: ['pages.edit'] },
      { href: '/posts', label: 'Resources', icon: Newspaper, caps: ['posts.editOwn', 'posts.editAll'] },
      { href: '/taxonomy', label: 'Categories & tags', icon: FolderTree, caps: ['posts.editOwn', 'posts.editAll'] },
      { href: '/media', label: 'Media library', icon: Image, caps: ['media.upload'] },
    ],
  },
  {
    label: 'Homepage blocks',
    items: [
      { href: '/collections/metrics', label: 'Statistics', icon: BarChart3, caps: ['collections.manage'] },
      { href: '/collections/products', label: 'Products & features', icon: Boxes, caps: ['collections.manage'] },
      { href: '/collections/testimonials', label: 'Testimonials', icon: MessageSquareQuote, caps: ['collections.manage'] },
      { href: '/collections/faqs', label: 'FAQs', icon: HelpCircle, caps: ['collections.manage'] },
      { href: '/collections/logos', label: 'Client logos', icon: Shapes, caps: ['collections.manage'] },
    ],
  },
  {
    label: 'Leads',
    items: [{ href: '/submissions', label: 'Form submissions', icon: Inbox, caps: ['forms.view'], badge: 'submissions' }],
  },
  {
    label: 'Site',
    items: [
      { href: '/menus', label: 'Menus', icon: MenuIcon, caps: ['menus.manage'] },
      { href: '/seo', label: 'SEO', icon: Search, caps: ['settings.manage'] },
      { href: '/snippets', label: 'Code Snippets', icon: Code2, caps: ['settings.manage'] },
      { href: '/redirects', label: 'Redirects', icon: Repeat, caps: ['redirects.manage'] },
      { href: '/settings', label: 'Settings', icon: Settings, caps: ['settings.manage'] },
      { href: '/security', label: 'Security', icon: ShieldCheck, caps: ['settings.manage'] },
      { href: '/users', label: 'Users', icon: Users, caps: ['users.manage'] },
      { href: '/activity', label: 'Activity log', icon: Activity, caps: ['activity.view'] },
    ],
  },
];

function isActive(location: string, href: string) {
  return href === '/' ? location === '/' : location === href || location.startsWith(`${href}/`);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, can, signOut } = useAuth();
  const [location] = useLocation();
  const newSubmissions = useQuery({
    queryKey: ['submissions', 'new-count'],
    queryFn: () => get<{ statusCounts: Record<string, number> }>('/api/admin/submissions?pageSize=1&status=NEW'),
    enabled: can('forms.view'),
    refetchInterval: 60_000,
    select: (data) => data.statusCounts.NEW ?? 0,
  });

  return (
    <div className="flex h-full flex-col bg-ink text-zinc-300">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <img src="/veyra-logo.svg" alt="" className="size-7 object-contain" />
        <span className="text-[15px] font-semibold tracking-tight text-white">Veyra</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-zinc-300 uppercase">Admin</span>
      </div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Admin">
        {groups.map((group, index) => {
          const items = group.items.filter((item) => item.caps.some((cap) => can(cap)));
          if (!items.length) return null;
          return (
            <div key={group.label ?? index}>
              {group.label && <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{group.label}</p>}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(location, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                          active ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <Icon className={cn('size-4 shrink-0', active ? 'text-brand-200' : 'text-zinc-500')} aria-hidden="true" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge === 'submissions' && (newSubmissions.data ?? 0) > 0 && (
                          <span className="rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white tabular-nums" aria-label={`${newSubmissions.data} new`}>
                            {newSubmissions.data}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="shrink-0 space-y-1 border-t border-white/10 p-3">
        <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium hover:bg-white/5 hover:text-white">
          <ExternalLink className="size-4 text-zinc-500" aria-hidden="true" />
          View site
        </a>
        <Link href="/profile" onClick={onNavigate} className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/5', isActive(location, '/profile') && 'bg-white/10')}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
          ) : (
            <UserCircle className="size-7 text-zinc-500" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white">{user?.name}</span>
            <span className="block truncate text-[11.5px] text-zinc-500">{user ? roleLabel[user.role] : ''}</span>
          </span>
        </Link>
        <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium hover:bg-white/5 hover:text-white">
          <LogOut className="size-4 text-zinc-500" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  useEffect(() => setOpen(false), [location]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#admin-main" className="sr-only z-50 rounded-lg bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <Sidebar />
      </aside>

      {/* Phones and tablets: a slide-out drawer. */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="-ml-1.5 rounded-lg p-1.5 text-zinc-700 hover:bg-zinc-100" aria-label="Open menu" aria-expanded={open}>
          <MenuIcon className="size-5" aria-hidden="true" />
        </button>
        <img src="/veyra-logo.svg" alt="" className="size-6 object-contain" />
        <span className="text-[15px] font-semibold">Veyra Admin</span>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button type="button" onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Close menu">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <main id="admin-main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
