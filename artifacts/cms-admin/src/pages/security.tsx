import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SecuritySettings } from '@workspace/cms-content';
import { KeyRound, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { StringListEditor } from '@/components/list-editor';
import { Badge, Button, Card, CardHeader, ErrorState, Notice, PageHeader, PageLoader, Switch } from '@/components/ui';
import { errorMessage, get, put } from '@/lib/api';

type SettingsResponse = {
  security: SecuritySettings;
  site: { googleAnalyticsId: string; googleTagManagerId: string };
  environment: { mailConfigured: boolean; siteUrl: string; storageDriver: string };
};
type UserRow = { id: string; role: string; active: boolean; lockedUntil: string | null; totpEnabledAt: string | null; emailOtpEnabled: boolean };

function StatCard({ icon, label, value, tone = 'neutral', note }: { icon: ReactNode; label: string; value: string; tone?: 'green' | 'amber' | 'red' | 'neutral'; note?: string }) {
  const ring = { green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600', neutral: 'text-zinc-500' }[tone];
  return (
    <Card className="p-4">
      <div className={`flex items-center gap-2 text-xs font-medium ${ring}`}>{icon}<span className="text-zinc-500">{label}</span></div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-0.5 text-xs text-zinc-500">{note}</p>}
    </Card>
  );
}

export function SecurityPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: ({ signal }) => get<SettingsResponse>('/api/admin/settings', signal) });
  const users = useQuery({ queryKey: ['users'], queryFn: ({ signal }) => get<{ items: UserRow[] }>('/api/admin/users', signal) });

  const [form, setForm] = useState<SecuritySettings | null>(null);
  useEffect(() => { if (settings.data) setForm(settings.data.security); }, [settings.data]);

  const save = useMutation({
    mutationFn: (value: SecuritySettings) => put('/api/admin/settings/security', value),
    onSuccess: () => { toast.success('Security settings saved.'); queryClient.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (settings.isLoading || users.isLoading) return <PageLoader />;
  if (settings.isError || !settings.data || !form) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;

  const env = settings.data.environment;
  const admins = users.data?.items ?? [];
  const adminCount = admins.filter((u) => u.active).length;
  const twoFaCount = admins.filter((u) => u.active && (u.totpEnabledAt || u.emailOtpEnabled)).length;
  const lockedCount = admins.filter((u) => u.lockedUntil && new Date(u.lockedUntil) > new Date()).length;
  const https = env.siteUrl.startsWith('https://');
  const cspStatus = !form.cspEnabled ? 'Off' : form.cspReportOnly ? 'Report-only' : 'Enforced';
  const set = <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <>
      <PageHeader title="Security" description="Two-factor policy, login alerts, security headers and a snapshot of the account's protection." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<ShieldCheck className="size-4" />} label="Two-factor adoption" value={`${twoFaCount} / ${adminCount}`} tone={twoFaCount === adminCount ? 'green' : 'amber'} note="active admins" />
        <StatCard icon={<Lock className="size-4" />} label="Content-Security-Policy" value={cspStatus} tone={form.cspEnabled && !form.cspReportOnly ? 'green' : 'amber'} />
        <StatCard icon={<KeyRound className="size-4" />} label="Transport" value={https ? 'HTTPS' : 'HTTP (dev)'} tone={https ? 'green' : 'amber'} note={https ? 'Secure cookies + HSTS' : 'Secure cookies off locally'} />
        <StatCard icon={<ShieldAlert className="size-4" />} label="Locked accounts" value={String(lockedCount)} tone={lockedCount ? 'amber' : 'green'} />
      </div>

      <div className="mt-6 grid max-w-3xl gap-6">
        <Card>
          <CardHeader title="Sign-in protection" />
          <div className="space-y-5 p-5">
            <Switch
              checked={form.requireTwoFactor}
              onChange={(v) => set('requireTwoFactor', v)}
              label="Require two-factor authentication for all admins"
              description="Every admin must set up an authenticator app before using the dashboard. You will be asked to set up yours first if you have not already."
            />
            <Switch
              checked={form.alertOnNewDeviceLogin}
              onChange={(v) => set('alertOnNewDeviceLogin', v)}
              label="Email a warning on sign-in from a new device"
              description="Sends the account owner an email when their account is used from a device or location not seen before."
            />
            {form.alertOnNewDeviceLogin && !env.mailConfigured && <Notice tone="warn">Email is not configured yet, so alerts are written to the dev-mail folder. Set up SMTP in Settings → Email to send them.</Notice>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Security headers (Content-Security-Policy)" description="A strict policy is on by default and lets only first-party and listed scripts run. Change these only if a custom snippet or embed needs it." />
          <div className="space-y-5 p-5">
            <Switch checked={form.cspEnabled} onChange={(v) => set('cspEnabled', v)} label="Send the Content-Security-Policy" description="Turning this off removes the main defence against cross-site scripting. Leave it on unless you are debugging a problem." />
            <Switch checked={form.cspReportOnly} onChange={(v) => set('cspReportOnly', v)} disabled={!form.cspEnabled} label="Report-only (do not block)" description="Logs violations in the browser console without blocking anything. Useful to confirm nothing breaks before enforcing." />
            {!form.cspEnabled && <Notice tone="error">The Content-Security-Policy is off. Your site is more exposed to cross-site scripting until you turn it back on.</Notice>}

            <details className="rounded-lg border border-zinc-200 p-4">
              <summary className="cursor-pointer text-sm font-medium">Allow extra sources (advanced)</summary>
              <p className="mt-2 mb-4 text-xs text-zinc-500">Add a domain or scheme (e.g. <code>https://cdn.example.com</code>) when a snippet or widget loads from another origin and is being blocked. One entry per line.</p>
              <div className="space-y-4">
                <StringListEditor label="Script sources" values={form.cspScriptSrc} onChange={(v) => set('cspScriptSrc', v)} placeholder="https://cdn.example.com" addLabel="Add script source" max={40} />
                <StringListEditor label="Connect sources (fetch / XHR / websockets)" values={form.cspConnectSrc} onChange={(v) => set('cspConnectSrc', v)} placeholder="https://api.example.com" addLabel="Add connect source" max={40} />
                <StringListEditor label="Frame sources (embeds)" values={form.cspFrameSrc} onChange={(v) => set('cspFrameSrc', v)} placeholder="https://widget.example.com" addLabel="Add frame source" max={40} />
                <StringListEditor label="Image sources" values={form.cspImgSrc} onChange={(v) => set('cspImgSrc', v)} placeholder="https://images.example.com" addLabel="Add image source" max={40} />
                <StringListEditor label="Style sources" values={form.cspStyleSrc} onChange={(v) => set('cspStyleSrc', v)} placeholder="https://fonts.googleapis.com" addLabel="Add style source" max={40} />
                <StringListEditor label="Font sources" values={form.cspFontSrc} onChange={(v) => set('cspFontSrc', v)} placeholder="https://fonts.gstatic.com" addLabel="Add font source" max={40} />
              </div>
            </details>
          </div>
        </Card>

        <div>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(form)}>Save security settings</Button>
        </div>
      </div>
    </>
  );
}
