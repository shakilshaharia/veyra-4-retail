import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { Redirect, Route, Router, Switch, useLocation } from 'wouter';
import { ConfirmProvider } from '@/components/dialog';
import { Shell } from '@/components/shell';
import { ButtonLink, EmptyState, PageLoader } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ActivityPage } from '@/pages/activity';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from '@/pages/auth';
import { CollectionPage } from '@/pages/collections';
import { DashboardPage } from '@/pages/dashboard';
import { MediaPage } from '@/pages/media';
import { MenusPage } from '@/pages/menus';
import { PageEditorPage, PagesListPage } from '@/pages/pages';
import { PostEditorPage, PostsListPage } from '@/pages/posts';
import { ForceTwoFactorSetup, ProfilePage } from '@/pages/profile';
import { RedirectsPage } from '@/pages/redirects';
import { SecurityPage } from '@/pages/security';
import { SeoPage } from '@/pages/seo';
import { SettingsPage } from '@/pages/settings';
import { SnippetsPage } from '@/pages/snippets';
import { SubmissionDetailPage, SubmissionsPage } from '@/pages/submissions';
import { TaxonomyPage } from '@/pages/taxonomy';
import { UsersPage } from '@/pages/users';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      // Client errors (404, 403, validation) will not fix themselves on retry.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

function Guard({ caps, children }: { caps: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (caps.some((cap) => can(cap))) return <>{children}</>;
  return (
    <EmptyState
      icon={<ShieldAlert />}
      title="You do not have access to this area"
      description="Ask a Super Admin if you need it."
      action={<ButtonLink href="/">Back to the dashboard</ButtonLink>}
    />
  );
}

function NotFound() {
  return <EmptyState title="That admin page does not exist" action={<ButtonLink href="/">Back to the dashboard</ButtonLink>} />;
}

function Protected() {
  return (
    <Shell>
      <Switch>
        <Route path="/"><Guard caps={['dashboard.view']}><DashboardPage /></Guard></Route>
        <Route path="/pages"><Guard caps={['pages.edit']}><PagesListPage /></Guard></Route>
        <Route path="/pages/:id"><Guard caps={['pages.edit']}><PageEditorPage /></Guard></Route>
        <Route path="/posts"><Guard caps={['posts.editOwn', 'posts.editAll']}><PostsListPage /></Guard></Route>
        <Route path="/posts/:id"><Guard caps={['posts.editOwn', 'posts.editAll']}><PostEditorPage /></Guard></Route>
        <Route path="/taxonomy"><Guard caps={['posts.editOwn', 'posts.editAll']}><TaxonomyPage /></Guard></Route>
        <Route path="/collections/:type"><Guard caps={['collections.manage']}><CollectionPage /></Guard></Route>
        <Route path="/media"><Guard caps={['media.upload']}><MediaPage /></Guard></Route>
        <Route path="/menus"><Guard caps={['menus.manage']}><MenusPage /></Guard></Route>
        <Route path="/settings"><Guard caps={['settings.manage']}><SettingsPage /></Guard></Route>
        <Route path="/seo"><Guard caps={['settings.manage']}><SeoPage /></Guard></Route>
        <Route path="/snippets"><Guard caps={['settings.manage']}><SnippetsPage /></Guard></Route>
        <Route path="/security"><Guard caps={['settings.manage']}><SecurityPage /></Guard></Route>
        <Route path="/redirects"><Guard caps={['redirects.manage']}><RedirectsPage /></Guard></Route>
        <Route path="/submissions"><Guard caps={['forms.view']}><SubmissionsPage /></Guard></Route>
        <Route path="/submissions/:id"><Guard caps={['forms.view']}><SubmissionDetailPage /></Guard></Route>
        <Route path="/users"><Guard caps={['users.manage']}><UsersPage /></Guard></Route>
        <Route path="/activity"><Guard caps={['activity.view']}><ActivityPage /></Guard></Route>
        <Route path="/profile"><ProfilePage /></Route>
        <Route><NotFound /></Route>
      </Switch>
    </Shell>
  );
}

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

function Gate() {
  const { user, loading, twoFactorRequired } = useAuth();
  const [location] = useLocation();
  const isPublic = PUBLIC_PATHS.includes(location);

  useEffect(() => {
    document.title = user ? 'Veyra Admin' : 'Sign in · Veyra Admin';
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <PageLoader label="Loading the admin" />
      </div>
    );
  }
  if (!user && !isPublic) return <Redirect to="/login" />;
  if (user && location === '/login') return <Redirect to="/" />;
  // 2FA is required site-wide and this account has not set it up: force it.
  if (user && twoFactorRequired && !user.twoFactorEnabled) return <ForceTwoFactorSetup />;

  return (
    <Switch>
      <Route path="/login"><LoginPage /></Route>
      <Route path="/forgot-password"><ForgotPasswordPage /></Route>
      <Route path="/reset-password"><ResetPasswordPage /></Route>
      <Route><Protected /></Route>
    </Switch>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfirmProvider>
          <Router base="/admin">
            <Gate />
          </Router>
          <Toaster position="bottom-right" richColors closeButton />
        </ConfirmProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
