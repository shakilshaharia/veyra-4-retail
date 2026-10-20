// The Resources section: a listing at /resources with Blogs, Use Cases and
// Events (tabs, search, a solution filter and a featured card), and a detail
// page at /resources/{segment}/{slug}. Content comes from the CMS; the visual
// language is the site's own.

import type { PublicResource, PublicResourceSummary } from '@workspace/cms-content';
import { ArrowRight, ArrowUpRight, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORIES,
  type CategoryFilter,
  ctaLabel,
  eventActions,
  eventDuration,
  eventPhase,
  eventStatusLabel,
  filterResources,
  formatDate,
  formatEventDate,
  formatEventTime,
  hasActiveFilters,
  orderForListing,
  paginate,
  parseResourceQuery,
  type ResourceQuery,
  resourceMeta,
  SOLUTIONS,
  serializeResourceQuery,
  splitEvents,
  typeLabel,
} from './resources-content';

declare global {
  interface Window {
    __VEYRA_RESOURCE__?: PublicResource;
  }
}

function Cover({ r, eager = false }: { r: PublicResourceSummary; eager?: boolean }) {
  if (r.cover?.src) return <img className="cover" src={r.cover.src} alt={r.cover.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
  return <div className="cover cover--empty" aria-hidden="true"><span>{typeLabel(r)}</span></div>;
}

function ResourceCard({ r, now, headingLevel = 3 }: { r: PublicResourceSummary; now: number; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const meta = resourceMeta(r);
  return (
    <a href={r.path} className="resource-card">
      <Cover r={r} />
      <div className="resource-body">
        <p className="type-label">{typeLabel(r)}</p>
        <Heading>{r.title}</Heading>
        {r.summary && <p className="resource-summary">{r.summary}</p>}
        {r.type === 'EVENT' && r.event && <p className="status-pill">{eventStatusLabel(r.event, now)}</p>}
        {meta.length > 0 && <p className="resource-meta">{meta.join(' · ')}</p>}
        <span className="resource-cta">{ctaLabel(r)}<ArrowRight aria-hidden="true" /></span>
      </div>
    </a>
  );
}

function FeaturedCard({ r, now }: { r: PublicResourceSummary; now: number }) {
  return (
    <section className="container featured-wrap" aria-labelledby="featured-title">
      <article className="featured-card">
        <Cover r={r} eager />
        <div className="featured-text">
          <p className="type-label">Featured · {typeLabel(r)}</p>
          <h2 id="featured-title">{r.title}</h2>
          {r.summary && <p className="resource-summary">{r.summary}</p>}
          {r.type === 'EVENT' && r.event && <p className="status-pill">{eventStatusLabel(r.event, now)}</p>}
          <p className="resource-meta">{resourceMeta(r).join(' · ')}</p>
          <a className="button" href={r.path}>{ctaLabel(r)}<ArrowUpRight aria-hidden="true" /></a>
        </div>
      </article>
    </section>
  );
}

const DEBOUNCE = 250;

export function ResourcesList() {
  const [all, setAll] = useState<PublicResourceSummary[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState<ResourceQuery>(() => parseResourceQuery(window.location.search));
  const [text, setText] = useState(query.q);
  const timer = useRef<number | undefined>(undefined);
  const now = useMemo(() => Date.now(), [all]);

  useEffect(() => {
    fetch('/api/public/resources', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ items: PublicResourceSummary[] }>;
      })
      .then((data) => { setAll(data.items); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, []);

  // Keep the address bar in step so a filtered view can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.search = serializeResourceQuery(query);
    window.history.replaceState(null, '', url);
  }, [query]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const go = (next: Partial<ResourceQuery>) => setQuery((current) => ({ ...current, page: 1, ...next }));
  const onSearch = (value: string) => {
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go({ q: value }), DEBOUNCE);
  };
  const reset = () => { window.clearTimeout(timer.current); setText(''); setQuery({ category: 'all', q: '', solution: null, page: 1 }); };

  const list = all ?? [];
  const filtered = useMemo(() => orderForListing(filterResources(list, query), query.category, now), [list, query, now]);
  const paged = paginate(filtered, query.page);
  const active = hasActiveFilters(query);
  const featured = !active ? list.find((r) => r.featured) : undefined;
  const showSolutions = list.length > 0 && new Set(list.flatMap((r) => r.solutions)).size > 0;
  const grouped = query.category === 'events';
  const { upcoming, past, cancelled } = useMemo(() => splitEvents(paged.items, now), [paged.items, now]);

  const chips: { label: string; clear: () => void }[] = [];
  if (query.category !== 'all') chips.push({ label: CATEGORIES.find((c) => c.id === query.category)!.label, clear: () => go({ category: 'all' }) });
  if (query.solution) chips.push({ label: query.solution, clear: () => go({ solution: null }) });
  if (query.q.trim()) chips.push({ label: `Search: "${query.q.trim()}"`, clear: () => { setText(''); go({ q: '' }); } });

  const setPage = (p: number) => { setQuery((current) => ({ ...current, page: p })); document.getElementById('explore-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const grid = (items: PublicResourceSummary[]) => <ul className="resource-grid">{items.map((r) => <li key={`${r.type}-${r.slug}`}><ResourceCard r={r} now={now} /></li>)}</ul>;

  return (
    <>
      {featured && <FeaturedCard r={featured} now={now} />}

      <section className="container explore" aria-labelledby="explore-title">
        <h2 id="explore-title">Explore our resources</h2>
        <div className="filter-bar">
          <div className="segmented" role="group" aria-label="Resource category">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className="segment" aria-pressed={query.category === c.id} onClick={() => go({ category: c.id as CategoryFilter })}>{c.label}</button>
            ))}
          </div>
          <div className="filter-row">
            <div className="search-field">
              <label htmlFor="resource-search">Search resources</label>
              <div className="search-input"><Search aria-hidden="true" /><input id="resource-search" type="search" autoComplete="off" value={text} onChange={(e) => onSearch(e.target.value)} /></div>
            </div>
            {showSolutions && (
              <div className="search-field search-field--select">
                <label htmlFor="resource-solution">Solution</label>
                <select id="resource-solution" value={query.solution ?? ''} onChange={(e) => go({ solution: (e.target.value || null) as ResourceQuery['solution'] })}>
                  <option value="">All solutions</option>
                  {SOLUTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="result-bar">
          <p className="result-count">{status === 'ready' ? `${filtered.length} ${filtered.length === 1 ? 'resource' : 'resources'}` : status === 'error' ? '' : 'Loading…'}</p>
          {chips.map((c) => (
            <button key={c.label} type="button" className="chip" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}>{c.label}<X aria-hidden="true" /></button>
          ))}
          {active && <button type="button" className="link-button" onClick={reset}>Clear filters</button>}
        </div>

        {status === 'error' ? (
          <div className="empty-state"><h3>Resources could not be loaded</h3><p>Please refresh the page to try again.</p></div>
        ) : status === 'loading' ? (
          <p className="resource-status" role="status">Loading resources…</p>
        ) : list.length === 0 ? (
          <div className="empty-state">
            <h3>Resources coming soon</h3>
            <p>We’re preparing articles, use cases, and events. In the meantime, tell us what you’d like to improve.</p>
            <a className="button" href="/contact">Talk to our team<ArrowUpRight aria-hidden="true" /></a>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No resources match your search</h3>
            <p>Try a different word, or remove some filters.</p>
            <button className="button button--dark" type="button" onClick={reset}>Clear filters</button>
          </div>
        ) : grouped ? (
          <>
            {upcoming.length > 0 && <><h3 className="group-title">Upcoming events</h3>{grid(upcoming)}</>}
            {past.length > 0 && <><h3 className="group-title">Past events and recordings</h3>{grid(past)}</>}
            {cancelled.length > 0 && <><h3 className="group-title">Cancelled events</h3>{grid(cancelled)}</>}
          </>
        ) : grid(paged.items)}

        {paged.totalPages > 1 && (
          <nav className="pagination" aria-label="Pagination">
            {paged.page > 1 && <button type="button" onClick={() => setPage(paged.page - 1)}>Previous</button>}
            {Array.from({ length: paged.totalPages }, (_, i) => i + 1).map((p) => (
              <button type="button" key={p} aria-current={p === paged.page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>
            ))}
            {paged.page < paged.totalPages && <button type="button" onClick={() => setPage(paged.page + 1)}>Next</button>}
          </nav>
        )}
      </section>

      <section className="closing-section" aria-labelledby="resources-cta-title">
        <div className="closing-panel">
          <h2 id="resources-cta-title">Put these ideas to work.</h2>
          <p>Explore how Veyra can support your customer journeys.</p>
          <a className="button button--white" href="/contact">Talk to our team<ArrowUpRight aria-hidden="true" /></a>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function Facts({ items }: { items: [string, string | undefined][] }) {
  const rows = items.filter((i): i is [string, string] => Boolean(i[1]));
  if (rows.length === 0) return null;
  return <dl className="facts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return <section className="detail-section"><h2>{title}</h2><ul>{items.map((i) => <li key={i}>{i}</li>)}</ul></section>;
}

function BlogBody({ r }: { r: PublicResource }) {
  return (
    <>
      <header className="detail-head">
        <p className="eyebrow">{typeLabel(r)}</p>
        <h1>{r.title}</h1>
        {r.summary && <p className="page-lede">{r.summary}</p>}
        <p className="resource-meta">{[r.author && `By ${r.author}`, `Published ${formatDate(r.publishedAt)}`, `${r.readingMinutes ?? 1} min read`].filter(Boolean).join(' · ')}</p>
      </header>
      {r.cover?.src && <Cover r={r} eager />}
      {/* Sanitised on the server when the article is saved. */}
      <div className="article cms-prose" dangerouslySetInnerHTML={{ __html: r.html }} />
    </>
  );
}

function UseCaseBody({ r }: { r: PublicResource }) {
  const uc = r.useCase;
  return (
    <>
      <header className="detail-head">
        <p className="eyebrow">{typeLabel(r)}</p>
        <h1>{r.title}</h1>
        {r.summary && <p className="page-lede">{r.summary}</p>}
        <Facts items={[['Industry', uc?.industry], ['Solution', r.solutions.join(', ') || undefined]]} />
        {uc && !uc.customerStory && <p className="review-note">This is a general explanation of how Veyra can be applied, not a customer success story.</p>}
      </header>
      {r.cover?.src && <Cover r={r} eager />}
      <div className="article">
        {uc?.challenge && <section className="detail-section"><h2>Business challenge</h2><p>{uc.challenge}</p></section>}
        <List title="How the solution is applied" items={uc?.approach} />
        <List title="Benefits" items={uc?.benefits} />
        <List title="Verified outcomes" items={uc?.verifiedOutcomes} />
      </div>
    </>
  );
}

function EventBody({ r, now }: { r: PublicResource; now: number }) {
  const e = r.event;
  if (!e) return <header className="detail-head"><h1>{r.title}</h1></header>;
  const phase = eventPhase(e, now);
  const actions = eventActions(e, now);
  return (
    <>
      <header className="detail-head">
        <p className="eyebrow">{typeLabel(r)}</p>
        <h1>{r.title}</h1>
        {r.summary && <p className="page-lede">{r.summary}</p>}
        <p className="status-pill">{eventStatusLabel(e, now)}</p>
        <Facts items={[['Date', formatEventDate(e)], ['Time and time zone', `${formatEventTime(e)} (${e.timeZone})`], ['Duration', eventDuration(e)], ['Format', e.format], ['Location', e.location || undefined]]} />
        <div className="detail-actions">
          {actions.register && <a className="button" href={actions.register}>Register<ArrowUpRight aria-hidden="true" /></a>}
          {actions.recording && <a className="button" href={actions.recording}>Watch recording<ArrowUpRight aria-hidden="true" /></a>}
          {phase === 'cancelled' && <p className="notice notice--warn">This event has been cancelled.</p>}
          {phase === 'upcoming' && e.registrationStatus === 'closed' && <p className="notice">Registration for this event is closed.</p>}
        </div>
      </header>
      {r.cover?.src && <Cover r={r} eager />}
      <div className="article">
        {e.audience && <section className="detail-section"><h2>Who it’s for</h2><p>{e.audience}</p></section>}
        <List title="What you’ll learn" items={e.learn} />
        {e.agenda.length > 0 && <section className="detail-section"><h2>Agenda</h2><ol className="agenda">{e.agenda.map((a) => <li key={a.title}>{a.time && <strong>{a.time}</strong>} {a.title}</li>)}</ol></section>}
        {e.speakers.length > 0 && <section className="detail-section"><h2>Speakers</h2><ul>{e.speakers.map((s) => <li key={s.name}><strong>{s.name}</strong>{s.role ? `, ${s.role}` : ''}</li>)}</ul></section>}
      </div>
    </>
  );
}

export function ResourceView({ segment, slug }: { segment: string; slug: string }) {
  const preview = new URLSearchParams(window.location.search).get('preview') === '1';
  const embedded = !preview && window.__VEYRA_RESOURCE__?.slug === slug && window.__VEYRA_RESOURCE__?.segment === segment ? window.__VEYRA_RESOURCE__ : undefined;
  const [resource, setResource] = useState<PublicResource | null>(embedded ?? null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>(embedded ? 'ready' : 'loading');
  const now = useMemo(() => Date.now(), [resource]);

  useEffect(() => {
    if (embedded) return;
    fetch(`/api/public/resources/${encodeURIComponent(segment)}/${encodeURIComponent(slug)}${preview ? '?preview=1' : ''}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (response.status === 404) return setStatus('missing');
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { resource: PublicResource };
        setResource(data.resource);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, slug]);

  useEffect(() => {
    if (resource) document.title = resource.seo.seoTitle || `${resource.title} | Veyra`;
  }, [resource]);

  if (status === 'loading') return <p className="container resource-status" role="status">Loading…</p>;
  if (status === 'missing' || status === 'error' || !resource) {
    return (
      <section className="container page-intro">
        <p className="eyebrow">RESOURCES</p>
        <h1>{status === 'error' ? 'This resource could not be loaded.' : 'We couldn’t find that resource.'}</h1>
        <p className="page-lede">It may have been unpublished or the address may be wrong. <a href="/resources">Back to Resources</a></p>
      </section>
    );
  }

  const crumbLabel = resource.type === 'USE_CASE' ? 'Use Cases' : resource.type === 'BLOG' ? 'Blogs' : 'Events';
  return (
    <div className="container detail">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="/resources">Resources</a></li>
          <li><a href={`/resources?category=${resource.segment}`}>{crumbLabel}</a></li>
          <li aria-current="page">{resource.title}</li>
        </ol>
      </nav>

      {resource.type === 'BLOG' ? <BlogBody r={resource} /> : resource.type === 'USE_CASE' ? <UseCaseBody r={resource} /> : <EventBody r={resource} now={now} />}

      {resource.tags.length > 0 && (
        <ul className="post-tags" aria-label="Tags">{resource.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
      )}

      <aside className="detail-cta" aria-label="Next step">
        <h2>{resource.type === 'EVENT' ? 'Questions about Veyra?' : 'Want to see how this applies to you?'}</h2>
        <p>Tell us what you’re looking to improve and we’ll connect you with the right person.</p>
        <a className="button" href="/contact">Talk to our team<ArrowUpRight aria-hidden="true" /></a>
      </aside>

      {resource.related.length > 0 && (
        <section className="related" aria-labelledby="related-title">
          <h2 id="related-title">Related resources</h2>
          <ul className="resource-grid">{resource.related.map((o) => <li key={`${o.type}-${o.slug}`}><ResourceCard r={o} now={now} /></li>)}</ul>
        </section>
      )}

      <p className="back-link"><a href="/resources">Back to all Resources</a></p>
    </div>
  );
}
