import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/dialog';
import { ImageField } from '@/components/media';
import { Badge, Button, Card, CardHeader, ErrorState, Notice, PageHeader, PageLoader, TextField } from '@/components/ui';
import { errorMessage, fieldErrors, get, patch, post } from '@/lib/api';
import { roleLabel, useAuth } from '@/lib/auth';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { Me } from '@/lib/types';

type TwoFactor = { enabled: boolean; totp: boolean; email: boolean; enabledAt: string | null; required: boolean; backupCodesRemaining: number };
type Profile = { user: Me & { lastLoginAt: string | null; createdAt: string }; twoFactor: TwoFactor; sessions: { createdAt: string; lastSeenAt: string; userAgent: string; current: boolean }[] };

function BackupCodes({ codes }: { codes: string[] }) {
  const copy = () => { void navigator.clipboard?.writeText(codes.join('\n')); toast.success('Backup codes copied.'); };
  const download = () => {
    const blob = new Blob([`Veyra admin — two-factor backup codes\nKeep these somewhere safe. Each code works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'veyra-backup-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <Notice tone="warn">These are shown once. Save them now — each code lets you sign in once if you lose your authenticator.</Notice>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-zinc-50 p-4 font-mono text-sm">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" variant="subtle" onClick={copy}>Copy</Button>
        <Button size="sm" variant="subtle" onClick={download}>Download</Button>
      </div>
    </div>
  );
}

type PwAction = { endpoint: string; title: string; message: string; confirmLabel: string; danger?: boolean };

function TwoFactorCard({ twoFactor, onChanged }: { twoFactor: TwoFactor; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<null | 'setup' | 'regenerate' | 'password'>(null);
  const [setupData, setSetupData] = useState<{ secret: string; qr: string } | null>(null);
  const [pwAction, setPwAction] = useState<PwAction | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => { setMode(null); setSetupData(null); setPwAction(null); setPassword(''); setCode(''); setCodes(null); setErrors({}); };

  const setup = useMutation({
    mutationFn: () => post<{ secret: string; qr: string }>('/api/admin/profile/2fa/setup', {}),
    onSuccess: (d) => { setSetupData(d); setMode('setup'); setCodes(null); setErrors({}); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const enable = useMutation({
    mutationFn: () => post<{ backupCodes: string[] }>('/api/admin/profile/2fa/enable', { password, code }),
    onSuccess: async (d) => { setCodes(d.backupCodes); setPassword(''); setCode(''); setErrors({}); await onChanged(); },
    onError: (e) => { setErrors(fieldErrors(e)); toast.error(errorMessage(e)); },
  });
  const regenerate = useMutation({
    mutationFn: () => post<{ backupCodes: string[] }>('/api/admin/profile/2fa/backup-codes', { password }),
    onSuccess: async (d) => { setCodes(d.backupCodes); setPassword(''); setErrors({}); await onChanged(); },
    onError: (e) => { setErrors(fieldErrors(e)); toast.error(errorMessage(e)); },
  });
  const pwMutation = useMutation({
    mutationFn: () => post<{ message: string }>(pwAction!.endpoint, { password }),
    onSuccess: async (r) => { toast.success(r.message); reset(); await onChanged(); },
    onError: (e) => { setErrors(fieldErrors(e)); toast.error(errorMessage(e)); },
  });
  const askPassword = (action: PwAction) => { setPwAction(action); setPassword(''); setErrors({}); setMode('password'); };

  const canDisableTotp = !twoFactor.required || twoFactor.email;
  const canDisableEmail = !twoFactor.required || twoFactor.totp;

  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        description="Ask for a code at sign-in, on top of your password — from an authenticator app or by email."
        actions={<Badge tone={twoFactor.enabled ? 'green' : twoFactor.required ? 'amber' : 'neutral'}>{twoFactor.enabled ? 'On' : twoFactor.required ? 'Required' : 'Off'}</Badge>}
      />
      <div className="p-5">
        {twoFactor.required && !twoFactor.enabled && <Notice tone="warn">Two-factor authentication is required for all admins. Turn on a method below to keep using the dashboard.</Notice>}

        {/* Authenticator app */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 py-4 first:pt-0">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">Authenticator app {twoFactor.totp && <Badge tone="green">On</Badge>}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {twoFactor.totp
                ? <>On{twoFactor.enabledAt ? ` since ${formatDateTime(twoFactor.enabledAt)}` : ''} · {twoFactor.backupCodesRemaining} backup code{twoFactor.backupCodesRemaining === 1 ? '' : 's'} left.</>
                : 'A 6-digit code from Google Authenticator, 1Password, Authy, etc.'}
            </p>
          </div>
          <div className="flex gap-2">
            {twoFactor.totp ? (
              <>
                <Button size="sm" variant="subtle" onClick={() => { setMode('regenerate'); setCodes(null); setPassword(''); setErrors({}); }}>Backup codes</Button>
                <Button size="sm" variant="ghost" className="text-red-600" disabled={!canDisableTotp} onClick={() => askPassword({ endpoint: '/api/admin/profile/2fa/totp/disable', title: 'Remove the authenticator app', message: 'Enter your password to remove the authenticator app from your account.', confirmLabel: 'Remove', danger: true })}>Turn off</Button>
              </>
            ) : (
              <Button size="sm" variant="primary" loading={setup.isPending} onClick={() => setup.mutate()}>Set up</Button>
            )}
          </div>
        </div>

        {/* Email codes */}
        <div className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">Email codes {twoFactor.email && <Badge tone="green">On</Badge>}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{twoFactor.email ? 'A 6-digit code is emailed to you at sign-in.' : 'Get a 6-digit code by email at sign-in — no app needed.'}</p>
          </div>
          <div className="flex gap-2">
            {twoFactor.email ? (
              <Button size="sm" variant="ghost" className="text-red-600" disabled={!canDisableEmail} onClick={() => askPassword({ endpoint: '/api/admin/profile/2fa/email/disable', title: 'Turn off email codes', message: 'Enter your password to stop receiving sign-in codes by email.', confirmLabel: 'Turn off', danger: true })}>Turn off</Button>
            ) : (
              <Button size="sm" variant="subtle" onClick={() => askPassword({ endpoint: '/api/admin/profile/2fa/email/enable', title: 'Turn on email codes', message: 'Enter your password to start receiving a 6-digit sign-in code by email.', confirmLabel: 'Turn on' })}>Turn on</Button>
            )}
          </div>
        </div>
      </div>

      {/* Authenticator setup flow */}
      <Modal open={mode === 'setup'} onClose={reset} title="Set up the authenticator app" size="md"
        footer={codes ? <Button variant="primary" onClick={reset}>Done</Button> : <><Button variant="ghost" onClick={reset}>Cancel</Button><Button variant="primary" loading={enable.isPending} onClick={() => enable.mutate()} disabled={!password || code.length < 6}>Turn on</Button></>}>
        {codes ? (
          <BackupCodes codes={codes} />
        ) : setupData ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">Scan this with Google Authenticator, 1Password, Authy or similar, then enter the 6-digit code it shows.</p>
            <div className="flex justify-center"><img src={setupData.qr} alt="QR code for your authenticator app" className="size-44 rounded-lg border border-zinc-200" /></div>
            <p className="text-center text-xs text-zinc-500">Can’t scan? Enter this key manually:<br /><code className="font-mono text-[13px] break-all text-ink">{setupData.secret}</code></p>
            <TextField label="Your password" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
            <TextField label="6-digit code" value={code} onChange={setCode} error={errors.code} />
          </div>
        ) : null}
      </Modal>

      {/* Regenerate backup codes */}
      <Modal open={mode === 'regenerate'} onClose={reset} title="Regenerate backup codes" size="md"
        footer={codes ? <Button variant="primary" onClick={reset}>Done</Button> : <><Button variant="ghost" onClick={reset}>Cancel</Button><Button variant="primary" loading={regenerate.isPending} onClick={() => regenerate.mutate()} disabled={!password}>Generate new codes</Button></>}>
        {codes ? (
          <BackupCodes codes={codes} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">This replaces your existing backup codes. The old ones stop working. Enter your password to continue.</p>
            <TextField label="Your password" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
          </div>
        )}
      </Modal>

      {/* Generic password-confirm (enable/disable a method) */}
      <Modal open={mode === 'password'} onClose={reset} title={pwAction?.title ?? ''} size="sm"
        footer={<><Button variant="ghost" onClick={reset}>Cancel</Button><Button variant="primary" className={pwAction?.danger ? '!bg-red-600' : undefined} loading={pwMutation.isPending} onClick={() => pwMutation.mutate()} disabled={!password}>{pwAction?.confirmLabel ?? 'Confirm'}</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">{pwAction?.message}</p>
          <TextField label="Your password" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
        </div>
      </Modal>
    </Card>
  );
}

// Shown full-screen (no dashboard nav) when 2FA is required for all admins but
// the signed-in user has not set it up yet.
export function ForceTwoFactorSetup() {
  const { signOut, refresh } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['profile'], queryFn: ({ signal }) => get<Profile>('/api/admin/profile', signal) });
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-5 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/veyra-logo.svg" alt="" className="size-7 object-contain" />
          <span className="text-lg font-semibold">Veyra Admin</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Set up two-factor authentication</h1>
        <p className="mt-1.5 mb-6 text-sm text-zinc-500">Your organisation requires every admin to use two-factor authentication. Set it up to continue.</p>
        {query.data && (
          <TwoFactorCard twoFactor={query.data.twoFactor} onChanged={async () => { await refresh(); queryClient.invalidateQueries({ queryKey: ['profile'] }); }} />
        )}
        <button type="button" onClick={() => void signOut()} className="mt-6 text-[13px] font-medium text-zinc-600 hover:text-ink">Sign out</button>
      </div>
    </div>
  );
}

function browserName(agent: string) {
  if (!agent) return 'Unknown device';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const os = /Windows/.test(agent) ? 'Windows' : /Mac OS/.test(agent) ? 'macOS' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Linux/.test(agent) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const query = useQuery({ queryKey: ['profile'], queryFn: ({ signal }) => get<Profile>('/api/admin/profile', signal) });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentForEmail, setCurrentForEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (query.data) {
      setName(query.data.user.name);
      setEmail(query.data.user.email);
      setAvatarUrl(query.data.user.avatarUrl);
    }
  }, [query.data]);

  const saveProfile = useMutation({
    mutationFn: () => patch('/api/admin/profile', { name, email, avatarUrl, currentPassword: currentForEmail || undefined }),
    onSuccess: async () => {
      toast.success('Profile saved');
      setErrors({});
      setCurrentForEmail('');
      await refresh();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      toast.error(errorMessage(error));
    },
  });
  const changePassword = useMutation({
    mutationFn: () => post<{ message: string }>('/api/admin/profile/password', { currentPassword: current, newPassword: next }),
    onSuccess: (result) => {
      toast.success(result.message);
      setCurrent('');
      setNext('');
      setConfirmNext('');
      setErrors({});
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      toast.error(errorMessage(error));
    },
  });
  const submitPassword = () => {
    if (next !== confirmNext) {
      setErrors({ confirmNext: 'The two new passwords do not match.' });
      return;
    }
    changePassword.mutate();
  };
  const signOutOthers = useMutation({
    mutationFn: () => post<{ message: string }>('/api/admin/profile/sign-out-others'),
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const user = query.data.user;
  const emailChanged = email.trim().toLowerCase() !== user.email;

  return (
    <>
      <PageHeader title="Your profile" description={<>{roleLabel[user.role]} · member since {formatDateTime(user.createdAt)}</>} />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); saveProfile.mutate(); }}>
            <TextField label="Name" value={name} onChange={setName} required error={errors.name} />
            <TextField label="Email" type="email" value={email} onChange={setEmail} required error={errors.email} hint="Also your sign-in." />
            {emailChanged && <TextField label="Current password" type="password" autoComplete="current-password" value={currentForEmail} onChange={setCurrentForEmail} error={errors.currentPassword} hint="Needed to change your sign-in email." />}
            <ImageField label="Profile picture" value={avatarUrl} onChange={setAvatarUrl} hint="Shown next to your posts and in the admin." />
            <Button type="submit" variant="primary" loading={saveProfile.isPending}>Save profile</Button>
          </form>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Change password" description="Other devices are signed out when you change it." />
            <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); submitPassword(); }}>
              <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={setCurrent} error={errors.currentPassword} />
              <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={setNext} error={errors.newPassword} hint="At least 10 characters, mixing letters and numbers." />
              <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirmNext} onChange={setConfirmNext} error={errors.confirmNext} />
              <Button type="submit" loading={changePassword.isPending} disabled={!current || !next}>Change password</Button>
            </form>
          </Card>
          <TwoFactorCard twoFactor={query.data.twoFactor} onChanged={async () => { await refresh(); queryClient.invalidateQueries({ queryKey: ['profile'] }); }} />
          <Card>
            <CardHeader title="Where you are signed in" actions={query.data.sessions.length > 1 && <Button size="sm" icon={<LogOut />} loading={signOutOthers.isPending} onClick={() => signOutOthers.mutate()}>Sign out others</Button>} />
            <ul className="divide-y divide-zinc-100">
              {query.data.sessions.map((session, index) => (
                <li key={index} className="flex items-center gap-3 px-5 py-3">
                  <Monitor className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{browserName(session.userAgent)}</p>
                    <p className="text-xs text-zinc-500">Active {timeAgo(session.lastSeenAt)} · signed in {formatDateTime(session.createdAt)}</p>
                  </div>
                  {session.current && <Badge tone="green">This device</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
