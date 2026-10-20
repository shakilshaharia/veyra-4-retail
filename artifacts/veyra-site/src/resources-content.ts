// Client-side filtering, ordering and formatting for the Resources listing.
// The CMS returns every published resource; the browser does the rest, exactly
// like the reference design (tabs, search, solution filter, events grouping).

import type { EventDetails, PublicResourceSummary, SolutionName } from '@workspace/cms-content';

export type CategoryFilter = 'all' | 'blogs' | 'use-cases' | 'events';
export type ResourceQuery = { category: CategoryFilter; q: string; solution: SolutionName | null; page: number };

export const PAGE_SIZE = 9;
export const SOLUTIONS: SolutionName[] = ['Veyra Online', 'Veyra In-Person', 'Cerin'];
const SOLUTION_SLUG: Record<SolutionName, string> = { 'Veyra Online': 'veyra-online', 'Veyra In-Person': 'veyra-in-person', Cerin: 'cerin' };

export const CATEGORIES: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'blogs', label: 'Blogs' },
  { id: 'use-cases', label: 'Use Cases' },
  { id: 'events', label: 'Events' },
];

const CTA: Record<string, string> = { BLOG: 'Read article', USE_CASE: 'Explore use case', EVENT: 'View event' };
export function ctaLabel(r: PublicResourceSummary): string {
  return CTA[r.type] ?? 'Open';
}
export function typeLabel(r: PublicResourceSummary): string {
  if (r.type === 'USE_CASE') return r.useCase?.customerStory ? 'Customer story' : 'Use case';
  return r.type === 'BLOG' ? 'Blog' : 'Event';
}

/* ---------- dates ---------- */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}
export function formatEventDate(e: EventDetails): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: e.timeZone, weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(e.startsAt));
}
export function formatEventTime(e: EventDetails): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: e.timeZone, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(e.startsAt));
}
export function eventDuration(e: EventDetails): string | undefined {
  const mins = e.durationMinutes ?? (e.endsAt ? Math.round((Date.parse(e.endsAt) - Date.parse(e.startsAt)) / 60000) : 0);
  if (!mins || mins < 0) return undefined;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

/* ---------- events ---------- */
export type EventPhase = 'upcoming' | 'past' | 'cancelled';
function isHttpUrl(u?: string): u is string {
  if (!u) return false;
  try {
    return /^https?:$/.test(new URL(u).protocol);
  } catch {
    return false;
  }
}
function eventEnd(e: EventDetails): number {
  const start = Date.parse(e.startsAt);
  if (e.endsAt) return Date.parse(e.endsAt);
  if (e.durationMinutes) return start + e.durationMinutes * 60000;
  return start;
}
export function eventPhase(e: EventDetails, now: number = Date.now()): EventPhase {
  if (e.registrationStatus === 'cancelled') return 'cancelled';
  return eventEnd(e) > now ? 'upcoming' : 'past';
}
export function eventStatusLabel(e: EventDetails, now: number = Date.now()): string {
  const phase = eventPhase(e, now);
  if (phase === 'cancelled') return 'Cancelled';
  if (phase === 'past') return isHttpUrl(e.recordingUrl) ? 'Past event — recording available' : 'Past event';
  if (Date.parse(e.startsAt) <= now) return 'Event in progress';
  return e.registrationStatus === 'open' ? 'Registration open' : 'Registration closed';
}
export function eventActions(e: EventDetails, now: number = Date.now()): { register?: string; recording?: string } {
  const phase = eventPhase(e, now);
  return {
    register: phase === 'upcoming' && Date.parse(e.startsAt) > now && e.registrationStatus === 'open' && isHttpUrl(e.registrationUrl) ? e.registrationUrl : undefined,
    recording: phase === 'past' && isHttpUrl(e.recordingUrl) ? e.recordingUrl : undefined,
  };
}
export function splitEvents(list: PublicResourceSummary[], now: number = Date.now()) {
  const events = list.filter((r) => r.type === 'EVENT' && r.event) as (PublicResourceSummary & { event: EventDetails })[];
  const by = (phase: EventPhase) => events.filter((r) => eventPhase(r.event, now) === phase);
  return {
    upcoming: by('upcoming').sort((a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt)),
    past: by('past').sort((a, b) => Date.parse(b.event.startsAt) - Date.parse(a.event.startsAt)),
    cancelled: by('cancelled').sort((a, b) => Date.parse(b.event.startsAt) - Date.parse(a.event.startsAt)),
  };
}

/* ---------- ordering and meta ---------- */
function resourceDate(r: PublicResourceSummary): string {
  return r.type === 'EVENT' && r.event ? r.event.startsAt : r.publishedAt;
}
export function sortResources(list: PublicResourceSummary[]): PublicResourceSummary[] {
  return [...list].sort((a, b) => Date.parse(resourceDate(b)) - Date.parse(resourceDate(a)));
}
export function resourceMeta(r: PublicResourceSummary): string[] {
  if (r.type === 'BLOG') return [formatDate(r.publishedAt), `${r.readingMinutes ?? 1} min read`];
  if (r.type === 'USE_CASE') return [r.useCase?.industry ?? '', ...r.solutions].filter(Boolean);
  if (r.event) return [formatEventDate(r.event), formatEventTime(r.event), r.event.format, ...(r.event.location && r.event.format !== 'Virtual' ? [r.event.location] : [])];
  return [];
}

/* ---------- filtering / URL state ---------- */
export const DEFAULT_QUERY: ResourceQuery = { category: 'all', q: '', solution: null, page: 1 };
export function parseResourceQuery(search: string): ResourceQuery {
  const p = new URLSearchParams(search);
  const c = p.get('category');
  const category: CategoryFilter = c === 'blogs' || c === 'use-cases' || c === 'events' ? c : 'all';
  const s = p.get('solution');
  const solution = SOLUTIONS.find((n) => SOLUTION_SLUG[n] === s) ?? null;
  const rawPage = Number(p.get('page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { category, q: (p.get('q') ?? '').slice(0, 120), solution, page };
}
export function serializeResourceQuery(query: Partial<ResourceQuery>): string {
  const p = new URLSearchParams();
  if (query.category && query.category !== 'all') p.set('category', query.category);
  const q = query.q?.trim();
  if (q) p.set('q', q);
  if (query.solution) p.set('solution', SOLUTION_SLUG[query.solution]);
  if (query.page && query.page > 1) p.set('page', String(query.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}
export function hasActiveFilters(q: ResourceQuery): boolean {
  return q.category !== 'all' || q.q.trim() !== '' || q.solution !== null;
}
export function filterResources(list: PublicResourceSummary[], query: ResourceQuery): PublicResourceSummary[] {
  const needle = query.q.trim().toLowerCase();
  return list.filter((r) => {
    if (query.category !== 'all' && r.segment !== query.category) return false;
    if (query.solution && !r.solutions.includes(query.solution)) return false;
    if (needle && ![r.title, r.summary, ...r.tags].some((t) => t.toLowerCase().includes(needle))) return false;
    return true;
  });
}
export function orderForListing(list: PublicResourceSummary[], category: CategoryFilter, now: number = Date.now()): PublicResourceSummary[] {
  if (category === 'events') {
    const { upcoming, past, cancelled } = splitEvents(list, now);
    return [...upcoming, ...past, ...cancelled];
  }
  return sortResources(list);
}
export function paginate<T>(items: T[], page: number, size: number = PAGE_SIZE): { items: T[]; page: number; totalPages: number; total: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Number.isSafeInteger(page) ? Math.max(1, page) : 1, totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, totalPages, total: items.length };
}
