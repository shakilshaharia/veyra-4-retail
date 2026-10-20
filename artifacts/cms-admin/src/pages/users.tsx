import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Mail, Pencil, ShieldOff, Trash2, UserCircle, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal, useConfirm } from '@/components/dialog';
import { Badge, Button, Card, ErrorState, IconButton, Notice, PageHeader, PageLoader, SelectField, Switch, TextField } from '@/components/ui';
import { del, errorMessage, fieldErrors, get, patch, post } from '@/lib/api';
import { roleLabel, useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import type { Role, UserRow } from '@/lib/types';

const roleOptions = [
  { value: 'AUTHOR', label: 'Author — writes and publishes their own Resources posts' },
  { value: 'EDITOR', label: 'Editor — edits all pages, posts, homepage blocks, menus and leads' },
  { value: 'SUPER_ADMIN', label: 'Super Admin — everything, including users and settings' },
];

type Draft = { id?: string; name: string; email: string; role: Role; active: boolean; password: string };

export function UsersPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = useQuery({ queryKey: ['users'], queryFn: ({ signal }) => get<{ items: UserRow[] }>('/api/admin/users', signal) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const save = useMutation({
    mutationFn: ({ id, password, ...body }: Draft) => (id ? patch(`/api/admin/users/${id}`, body) : post<{ invited: boolean }>('/api/admin/users', { ...body, password })),
    onSuccess: (result, draft) => {
      refresh();
      toast.success(draft.id ? 'User updated' : (result as { invited?: boolean })?.invited ? `Invitation sent to ${draft.email}` : 'User created');
      setEditing(null);
      setErrors({});
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      toast.error(errorMessage(error));
    },
  });
  const sendReset = useMutation({
    mutationFn: (id: string) => post<{ message: string }>(`/api/admin/users/${id}/send-reset`),
    onSuccess: (result) => toast.success(result.message),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const resetTwoFactor = useMutation({
    mutationFn: (id: string) => post<{ message: string }>(`/api/admin/users/${id}/reset-2fa`),
    onSuccess: (result) => { refresh(); toast.success(result.message); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const enableEmailTwoFactor = useMutation({
    mutationFn: (id: string) => post<{ message: string }>(`/api/admin/users/${id}/enable-email-2fa`),
    onSuccess: (result) => { refresh(); toast.success(result.message); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/admin/users/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('User removed');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in to the admin, and what each person can do."
        actions={<Button variant="primary" icon={<UserPlus />} onClick={() => { setErrors({}); setEditing({ name: '', email: '', role: 'AUTHOR', active: true, password: '' }); }}>Add user</Button>}
      />
      <Card>
        {list.isLoading ? (
          <PageLoader />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {list.data?.items.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="size-9 rounded-full object-cover" /> : <UserCircle className="size-9 text-zinc-300" aria-hidden="true" />}
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-sm font-medium">{u.name}{u.id === me?.id && <span className="font-normal text-zinc-500"> (you)</span>}</p>
                  <p className="truncate text-xs text-zinc-500">{u.email}</p>
                </div>
                <Badge tone={u.role === 'SUPER_ADMIN' ? 'violet' : u.role === 'EDITOR' ? 'blue' : 'neutral'}>{roleLabel[u.role]}</Badge>
                {u.totpEnabledAt && <Badge tone="green">App 2FA</Badge>}
                {u.emailOtpEnabled && <Badge tone="green">Email 2FA</Badge>}
                {!u.active && <Badge tone="red">Deactivated</Badge>}
                {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge tone="amber">Locked</Badge>}
                <span className="w-32 text-right text-xs text-zinc-500">{u.lastLoginAt ? `Signed in ${timeAgo(u.lastLoginAt)}` : 'Never signed in'}</span>
                <IconButton label={`Edit ${u.name}`} onClick={() => { setErrors({}); setEditing({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, password: '' }); }}><Pencil /></IconButton>
                <IconButton label={`Email ${u.name} a password link`} onClick={() => sendReset.mutate(u.id)}><KeyRound /></IconButton>
                {!u.emailOtpEnabled && (
                  <IconButton
                    label={`Turn on email two-factor for ${u.name}`}
                    onClick={async () => {
                      if (await confirm({ title: `Turn on email two-factor for ${u.name}?`, message: `${u.name} will be asked for a 6-digit code emailed to ${u.email} every time they sign in. They will be notified by email.`, confirmLabel: 'Turn on', tone: 'primary' })) enableEmailTwoFactor.mutate(u.id);
                    }}
                  >
                    <Mail />
                  </IconButton>
                )}
                {(u.totpEnabledAt || u.emailOtpEnabled) && (
                  <IconButton
                    label={`Turn off two-factor for ${u.name}`}
                    onClick={async () => {
                      if (await confirm({ title: `Turn off two-factor for ${u.name}?`, message: 'Removes all two-factor methods (authenticator app and email). Use this if they are locked out. They can sign in with just their password until they set it up again.', confirmLabel: 'Turn off', tone: 'danger' })) resetTwoFactor.mutate(u.id);
                    }}
                  >
                    <ShieldOff />
                  </IconButton>
                )}
                {u.id !== me?.id && (
                  <IconButton
                    label={`Remove ${u.name}`}
                    className="hover:text-red-600"
                    onClick={async () => {
                      if (await confirm({ title: `Remove ${u.name}?`, message: u._count.posts ? `Their ${u._count.posts} post${u._count.posts === 1 ? '' : 's'} will be reassigned to you and stay on the site.` : 'They will no longer be able to sign in.' })) remove.mutate(u.id);
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit user' : 'Add user'}
        description={editing?.id ? undefined : 'Leave the password empty to email them an invitation to choose their own.'}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => editing && save.mutate(editing)}>{editing?.id ? 'Save' : editing?.password ? 'Create user' : 'Send invitation'}</Button></>}
      >
        {editing && (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(editing); }}>
            <TextField label="Name" value={editing.name} onChange={(name) => setEditing({ ...editing, name })} required autoFocus error={errors.name} />
            <TextField label="Email" type="email" value={editing.email} onChange={(email) => setEditing({ ...editing, email })} required error={errors.email} />
            <SelectField label="Role" value={editing.role} onChange={(role) => setEditing({ ...editing, role: role as Role })} options={roleOptions} disabled={editing.id === me?.id} error={errors.role} hint={editing.id === me?.id ? 'You cannot change your own role.' : undefined} />
            {!editing.id && <TextField label="Password (optional)" type="password" autoComplete="new-password" value={editing.password} onChange={(password) => setEditing({ ...editing, password })} hint="At least 10 characters with letters and numbers." error={errors.password} />}
            {editing.id && editing.id !== me?.id && <Switch checked={editing.active} onChange={(active) => setEditing({ ...editing, active })} label="Can sign in" description="Deactivating signs them out everywhere immediately." />}
            {errors.active && <Notice tone="error">{errors.active}</Notice>}
          </form>
        )}
      </Modal>
    </>
  );
}
