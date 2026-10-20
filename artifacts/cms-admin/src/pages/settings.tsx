import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { socialNetworks, type DemoSettings, type FormSettings, type SiteSettings } from '@workspace/cms-content';
import { useEffect, useState } from 'react';
import { useSearch } from 'wouter';
import { toast } from 'sonner';
import { StringListEditor } from '@/components/list-editor';
import { ImageField } from '@/components/media';
import { Button, Card, ErrorState, Input, Notice, PageHeader, PageLoader, SelectField, Switch, Tabs, TextAreaField, TextField } from '@/components/ui';
import { errorMessage, fieldErrors, get, post, put } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useUnsavedChanges } from '@/lib/hooks';

// The API never returns the SMTP password; it reports whether one is set.
type AdminEmail = { enabled: boolean; host: string; port: number; secure: boolean; user: string; pass: string; fromName: string; fromEmail: string; hasPassword: boolean };

type SettingsResponse = {
  site: SiteSettings;
  demo: DemoSettings;
  forms: FormSettings;
  email: Omit<AdminEmail, 'pass'>;
  environment: { mailConfigured: boolean; storageDriver: string; recaptchaConfigured: boolean; siteUrl: string };
};

const tabs = [
  { value: 'general', label: 'General' },
  { value: 'contact', label: 'Contact & social' },
  { value: 'forms', label: 'Forms & demo' },
  { value: 'email', label: 'Email' },
  { value: 'maintenance', label: 'Maintenance' },
] as const;
type Tab = (typeof tabs)[number]['value'];

const socialLabels: Record<(typeof socialNetworks)[number], string> = { linkedin: 'LinkedIn', x: 'X (Twitter)', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube' };

export function SettingsPage() {
  const queryClient = useQueryClient();
  const initialTab = (new URLSearchParams(useSearch()).get('tab') as Tab | null) ?? 'general';
  const [tab, setTab] = useState<Tab>(tabs.some((t) => t.value === initialTab) ? initialTab : 'general');
  const query = useQuery({ queryKey: ['settings'], queryFn: ({ signal }) => get<SettingsResponse>('/api/admin/settings', signal) });
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [demo, setDemo] = useState<DemoSettings | null>(null);
  const [forms, setForms] = useState<FormSettings | null>(null);
  const [email, setEmail] = useState<AdminEmail | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { user } = useAuth();
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (query.data) {
      setSite(query.data.site);
      setDemo(query.data.demo);
      setForms(query.data.forms);
      setEmail({ ...query.data.email, pass: '' });
    }
  }, [query.data]);
  useEffect(() => { if (user?.email && !testTo) setTestTo(user.email); }, [user, testTo]);

  const dirtySite = Boolean(query.data && site && JSON.stringify(site) !== JSON.stringify(query.data.site));
  const dirtyDemo = Boolean(query.data && demo && JSON.stringify(demo) !== JSON.stringify(query.data.demo));
  const dirtyForms = Boolean(query.data && forms && JSON.stringify(forms) !== JSON.stringify(query.data.forms));
  const dirtyEmail = Boolean(query.data && email && JSON.stringify(email) !== JSON.stringify({ ...query.data.email, pass: '' }));
  const dirty = dirtySite || dirtyDemo || dirtyForms || dirtyEmail;
  useUnsavedChanges(dirty);

  const save = useMutation({
    mutationFn: async () => {
      if (dirtySite) await put('/api/admin/settings/site', site);
      if (dirtyDemo) await put('/api/admin/settings/demo', demo);
      if (dirtyForms) await put('/api/admin/settings/forms', forms);
      if (dirtyEmail && email) {
        const { hasPassword: _h, ...payload } = email;
        await put('/api/admin/settings/email', payload);
      }
    },
    onSuccess: () => {
      toast.success('Settings saved. They are live on the site.');
      setErrors({});
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      toast.error(errorMessage(error));
    },
  });

  const sendTest = useMutation({
    mutationFn: () => post<{ ok: boolean; message: string }>('/api/admin/settings/email/test', { to: testTo }),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.message(r.message)),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isLoading || !site || !demo || !forms || !email) return query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : <PageLoader />;
  const env = query.data!.environment;
  const s = <K extends keyof SiteSettings>(key: K) => (value: SiteSettings[K]) => setSite({ ...site, [key]: value });
  const d = <K extends keyof DemoSettings>(key: K) => (value: DemoSettings[K]) => setDemo({ ...demo, [key]: value });
  const em = <K extends keyof AdminEmail>(key: K) => (value: AdminEmail[K]) => setEmail({ ...email, [key]: value });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Site-wide details used on every page."
        actions={
          <>
            {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
            <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>Save settings</Button>
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={tabs.map((t) => ({ ...t }))} className="mb-5" />
      {errors._ && <Notice tone="error" className="mb-4">{errors._}</Notice>}

      <Card className="max-w-3xl space-y-5 p-6">
        {tab === 'general' && (
          <>
            <TextField label="Website name" value={site.siteName} onChange={s('siteName')} required error={errors.siteName} hint="Shown beside the logo and in page titles." />
            <ImageField label="Logo" value={site.logo.url} onChange={(url) => setSite({ ...site, logo: { ...site.logo, url } })} hint="The small mark beside the name in the homepage header." error={errors['logo.url']} />
            <ImageField label="Footer logo" value={site.footerLogo.url} onChange={(url) => setSite({ ...site, footerLogo: { ...site.footerLogo, url } })} alt={site.footerLogo.alt} onAltChange={(alt) => setSite({ ...site, footerLogo: { ...site.footerLogo, alt } })} hint="Optional. Without one, the footer shows the website name as text." />
            <ImageField label="Favicon" value={site.favicon} onChange={s('favicon')} hint="The browser-tab icon. A square PNG or ICO, at least 32 × 32." />
            <TextField label="Copyright line" value={site.copyright} onChange={s('copyright')} hint="{year} is replaced with the current year." error={errors.copyright} />
          </>
        )}

        {tab === 'contact' && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Contact email" type="email" value={site.contactEmail} onChange={s('contactEmail')} error={errors.contactEmail} />
              <TextField label="Phone" value={site.phone} onChange={s('phone')} error={errors.phone} />
            </div>
            <TextAreaField label="Address" value={site.address} onChange={s('address')} rows={3} error={errors.address} />
            <TextField label="WhatsApp link" value={site.whatsapp} onChange={s('whatsapp')} placeholder="https://wa.me/15551234567" error={errors.whatsapp} />
            <fieldset className="space-y-4">
              <legend className="text-[13px] font-medium text-zinc-800">Social profiles</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {socialNetworks.map((network) => (
                  <TextField key={network} label={socialLabels[network]} value={site.social[network] ?? ''} placeholder="https://" onChange={(value) => setSite({ ...site, social: { ...site.social, [network]: value } })} error={errors[`social.${network}`]} />
                ))}
              </div>
            </fieldset>
            <Notice tone="info">These are stored for the site and used in structured data for search engines. The current design does not display a contact block or social icons.</Notice>
          </>
        )}

        {tab === 'forms' && (
          <>
            {!env.mailConfigured && <Notice tone="warn" title="Email is not set up on the server">Submissions are still saved and appear under Form submissions, but notification emails are not being sent. Ask your developer to configure SMTP.</Notice>}
            <Switch checked={forms.demoEnabled} onChange={(v) => setForms({ ...forms, demoEnabled: v })} label="Accept demo requests" description="The form behind every Get Demo button." />
            <Switch checked={forms.contactEnabled} onChange={(v) => setForms({ ...forms, contactEnabled: v })} label="Accept contact form messages" description="Off by default, pending approved privacy wording. When off, the contact page shows its notice and the fields are disabled." />
            <TextField label="Send notifications to" type="email" value={site.notificationEmail} onChange={s('notificationEmail')} placeholder={site.contactEmail || 'sales@yourcompany.com'} error={errors.notificationEmail} hint="One address. Falls back to the contact email." />
            <p className="text-xs text-zinc-500">Spam protection: a hidden honeypot field, a minimum fill time, link-spam detection and rate limiting are always on{env.recaptchaConfigured ? ', plus reCAPTCHA' : ''}.</p>
            <hr className="border-zinc-100" />
            <SelectField label="Get Demo buttons" value={demo.mode} onChange={(v) => d('mode')(v as DemoSettings['mode'])} options={[{ value: 'dialog', label: 'Open the demo request form' }, { value: 'url', label: 'Go to a booking link (Calendly, HubSpot…)' }]} />
            {demo.mode === 'url' && <TextField label="Booking link" value={demo.url} onChange={d('url')} placeholder="https://calendly.com/…" error={errors.url} />}
            <TextField label="Default button label" value={demo.ctaLabel} onChange={d('ctaLabel')} error={errors.ctaLabel} />
            {demo.mode === 'dialog' && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField label="Form title" value={demo.title} onChange={d('title')} error={errors.title} />
                  <TextField label="Submit button" value={demo.submitLabel} onChange={d('submitLabel')} error={errors.submitLabel} />
                </div>
                <TextAreaField label="Introduction" value={demo.lede} onChange={d('lede')} rows={2} error={errors.lede} />
                <StringListEditor label="“I’m interested in” options" values={demo.interests} onChange={d('interests')} addLabel="Add option" />
                <TextField label="Confirmation title" value={demo.successTitle} onChange={d('successTitle')} />
                <TextAreaField label="Confirmation message" value={demo.successMessage} onChange={d('successMessage')} rows={2} hint="{firstName} and {email} are filled in from the form." />
              </>
            )}
          </>
        )}

        {tab === 'email' && (
          <>
            <Notice tone={env.mailConfigured ? 'success' : 'info'}>
              {env.mailConfigured
                ? 'Email is configured. Password resets and form notifications are sent.'
                : 'Email is not set up yet. Until it is, those messages are written to a local dev-mail folder instead of being sent.'}
            </Notice>
            <Switch checked={email.enabled} onChange={em('enabled')} label="Send email through SMTP" description="Turn on to use the SMTP server below. Off keeps messages in the dev-mail folder." />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="SMTP host" value={email.host} onChange={em('host')} placeholder="smtp.yourprovider.com" error={errors.host} hint="From your email provider." />
              <TextField label="Port" type="number" value={String(email.port)} onChange={(v) => em('port')(Number(v) || 0)} error={errors.port} hint="Usually 587 (STARTTLS) or 465 (SSL)." />
            </div>
            <Switch checked={email.secure} onChange={em('secure')} label="Use SSL/TLS (port 465)" description="Turn on for port 465. Leave off for 587, which upgrades to TLS automatically." />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Username" value={email.user} onChange={em('user')} placeholder="you@yourdomain.com" error={errors.user} autoComplete="off" />
              <TextField label="Password" type="password" value={email.pass} onChange={em('pass')} placeholder={email.hasPassword ? '•••••••• (saved — leave blank to keep)' : ''} error={errors.pass} autoComplete="new-password" hint={email.hasPassword ? 'A password is saved. Enter a new one only to change it.' : undefined} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="From name" value={email.fromName} onChange={em('fromName')} placeholder="Veyra" error={errors.fromName} hint="Shown as the sender's name." />
              <TextField label="From address" type="email" value={email.fromEmail} onChange={em('fromEmail')} placeholder="no-reply@yourdomain.com" error={errors.fromEmail} hint="Falls back to the username if left blank." />
            </div>
            <Card className="space-y-3 bg-zinc-50 p-4">
              <p className="text-sm font-medium">Send a test email</p>
              <p className="text-xs text-zinc-500">Save your settings first, then send a test to confirm they work.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" aria-label="Test recipient" className="max-w-xs" />
                <Button variant="subtle" loading={sendTest.isPending} disabled={dirtyEmail || !testTo} onClick={() => sendTest.mutate()}>Send test email</Button>
              </div>
              {dirtyEmail && <p className="text-xs text-amber-700">Save your changes before sending a test.</p>}
            </Card>
          </>
        )}

        {tab === 'maintenance' && (
          <>
            <Switch checked={site.maintenanceMode} onChange={s('maintenanceMode')} label="Maintenance mode" description="Visitors see a short holding page and search engines are told to come back later. You stay able to browse the site while signed in." />
            <TextAreaField label="Message for visitors" value={site.maintenanceMessage} onChange={s('maintenanceMessage')} rows={2} error={errors.maintenanceMessage} />
            {site.maintenanceMode && <Notice tone="warn">When you save, the public site will be offline for everyone who is not signed in.</Notice>}
          </>
        )}

      </Card>
    </>
  );
}
