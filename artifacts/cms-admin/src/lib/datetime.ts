// Helpers for the event editor: it shows a plain date-and-time field plus a
// time-zone picker, and stores an offset-aware ISO string (what the public
// site and schema.org need), e.g. 2026-12-01T14:00:00+00:00.

// A short, practical list; the browser's own zone is added at the top.
export const COMMON_TIME_ZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Istanbul',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

export function timeZoneOptions(selected?: string): string[] {
  const local = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  })();
  const seen = new Set<string>();
  return [local, ...COMMON_TIME_ZONES, ...(selected ? [selected] : [])].filter((tz) => tz && !seen.has(tz) && seen.add(tz));
}

// The zone's UTC offset at a given instant, as "+01:00".
function offsetAt(timeZone: string, date: Date): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value;
    const match = name?.match(/GMT([+-]\d{2}:\d{2})/);
    return match ? match[1] : '+00:00';
  } catch {
    return '+00:00';
  }
}

// "2026-12-01T14:00" + "Europe/London" -> "2026-12-01T14:00:00+00:00".
export function toZonedIso(local: string, timeZone: string): string {
  if (!local) return '';
  // Approximate the instant to read the right offset (good enough off DST edges).
  const approx = new Date(`${local}:00Z`);
  const offset = offsetAt(timeZone, Number.isNaN(approx.getTime()) ? new Date() : approx);
  return `${local}:00${offset}`;
}

// "2026-12-01T14:00:00+00:00" + "Europe/London" -> "2026-12-01T14:00" (wall clock).
export function toLocalInput(iso: string | undefined, timeZone: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
  } catch {
    return '';
  }
}
