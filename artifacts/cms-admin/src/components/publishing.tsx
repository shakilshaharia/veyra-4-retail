import { CalendarClock, ExternalLink, Eye, Send, Undo2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatDateTime, toLocalInput } from '@/lib/format';
import type { Status } from '@/lib/types';
import { Modal } from './dialog';
import { Badge, Button, Field, Input } from './ui';

export function StatusBadge({ status, hasChanges }: { status: Status; hasChanges?: boolean }) {
  const map: Record<Status, { tone: 'green' | 'amber' | 'blue' | 'neutral'; label: string }> = {
    PUBLISHED: { tone: 'green', label: 'Published' },
    DRAFT: { tone: 'neutral', label: 'Draft' },
    SCHEDULED: { tone: 'blue', label: 'Scheduled' },
    ARCHIVED: { tone: 'amber', label: 'Archived' },
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={map[status].tone}>{map[status].label}</Badge>
      {hasChanges && <Badge tone="amber">Unpublished changes</Badge>}
    </span>
  );
}

export function ScheduleDialog({ open, onClose, onSchedule, busy }: { open: boolean; onClose: () => void; onSchedule: (iso: string) => void; busy?: boolean }) {
  const [value, setValue] = useState(() => toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [error, setError] = useState('');
  const submit = () => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 60_000) {
      setError('Choose a time at least a minute from now.');
      return;
    }
    onSchedule(date.toISOString());
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Schedule publishing"
      description="It goes live automatically at this time (checked every minute)."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit} icon={<CalendarClock />}>Schedule</Button>
        </>
      }
    >
      <Field label="Publish on" hint={`Your time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`} error={error}>
        {(wiring) => <Input {...wiring} type="datetime-local" value={value} min={toLocalInput(new Date())} onChange={(event) => { setValue(event.target.value); setError(''); }} />}
      </Field>
    </Modal>
  );
}

// The publish box both editors share: what visitors see now, and the buttons
// to change it.
export function PublishBox({
  status,
  hasChanges,
  publishAt,
  publishedAt,
  updatedAt,
  updatedBy,
  dirty,
  saving,
  busy,
  canPublish,
  liveUrl,
  onSave,
  onPreview,
  onPublish,
  onSchedule,
  onUnpublish,
  unpublishLabel = 'Unpublish',
  extra,
}: {
  status: Status;
  hasChanges?: boolean;
  publishAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy?: string | null;
  dirty: boolean;
  saving: boolean;
  busy: boolean;
  canPublish: boolean;
  liveUrl?: string;
  onSave: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onSchedule: (iso: string) => void;
  onUnpublish?: () => void;
  unpublishLabel?: string;
  extra?: ReactNode;
}) {
  const [scheduling, setScheduling] = useState(false);
  const live = status === 'PUBLISHED';
  const publishLabel = live ? (hasChanges || dirty ? 'Publish changes' : 'Published') : 'Publish';
  return (
    <div className="space-y-4">
      <div className="space-y-1.5 text-[13px] text-zinc-600">
        <div className="flex items-center justify-between gap-2">
          <span>Status</span>
          <StatusBadge status={status} hasChanges={hasChanges} />
        </div>
        {status === 'SCHEDULED' && publishAt && (
          <div className="flex items-center justify-between gap-2">
            <span>Goes live</span>
            <span className="font-medium text-ink">{formatDateTime(publishAt)}</span>
          </div>
        )}
        {publishedAt && (
          <div className="flex items-center justify-between gap-2">
            <span>First published</span>
            <span className="text-ink">{formatDateTime(publishedAt)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span>Last saved</span>
          <span className="text-ink">{formatDateTime(updatedAt)}{updatedBy ? ` · ${updatedBy}` : ''}</span>
        </div>
      </div>
      {dirty && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200 ring-inset">You have unsaved edits.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onSave} loading={saving} disabled={!dirty || busy}>Save draft</Button>
        <Button onClick={onPreview} icon={<Eye />} disabled={saving || busy}>Preview</Button>
      </div>
      {canPublish && (
        <div className="space-y-2">
          <Button variant="primary" className="w-full" onClick={onPublish} loading={busy && !saving} disabled={saving || (live && !hasChanges && !dirty)} icon={<Send />}>
            {publishLabel}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<CalendarClock />} onClick={() => setScheduling(true)} disabled={saving || busy}>
              {status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
            </Button>
            {onUnpublish && (live || status === 'SCHEDULED') && (
              <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={onUnpublish} disabled={saving || busy}>
                {status === 'SCHEDULED' ? 'Cancel schedule' : unpublishLabel}
              </Button>
            )}
          </div>
        </div>
      )}
      {live && liveUrl && (
        <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline">
          View live <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
      {extra}
      <ScheduleDialog
        open={scheduling}
        busy={busy}
        onClose={() => setScheduling(false)}
        onSchedule={(iso) => {
          onSchedule(iso);
          setScheduling(false);
        }}
      />
    </div>
  );
}
