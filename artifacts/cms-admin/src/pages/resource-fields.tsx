// The resource editor's type-specific pieces: the "New resource" menu and the
// field panels for use cases and events. Blogs reuse the rich-text editor.

import { eventFormats, registrationStatuses, resourceTypeLabel } from '@workspace/cms-content';
import { Calendar, FileText, Lightbulb, Newspaper, PenLine, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { StringListEditor } from '@/components/list-editor';
import { Button, Card, CardHeader, Field, IconButton, Input, SelectField, Switch, TextAreaField, TextField } from '@/components/ui';
import { timeZoneOptions, toLocalInput, toZonedIso } from '@/lib/datetime';
import type { EventDetails, ResourceType, UseCaseDetails } from '@/lib/types';

export const resourceTypes: ResourceType[] = ['BLOG', 'USE_CASE', 'EVENT'];
const typeIcon: Record<ResourceType, typeof FileText> = { BLOG: Newspaper, USE_CASE: Lightbulb, EVENT: Calendar };

export const emptyUseCase: UseCaseDetails = { industry: '', challenge: '', approach: [], benefits: [], verifiedOutcomes: [], customerStory: false };
export const emptyEvent: EventDetails = {
  startsAt: '', endsAt: '', timeZone: timeZoneOptions()[0] ?? 'UTC', format: 'Virtual', location: '', audience: '',
  learn: [], agenda: [], speakers: [], registrationStatus: 'open', registrationUrl: '', recordingUrl: '', attendanceUrl: '', venueAddress: '',
};

export function useCaseFrom(details: Record<string, unknown> | null): UseCaseDetails {
  return { ...emptyUseCase, ...(details as Partial<UseCaseDetails> | null) };
}
export function eventFrom(details: Record<string, unknown> | null): EventDetails {
  return { ...emptyEvent, ...(details as Partial<EventDetails> | null) };
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  const handler = useRef(onOutside);
  handler.current = onOutside;
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) handler.current();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref]);
}

// A small "New resource" menu: pick blog, use case or event.
export function NewResourceMenu({ onPick, loading, variant = 'primary' }: { onPick: (type: ResourceType) => void; loading?: boolean; variant?: 'primary' | 'subtle' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <Button variant={variant} icon={<PenLine />} loading={loading} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        New resource
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
          {resourceTypes.map((t) => {
            const Icon = typeIcon[t];
            return (
              <button
                key={t}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50"
                onClick={() => { setOpen(false); onPick(t); }}
              >
                <Icon className="size-4 text-zinc-500" aria-hidden="true" />
                {resourceTypeLabel[t]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UseCaseFields({ value, onChange, errors }: { value: UseCaseDetails; onChange: (v: UseCaseDetails) => void; errors: Record<string, string> }) {
  const set = <K extends keyof UseCaseDetails>(key: K, v: UseCaseDetails[K]) => onChange({ ...value, [key]: v });
  return (
    <Card className="space-y-5 p-5">
      <CardHeader title="Use case details" className="-mx-5 -mt-5 mb-0" />
      <TextField label="Industry" value={value.industry} onChange={(v) => set('industry', v)} required error={errors['details.industry']} placeholder="e.g. Grocery, Fashion, Electronics" />
      <TextAreaField label="Business challenge" value={value.challenge} onChange={(v) => set('challenge', v)} rows={3} required error={errors['details.challenge']} hint="The problem the customer faced." />
      <StringListEditor label="How the solution is applied" values={value.approach} onChange={(v) => set('approach', v)} addLabel="Add step" placeholder="A step in the approach" hint="At least one step is required to publish." />
      {errors['details.approach'] && <p className="text-xs text-red-600">{errors['details.approach']}</p>}
      <StringListEditor label="Benefits" values={value.benefits} onChange={(v) => set('benefits', v)} addLabel="Add benefit" placeholder="A benefit" />
      <StringListEditor label="Verified outcomes" values={value.verifiedOutcomes} onChange={(v) => set('verifiedOutcomes', v)} addLabel="Add outcome" placeholder="An approved, verified result" hint="Only enter real, approved figures. Leave empty otherwise." />
      <Switch
        checked={value.customerStory}
        onChange={(v) => set('customerStory', v)}
        label="Approved customer success story"
        description="On only when this is a real, approved customer story. Otherwise it shows as a general explanation."
      />
    </Card>
  );
}

export function EventFields({ value, onChange, errors }: { value: EventDetails; onChange: (v: EventDetails) => void; errors: Record<string, string> }) {
  const set = <K extends keyof EventDetails>(key: K, v: EventDetails[K]) => onChange({ ...value, [key]: v });
  const zones = timeZoneOptions(value.timeZone);
  const startLocal = toLocalInput(value.startsAt, value.timeZone);
  const endLocal = toLocalInput(value.endsAt, value.timeZone);
  const physical = value.format !== 'Virtual';
  return (
    <Card className="space-y-5 p-5">
      <CardHeader title="Event details" className="-mx-5 -mt-5 mb-0" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" error={errors['details.startsAt']} required>
          {(wiring) => <Input {...wiring} type="datetime-local" value={startLocal} onChange={(e) => set('startsAt', toZonedIso(e.target.value, value.timeZone))} />}
        </Field>
        <Field label="Ends" error={errors['details.endsAt']} hint="Optional.">
          {(wiring) => <Input {...wiring} type="datetime-local" value={endLocal} onChange={(e) => set('endsAt', e.target.value ? toZonedIso(e.target.value, value.timeZone) : '')} />}
        </Field>
      </div>
      <SelectField
        label="Time zone"
        value={value.timeZone}
        onChange={(v) => set('timeZone', v)}
        options={zones.map((z) => ({ value: z, label: z }))}
        error={errors['details.timeZone']}
        hint="Times above are entered and shown in this zone."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Format" value={value.format} onChange={(v) => set('format', v as EventDetails['format'])} options={eventFormats.map((f) => ({ value: f, label: f }))} />
        <SelectField label="Registration" value={value.registrationStatus} onChange={(v) => set('registrationStatus', v as EventDetails['registrationStatus'])} options={registrationStatuses.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
      </div>
      {physical && (
        <>
          <TextField label="Location" value={value.location} onChange={(v) => set('location', v)} placeholder="Venue name or city" error={errors['details.location']} />
          <TextField label="Venue address" value={value.venueAddress} onChange={(v) => set('venueAddress', v)} hint="Full address — needed for rich results on in-person events." />
        </>
      )}
      <TextField label="Registration link" value={value.registrationUrl} onChange={(v) => set('registrationUrl', v)} placeholder="https://…" error={errors['details.registrationUrl']} hint="Where people sign up. Shown while registration is open." />
      <TextField label="Recording link" value={value.recordingUrl} onChange={(v) => set('recordingUrl', v)} placeholder="https://…" error={errors['details.recordingUrl']} hint="Shown after the event, if available." />
      {!physical && (
        <TextField label="Attendance link" value={value.attendanceUrl} onChange={(v) => set('attendanceUrl', v)} placeholder="https://…" error={errors['details.attendanceUrl']} hint="Where the event actually takes place — used for rich results." />
      )}
      <TextAreaField label="Who it is for" value={value.audience} onChange={(v) => set('audience', v)} rows={2} />
      <StringListEditor label="What you will learn" values={value.learn} onChange={(v) => set('learn', v)} addLabel="Add point" placeholder="A takeaway" />
      <AgendaEditor value={value.agenda} onChange={(v) => set('agenda', v)} />
      <SpeakersEditor value={value.speakers} onChange={(v) => set('speakers', v)} />
    </Card>
  );
}

function AgendaEditor({ value, onChange }: { value: { time: string; title: string }[]; onChange: (v: { time: string; title: string }[]) => void }) {
  const update = (i: number, patch: Partial<{ time: string; title: string }>) => onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-zinc-800">Agenda</legend>
      <ul className="space-y-1.5">
        {value.map((row, i) => (
          <li key={i} className="flex items-center gap-1">
            <Input value={row.time} onChange={(e) => update(i, { time: e.target.value })} placeholder="10:00" aria-label={`Agenda ${i + 1} time`} className="h-9 w-24" />
            <Input value={row.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Session title" aria-label={`Agenda ${i + 1} title`} className="h-9" />
            <IconButton label="Remove" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="hover:text-red-600"><Trash2 /></IconButton>
          </li>
        ))}
      </ul>
      {value.length < 30 && <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onChange([...value, { time: '', title: '' }])}>Add agenda item</Button>}
    </fieldset>
  );
}

function SpeakersEditor({ value, onChange }: { value: { name: string; role: string }[]; onChange: (v: { name: string; role: string }[]) => void }) {
  const update = (i: number, patch: Partial<{ name: string; role: string }>) => onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-zinc-800">Speakers</legend>
      <ul className="space-y-1.5">
        {value.map((row, i) => (
          <li key={i} className="flex items-center gap-1">
            <Input value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Name" aria-label={`Speaker ${i + 1} name`} className="h-9" />
            <Input value={row.role} onChange={(e) => update(i, { role: e.target.value })} placeholder="Role (optional)" aria-label={`Speaker ${i + 1} role`} className="h-9" />
            <IconButton label="Remove" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="hover:text-red-600"><Trash2 /></IconButton>
          </li>
        ))}
      </ul>
      {value.length < 30 && <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onChange([...value, { name: '', role: '' }])}>Add speaker</Button>}
    </fieldset>
  );
}
