import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Database,
  Headphones,
  Menu,
  Minus,
  Monitor,
  Package,
  Plus,
  ShoppingCart,
  Store,
  Users,
  X,
} from 'lucide-react';
import type {
  ContactFormSection,
  ExperiencesSection,
  FaqSection,
  HeroSection,
  IconName,
  LegacyMark,
  PageIntroSection,
  PlatformSection,
  PublicMenuItem,
  PublicPage,
  RichTextSection,
  Section,
  TestimonialsSection,
  TrustSection,
  WithId,
  Product,
} from '@workspace/cms-content';
import { ErrorBoundary } from '@/components/error-boundary';
import { FeatureMedia } from '@/components/feature-media';
import { SiteProvider, currentPath, useCollections, useCopyright, useMenu, useSettings, useSite } from '@/cms';
import { ResourceView, ResourcesList } from '@/resources';

type Experience = WithId<Product>;

function sectionOf<T extends Section['type']>(page: PublicPage | null, type: T) {
  return page?.sections.find((section): section is Extract<Section, { type: T }> => section.type === type && section.visible);
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return reduced;
}

function useNarrowProductLayout() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 959px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 959px)');
    const change = () => setNarrow(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return narrow;
}

function Brand({ footer = false }: { footer?: boolean }) {
  const { siteName, logo } = useSettings();
  return (
    <a className={`brand-word${footer ? ' footer-brand' : ''}`} href="#top" aria-label={`${siteName} home`} data-testid={footer ? 'link-veyra-home-footer' : 'link-veyra-home-header'}>
      {logo.url && <img className="brand-avatar" src={logo.url} alt={logo.alt} />}
      <span className="brand-name">{siteName}</span>
    </a>
  );
}

function DemoButton({ className = '', label, testId = 'button-demo', onOpen }: { className?: string; label?: string; testId?: string; onOpen: () => void }) {
  const { demo } = useSettings();
  const text = label || demo.ctaLabel;
  if (demo.mode === 'url' && demo.url) {
    const external = /^https?:\/\//i.test(demo.url);
    return <a className={`button ${className}`} href={demo.url} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} data-testid={`${testId}-link`}>{text}<ArrowUpRight aria-hidden="true" /></a>;
  }
  return <button className={`button ${className}`} type="button" onClick={onOpen} data-testid={testId}>{text}<ArrowUpRight aria-hidden="true" /></button>;
}

// A stable test id from a link target: "#results" -> "results", "/contact" -> "contact".
function linkKey(item: PublicMenuItem) {
  const fromUrl = item.url.replace(/^\/?#/, '').replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return fromUrl || item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function isCurrent(url: string) {
  if (url.includes('#') || /^https?:/i.test(url)) return false;
  return (url.replace(/\/+$/, '') || '/') === currentPath();
}

function MenuLink({ item, kind, onNavigate }: { item: PublicMenuItem; kind: 'nav' | 'footer'; onNavigate?: () => void }) {
  return (
    <a
      href={item.url}
      onClick={onNavigate}
      aria-current={isCurrent(item.url) ? 'page' : undefined}
      {...(item.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      data-testid={`link-${kind}-${linkKey(item)}`}
    >
      {item.label}
    </a>
  );
}

// Items with children render as a dropdown. The shipped menus have none, so
// this only appears once an editor nests an item in the menu manager.
function MenuLinks({ items, kind, onNavigate }: { items: PublicMenuItem[]; kind: 'nav' | 'footer'; onNavigate?: () => void }) {
  return (
    <>
      {items.map((item) =>
        item.children.length ? (
          <div className="nav-dropdown" key={item.id}>
            <MenuLink item={item} kind={kind} onNavigate={onNavigate} />
            <div className="nav-submenu">
              {item.children.map((child) => (
                <MenuLink key={child.id} item={child} kind={kind} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ) : (
          <MenuLink key={item.id} item={item} kind={kind} onNavigate={onNavigate} />
        ),
      )}
    </>
  );
}

const hiddenHomeHeaderLabels = new Set(['Results', 'Experiences', 'Platform', 'Customer stories']);

function Navigation({ onDemo }: { onDemo: () => void }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const closeMenu = () => setOpen(false);
  const menu = useMenu('home-header');
  const visibleItems = menu.items.filter((item) => !hiddenHomeHeaderLabels.has(item.label));
  return (
    <header className="site-nav">
      {/* A tap outside the stacked menu closes it, as on any phone menu. */}
      {open && <button className="nav-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={closeMenu} />}
      <div className="container nav-inner">
        <Brand />
        {visibleItems.length > 0 && (
          <nav id="primary-navigation" className={`nav-links${open ? ' is-open' : ''}`} aria-label="Main navigation">
            <MenuLinks items={visibleItems} kind="nav" onNavigate={closeMenu} />
          </nav>
        )}
        <div className="nav-actions">
          {menu.cta.enabled && <DemoButton className="nav-demo" label={menu.cta.label} testId="button-demo-nav" onOpen={onDemo} />}
          {visibleItems.length > 0 && (
            <button
              ref={toggleRef}
              className="mobile-toggle"
              type="button"
              aria-expanded={open}
              aria-controls="primary-navigation"
              aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setOpen((value) => !value)}
              data-testid="button-mobile-menu"
            >
              {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ section, motionEnabled, onDemo }: { section: HeroSection; motionEnabled: boolean; onMotionToggle: () => void; onDemo: () => void }) {
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [videoFailed, setVideoFailed] = useState(false);
  const shouldPlay = motionEnabled && !reducedMotion && heroVisible && pageVisible;
  const hasVideo = Boolean(section.video.webm || section.video.mp4);
  const stillImage = section.fallbackImage || section.video.poster;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [videoFailed]);

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || videoFailed) return;
    if (shouldPlay) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [shouldPlay, videoFailed]);

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      {videoFailed || !hasVideo ? (
        stillImage && <img className="background-video hero-video" src={stillImage} alt="" />
      ) : (
        <video
          ref={videoRef}
          className="background-video hero-video"
          poster={section.video.poster || undefined}
          autoPlay={shouldPlay}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          data-testid="video-hero"
          onCanPlay={() => {
            if (shouldPlay) videoRef.current?.play().catch(() => undefined);
          }}
          onError={() => setVideoFailed(true)}
        >
          {section.video.webm && <source src={section.video.webm} type="video/webm" />}
          {section.video.mp4 && <source src={section.video.mp4} type="video/mp4" />}
        </video>
      )}
      <div className="container hero-inner">
        <div className="hero-copy reveal">
          {section.eyebrow && <p className="eyebrow">{section.eyebrow}</p>}
          <h1 id="hero-title">{section.heading}</h1>
          {section.body && <p>{section.body}</p>}
          <DemoButton className="button--white hero-demo" label={section.ctaLabel} testId="button-demo-hero" onOpen={onDemo} />
        </div>
      </div>
    </section>
  );
}

// The hand-built wordmarks the trust strip shipped with, kept pixel-for-pixel.
const legacyMarkContent: Record<LegacyMark, ReactNode> = {
  pulse: <><span className="pulse-mark" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span><strong>Pulse</strong></>,
  craftgram: <><span className="craftgram-mark" aria-hidden="true"><i /><i /><i /><i /></span><strong>Craftgram</strong></>,
  swift: <><strong>swift</strong><span className="swift-mark" aria-hidden="true"><i /><i /></span></>,
  sparkle: <><strong>sparkle</strong><sup>TM</sup></>,
  techtide: <><span className="techtide-mark" aria-hidden="true" /><strong>techtide</strong></>,
  lum: <><strong>Lum</strong><span className="lum-mark" aria-hidden="true"><i /></span><strong>Labs</strong></>,
  innovio: <><span className="innovio-mark" aria-hidden="true" /><strong>innovio</strong></>,
};

function TrustSection({ section }: { section: TrustSection }) {
  const { logos } = useCollections();
  const logoGroup = (duplicate: boolean) => (
    <div className="trust-logos-group" aria-hidden={duplicate || undefined}>
      {logos.map((logo) =>
        logo.imageUrl ? (
          <div className="trust-logo trust-logo--image" aria-label={duplicate ? undefined : logo.name} key={`${duplicate ? 'duplicate-' : ''}${logo.id}`}>
            <img src={logo.imageUrl} alt={duplicate ? '' : logo.name} />
          </div>
        ) : (
          <div className={`trust-logo${logo.legacyMark ? ` trust-logo--${logo.legacyMark}` : ''}`} aria-label={duplicate ? undefined : logo.name} key={`${duplicate ? 'duplicate-' : ''}${logo.id}`}>
            {logo.legacyMark ? legacyMarkContent[logo.legacyMark] : <strong>{logo.name}</strong>}
          </div>
        ),
      )}
    </div>
  );
  return (
    <section className="trust-section" aria-label="Customer and partner trust">
      <div className="container">
        <p className="trust-title">{section.headline}</p>
        {logos.length > 0 && (
          <div className="trust-logos" aria-label="Trusted brands">
            <div className="trust-logos-track">
              {logoGroup(false)}
              {logoGroup(true)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Metrics() {
  const { metrics } = useCollections();
  if (metrics.length === 0) return null;
  return (
    <section className="metrics-section" id="results" aria-labelledby="metrics-title">
      <div className="container" id="metrics-title">
        <div className="metrics-grid">
          {metrics.map((metric, index) => (
            <article className="metric" key={metric.id} data-testid={`metric-result-${index + 1}`}>
              <strong data-testid={`value-result-${index + 1}`}>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureShowcase({
  experience,
  cardIndex,
  motionEnabled,
  reducedMotion,
  active,
  onDemo,
}: {
  experience: Experience;
  cardIndex: number;
  motionEnabled: boolean;
  reducedMotion: boolean;
  active: boolean;
  onDemo: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const narrowProductLayout = useNarrowProductLayout();
  const [elapsed, setElapsed] = useState(0);
  const [autoPlay, setAutoPlay] = useState(!reducedMotion);
  const [intersecting, setIntersecting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [videoNear, setVideoNear] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = experience.features[selectedIndex];
  const rotationActive = autoPlay && motionEnabled && !reducedMotion && intersecting && active && !focused && pageVisible;

  useEffect(() => {
    // Small matching posters are warm before a manual/automatic feature switch.
    experience.features.forEach((feature) => {
      const poster = feature.video.poster;
      if (poster) {
        const image = new Image();
        image.src = poster;
      }
    });
  }, [experience]);

  useEffect(() => {
    if (reducedMotion) {
      setAutoPlay(false);
      setElapsed(0);
    }
  }, [reducedMotion]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    // Measure only on layout changes; scrolling never writes card positions.
    const measureHeight = () => {
      const height = `${card.offsetHeight}px`;
      if (card.style.getPropertyValue('--experience-height') !== height) {
        card.style.setProperty('--experience-height', height);
      }
    };
    measureHeight();
    const observer = new ResizeObserver(measureHeight);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting && entry.intersectionRatio > 0.25), { threshold: [0, 0.25, 0.5] });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVideoNear(entry.isIntersecting), { rootMargin: '320px 0px', threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!rotationActive) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => {
        if (value + 100 >= 10000) {
          setSelectedIndex((index) => (index + 1) % experience.features.length);
          return 0;
        }
        return value + 100;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [rotationActive, experience.features.length]);

  const chooseFeature = (index: number) => {
    setSelectedIndex(index);
    setElapsed(0);
  };
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % experience.features.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + experience.features.length) % experience.features.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = experience.features.length - 1;
    else return;
    event.preventDefault();
    chooseFeature(nextIndex);
    tabRefs.current[nextIndex]?.focus();
    tabRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const featureCopy = (
    <div className="feature-panel">
      <h4>{selected.heading}</h4>
      <p className="feature-body">{selected.body}</p>
      <div className="feature-impact">{selected.impact}</div>
      <DemoButton className="button--dark" label={experience.ctaLabel} testId={`button-demo-feature-${cardIndex + 1}`} onOpen={onDemo} />
    </div>
  );
  return (
    <article
      ref={cardRef}
      className="experience-card"
      id={`product-${experience.anchorId || experience.id}`}
      data-stack={cardIndex}
      data-active={active}
      data-rotating={rotationActive}
      data-testid={`experience-card-${cardIndex + 1}`}
      onPointerDownCapture={() => setFocused(false)}
      onKeyDownCapture={() => setFocused(true)}
      onFocusCapture={(event) => setFocused((event.target as HTMLElement).matches(':focus-visible'))}
      onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFocused(false);
          }
      }}
    >
      <div className="experience-intro">
        <div className="experience-kicker">{experience.kicker}</div>
        <div>
          <h3>{experience.introTitle}</h3>
          <p>{experience.introBody}</p>
        </div>
      </div>
      <div className="feature-toolbar">
        <div className="tabs-row" role="tablist" aria-label={`${experience.name} features`}>
          {experience.features.map((feature, index) => (
            <button
              key={feature.id}
              ref={(element) => { tabRefs.current[index] = element; }}
              id={`feature-tab-${cardIndex}-${index}`}
              className="feature-tab"
              type="button"
              role="tab"
              aria-selected={selectedIndex === index}
              aria-controls={`feature-panel-${cardIndex}`}
              tabIndex={selectedIndex === index ? 0 : -1}
              onClick={() => chooseFeature(index)}
              onKeyDown={(event) => handleTabKey(event, index)}
              data-testid={`tab-feature-${cardIndex + 1}-${index + 1}`}
            >
              {feature.label}
              <span className="tab-progress" aria-hidden="true" style={{ '--progress': `${selectedIndex === index && rotationActive ? (elapsed / 10000) * 100 : 0}%` } as CSSProperties} />
            </button>
          ))}
        </div>
      </div>
      <div
        className="feature-surface"
        role="tabpanel"
        id={`feature-panel-${cardIndex}`}
        aria-labelledby={`feature-tab-${cardIndex}-${selectedIndex}`}
        data-testid={`panel-feature-${cardIndex + 1}`}
      >
        <div className="stage" ref={stageRef}>
          <FeatureMedia
            key={selected.id}
            source={selected.video.mp4 || undefined}
            webm={selected.video.webm || undefined}
            poster={selected.video.poster || undefined}
            label={selected.label}
            motionEnabled={motionEnabled}
            playing={motionEnabled && intersecting && active && videoNear && pageVisible}
            near={videoNear}
          />
          {!narrowProductLayout && featureCopy}
        </div>
        {narrowProductLayout && featureCopy}
      </div>
    </article>
  );
}

function Experiences({ section, motionEnabled, onDemo }: { section: ExperiencesSection; motionEnabled: boolean; onDemo: () => void }) {
  const { products: experiences } = useCollections();
  const reducedMotion = useReducedMotion();
  const stackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const cards = Array.from(stackRef.current?.querySelectorAll<HTMLElement>('.experience-card') ?? []);
      const rects = cards.map((card) => card.getBoundingClientRect());
      // The header is absolutely positioned, so once it scrolls away its bottom
      // is far negative. Clamping to the viewport keeps that from passing as the
      // top of the visible area, which counted off-screen cards as fully exposed.
      const navBottom = Math.max(0, document.querySelector('.site-nav')?.getBoundingClientRect().bottom ?? 0);
      let best = -1;
      let largest = 100;
      rects.forEach((rect, index) => {
        const top = Math.max(navBottom, rect.top);
        const bottom = Math.min(window.innerHeight, rect.bottom);
        // Later opaque cards occlude earlier ones. Count actual exposed height,
        // not IntersectionObserver intersections of covered sticky cards.
        let visible = Math.max(0, bottom - top);
        const occluding = rects.slice(index + 1).filter((later) => later.left < rect.right && later.right > rect.left);
        let coveredUntil = top;
        occluding.sort((a, b) => a.top - b.top).forEach((later) => {
          const start = Math.max(top, coveredUntil, later.top);
          const end = Math.min(bottom, later.bottom);
          if (end > start) { visible -= end - start; coveredUntil = end; }
        });
        if (visible >= largest) { best = index; largest = visible; }
      });
      setActiveIndex(best);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    if (stackRef.current) observer.observe(stackRef.current);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
      <section className="experience-section" id="experiences" aria-label={section.ariaLabel || undefined}>
       <div className="experience-stack" ref={stackRef}>
         {experiences.map((experience, index) => (
           <Fragment key={experience.id}>
             {experience.bridge && <p className="bridge-line">{experience.bridge}</p>}
             <span id={experience.anchorId || experience.id} className="product-anchor" aria-hidden="true" />
             <FeatureShowcase
               experience={experience}
               cardIndex={index}
               motionEnabled={motionEnabled}
               reducedMotion={reducedMotion}
               active={activeIndex === index}
               onDemo={onDemo}
             />
           </Fragment>
         ))}
      </div>
    </section>
  );
}

function PlatformDiagram({ section, onDemo }: { section: PlatformSection; onDemo: () => void }) {
  return (
    <section className="diagram-section" id="platform" aria-labelledby="platform-title">
      <div className="container">
        <header className="section-heading platform-heading">
          <h2 id="platform-title">{section.heading}</h2>
          {section.body && <p>{section.body}</p>}
          {section.ctaLabel && <DemoButton label={section.ctaLabel} testId="button-demo-platform" onOpen={onDemo} />}
        </header>
        {section.diagram.url && (
          <div className="platform-artwork">
            <img src={section.diagram.url} alt={section.diagram.alt} />
          </div>
        )}
        {/* The wide artwork cannot stay legible at phone width, so the same map
            runs vertically there. Exactly one of the two is ever displayed. */}
        <PlatformMap section={section} />
      </div>
    </section>
  );
}

const platformIcons: Record<IconName, typeof ShoppingCart> = {
  'shopping-cart': ShoppingCart,
  store: Store,
  headphones: Headphones,
  users: Users,
  monitor: Monitor,
  database: Database,
  package: Package,
};

function PlatformMap({ section }: { section: PlatformSection }) {
  return (
    <div className="platform-map">
      <ol className="platform-journey">
        {section.stages.map(({ id, name, detail, icon, tone }) => {
          const Icon = platformIcons[icon];
          return (
            <li className="platform-stage" key={id} data-tone={tone}>
              <span className="platform-node"><Icon aria-hidden="true" /></span>
              <span className="platform-stage-copy">
                <strong>{name}</strong>
                <span>{detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {section.mapNote && <p className="platform-map-note">{section.mapNote}</p>}
      {section.systemsLabel && <p className="platform-systems-label">{section.systemsLabel}</p>}
      <ul className="platform-systems">
        {section.systems.map(({ id, name, icon, tone }) => {
          const Icon = platformIcons[icon];
          return <li key={id} data-tone={tone}><Icon aria-hidden="true" />{name}</li>;
        })}
      </ul>
    </div>
  );
}

function Testimonials({ section }: { section: TestimonialsSection }) {
  const { testimonials } = useCollections();
  if (testimonials.length === 0) return null;
  return <TestimonialCarousel heading={section.heading} testimonials={testimonials} />;
}

function TestimonialCarousel({ heading, testimonials }: { heading: string; testimonials: ReturnType<typeof useCollections>['testimonials'] }) {
  const [active, setActive] = useState(0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const previous = (active - 1 + testimonials.length) % testimonials.length;
  const next = (active + 1) % testimonials.length;
  const visible = [previous, active, next];
  const step = (direction: number) =>
    setActive((index) => (index + direction + testimonials.length) % testimonials.length);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  };
  // Touch users expect to swipe a carousel; the arrows stay for everyone else.
  const onTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    // A mostly vertical drag is the page scrolling, not a swipe.
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(touch.clientY - start.y)) return;
    step(deltaX < 0 ? 1 : -1);
  };
  return (
    <section className="testimonials-section" id="stories" aria-labelledby="stories-title">
      <div className="container section-heading">
        <h2 id="stories-title">{heading}</h2>
      </div>
      <div
        className="testimonial-window"
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-roledescription="carousel"
        aria-label="Customer stories"
      >
        <div className="testimonial-track">
          {visible.map((storyIndex, slot) => {
            const story = testimonials[storyIndex];
            const isActive = storyIndex === active;
            return (
              // The neighbours are decorative peeks; only the centred story is announced.
              <article
                key={`${storyIndex}-${slot}`}
                className={`testimonial-card${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'true' : undefined}
                aria-hidden={isActive ? undefined : true}
                aria-label={isActive ? `Story ${storyIndex + 1} of ${testimonials.length}` : undefined}
              >
                <span className="testimonial-quote-mark" aria-hidden="true">“</span>
                <blockquote data-testid={isActive ? `text-story-quote-${storyIndex + 1}` : undefined}>{story.quote}</blockquote>
                <div className="testimonial-person"><strong>{story.role}</strong><br />{story.segment}</div>
                <div className="testimonial-outcome">
                  <strong data-testid={isActive ? `text-story-outcome-${storyIndex + 1}` : undefined}>{story.outcome}</strong>
                  <span>{story.explanation}</span>
                </div>
              </article>
            );
          })}
        </div>
        <div className="carousel-controls">
          <button type="button" aria-label="Previous customer story" onClick={() => setActive(previous)} data-testid="button-story-previous"><ArrowLeft aria-hidden="true" /></button>
          <span className="carousel-status" aria-hidden="true">{String(active + 1).padStart(2, '0')} / {String(testimonials.length).padStart(2, '0')}</span>
          <button type="button" aria-label="Next customer story" onClick={() => setActive(next)} data-testid="button-story-next"><ArrowRight aria-hidden="true" /></button>
        </div>
      </div>
    </section>
  );
}

function FAQ({ section }: { section: FaqSection }) {
  const { faqs: faqQuestions } = useCollections();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section className="faq-section" id="faq" aria-labelledby="faq-title">
      <div className="container">
        <header className="section-heading">{section.eyebrow && <p className="eyebrow">{section.eyebrow}</p>}<h2 id="faq-title">{section.heading}</h2></header>
        <div className="faq-layout">
        <div className="faq-list">
          {faqQuestions.map((item, index) => (
            <div className="faq-item" key={item.id}>
              <button className="faq-question" type="button" aria-expanded={openIndex === index} aria-controls={`faq-answer-${index}`} onClick={() => setOpenIndex(openIndex === index ? null : index)} data-testid={`button-faq-${index + 1}`}>
                 {item.question}{openIndex === index ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}
              </button>
              <div id={`faq-answer-${index}`} className="faq-answer" hidden={openIndex !== index}>
                {item.answer ? <p>{item.answer}</p> : <p className="review-note">The approved answer to this question is pending.</p>}
              </div>
            </div>
          ))}
        </div>
        {section.image.url && <div className="faq-visual"><img src={section.image.url} alt={section.image.alt} /></div>}
        </div>
      </div>
    </section>
  );
}

function FooterBrand({ className, href }: { className: string; href: string }) {
  const { siteName, footerLogo } = useSettings();
  return (
    <a className={className} href={href} aria-label={`${siteName} home`} data-testid="link-veyra-home-footer">
      {footerLogo.url ? <img className="footer-logo" src={footerLogo.url} alt={footerLogo.alt || siteName} /> : className.includes('brand-word') ? <span className="brand-name">{siteName}</span> : siteName}
    </a>
  );
}

// One footer for the whole site. It uses the "Inner page footer" menu, whose
// links are absolute (e.g. /#veyra-online), so the same footer works on the
// homepage and every inner page. (The "Homepage footer" menu is no longer
// rendered anywhere.)
function SiteFooter({ onDemo }: { onDemo: () => void }) {
  const menu = useMenu('page-footer');
  const copyright = useCopyright();
  return (
    <footer className="site-footer contact-footer" id="footer">
      <div className="container footer-inner">
        <FooterBrand className="brand-word footer-brand" href="/" />
        <nav className="footer-links" aria-label="Footer navigation">
          <MenuLinks items={menu.items} kind="footer" />
        </nav>
        {menu.cta.enabled && <DemoButton label={menu.cta.label} testId="button-demo-footer" onOpen={onDemo} />}
      </div>
      <div className="container footer-bottom">{copyright}</div>
    </footer>
  );
}

// Header for every page other than the homepage. The class names keep their
// original "contact-" prefix because the stylesheet targets them.
function InnerNavigation({ onDemo }: { onDemo: () => void }) {
  const [open, setOpen] = useState(false);
  const menu = useMenu('page-header');
  const { siteName, logo } = useSettings();
  return (
    <header className="site-nav contact-nav">
      {open && <button className="nav-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(false)} />}
      <div className="container nav-inner">
        {/* Same logo (icon + wordmark) as the homepage header. */}
        <a className="brand-word" href="/" aria-label={`${siteName} home`} data-testid="link-veyra-home-header">
          {logo.url && <img className="brand-avatar" src={logo.url} alt={logo.alt} />}
          <span className="brand-name">{siteName}</span>
        </a>
        <nav id="contact-primary-navigation" className={`nav-links${open ? ' is-open' : ''}`} aria-label="Main navigation">
          <MenuLinks items={menu.items} kind="nav" onNavigate={() => setOpen(false)} />
        </nav>
        <div className="nav-actions">
          {menu.cta.enabled && <DemoButton className="nav-demo" label={menu.cta.label} testId="button-demo-nav" onOpen={onDemo} />}
          <button
            className="mobile-toggle"
            type="button"
            aria-expanded={open}
            aria-controls="contact-primary-navigation"
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setOpen((value) => !value)}
            data-testid="button-mobile-menu"
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}

function PageIntro({ section }: { section: PageIntroSection }) {
  return (
    <section className="container page-intro">
      {section.eyebrow && <p className="eyebrow">{section.eyebrow}</p>}
      <h1>{section.heading}</h1>
      {section.lede && <p className="page-lede">{section.lede}</p>}
    </section>
  );
}

// Author-written content. The API sanitises it on save, allowing only
// formatting tags, links, images and approved video embeds.
function RichText({ section }: { section: RichTextSection }) {
  return (
    <section className="container page-richtext">
      <div className="cms-prose" dangerouslySetInnerHTML={{ __html: section.html }} />
    </section>
  );
}

type ContactValues = { fullName: string; email: string; company: string; inquiryType: string; solution: string; message: string };
type ContactErrors = Partial<Record<keyof ContactValues, string>>;
const emptyContact: ContactValues = { fullName: '', email: '', company: '', inquiryType: '', solution: '', message: '' };

function validateContact(values: ContactValues): ContactErrors {
  const errors: ContactErrors = {};
  if (!values.fullName.trim()) errors.fullName = 'Enter your full name.';
  if (!values.email.trim()) errors.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) errors.email = 'Enter a valid email address, like name@company.com.';
  if (!values.inquiryType) errors.inquiryType = 'Choose an inquiry type.';
  if (!values.message.trim()) errors.message = 'Tell us a little about what you need.';
  else if (values.message.length > 5000) errors.message = 'Keep the message under 5,000 characters.';
  return errors;
}

function ContactForm({ section }: { section: ContactFormSection }) {
  const { forms } = useSettings();
  const enabled = forms.contactEnabled;
  const [values, setValues] = useState<ContactValues>(emptyContact);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [failure, setFailure] = useState('');
  const honeypot = useRef<HTMLInputElement>(null);
  // Bots submit instantly; the server rejects anything faster than a person could type.
  const startedAt = useRef(Date.now());
  const formRef = useRef<HTMLFormElement>(null);

  const update = (field: keyof ContactValues) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    if (status === 'failed') setStatus('idle');
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enabled || status === 'sending') return;
    const nextErrors = validateContact(values);
    setErrors(nextErrors);
    const firstInvalid = (Object.keys(nextErrors) as (keyof ContactValues)[])[0];
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus();
      return;
    }
    setStatus('sending');
    try {
      const response = await fetch('/api/public/forms/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...values, website: honeypot.current?.value ?? '', startedAt: startedAt.current }),
      });
      if (response.ok) {
        setStatus('sent');
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: { message?: string; fields?: Record<string, string> } } | null;
      if (body?.error?.fields) setErrors(body.error.fields as ContactErrors);
      setFailure(body?.error?.message ?? '');
      setStatus('failed');
    } catch {
      setFailure('');
      setStatus('failed');
    }
  };

  const errorFor = (field: keyof ContactValues) =>
    errors[field] ? <p className="field-error" id={`${field}-error`}>{errors[field]}</p> : null;
  const invalid = (field: keyof ContactValues) =>
    errors[field] ? { 'aria-invalid': true as const, 'aria-describedby': `${field}-error` } : {};

  return (
    <div className="container contact-layout">
      <form ref={formRef} className="form-card" noValidate aria-labelledby="form-title" data-testid="form-contact" onSubmit={onSubmit}>
        <h2 id="form-title">{section.heading}</h2>
        {status === 'sent' ? (
          <div className="notice notice--ok" role="status" data-testid="status-form-sent">
            <p>{section.successMessage}</p>
          </div>
        ) : (
          <>
            {!enabled && (
              <div className="notice notice--warn" role="status" data-testid="status-form-unavailable">
                <p><strong>{section.unavailableTitle}</strong> {section.unavailableNotice}</p>
              </div>
            )}
            <fieldset disabled={!enabled || status === 'sending'} className="fields" aria-busy={status === 'sending'}>
              <div className="field"><label htmlFor="fullName">Full name<span className="optional"> (required)</span></label><input id="fullName" name="fullName" type="text" autoComplete="name" required aria-required="true" value={values.fullName} onChange={update('fullName')} {...invalid('fullName')} data-testid="input-full-name" />{errorFor('fullName')}</div>
              <div className="field"><label htmlFor="email">Email<span className="optional"> (required)</span></label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" required aria-required="true" value={values.email} onChange={update('email')} {...invalid('email')} data-testid="input-email" />{errorFor('email')}</div>
              <div className="field"><label htmlFor="company">Company<span className="optional"> (optional)</span></label><input id="company" name="company" type="text" autoComplete="organization" value={values.company} onChange={update('company')} data-testid="input-company" /></div>
              <div className="field"><label htmlFor="inquiryType">Inquiry type<span className="optional"> (required)</span></label><select id="inquiryType" name="inquiryType" required aria-required="true" value={values.inquiryType} onChange={update('inquiryType')} {...invalid('inquiryType')} data-testid="select-inquiry-type"><option value="">Select an inquiry type</option>{section.inquiryTypes.map((option) => <option key={option}>{option}</option>)}</select>{errorFor('inquiryType')}</div>
              {section.solutions.length > 0 && (
                <div className="field"><label htmlFor="solution">Solution of interest<span className="optional"> (optional)</span></label><select id="solution" name="solution" value={values.solution} onChange={update('solution')} data-testid="select-solution"><option value="">No preference</option>{section.solutions.map((option) => <option key={option}>{option}</option>)}</select></div>
              )}
              <div className="field"><label htmlFor="message">Message<span className="optional"> (required)</span></label><textarea id="message" name="message" rows={5} required aria-required="true" value={values.message} onChange={update('message')} {...invalid('message')} data-testid="input-message" />{errorFor('message')}</div>
              <div className="hp" aria-hidden="true"><label htmlFor="website">Leave this field empty</label><input ref={honeypot} id="website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
            </fieldset>
            {status === 'failed' && (
              <div className="notice notice--warn" role="alert">
                <p>{failure || 'Your message didn’t go through. Please try again in a moment.'}</p>
              </div>
            )}
            <button className="button form-submit" type="submit" disabled={!enabled || status === 'sending'} aria-disabled={!enabled || status === 'sending'} data-testid="button-send-message">{status === 'sending' ? 'Sending…' : section.submitLabel}</button>
          </>
        )}
        <p className="sr-only" role="status" aria-live="polite">{status === 'sent' ? section.successMessage : ''}</p>
      </form>
      {section.aside.length > 0 && (
        <aside className="contact-aside" aria-label="Contact information">
          {section.aside.map((block) => (
            <Fragment key={block.id}>
              {block.heading && <h2>{block.heading}</h2>}
              {block.items.length > 0 && <ul className="topic-list">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>}
              {block.body && <p>{block.body}</p>}
            </Fragment>
          ))}
        </aside>
      )}
    </div>
  );
}

type SectionContext = {
  motionEnabled: boolean;
  onMotionToggle: () => void;
  onDemo: () => void;
};

function SectionView({ section, context }: { section: Section; context: SectionContext }) {
  switch (section.type) {
    case 'hero':
      return <Hero section={section} motionEnabled={context.motionEnabled} onMotionToggle={context.onMotionToggle} onDemo={context.onDemo} />;
    case 'trust':
      return <TrustSection section={section} />;
    case 'metrics':
      return <Metrics />;
    case 'experiences':
      return <Experiences section={section} motionEnabled={context.motionEnabled} onDemo={context.onDemo} />;
    case 'testimonials':
      return <Testimonials section={section} />;
    case 'platform':
      return <PlatformDiagram section={section} onDemo={context.onDemo} />;
    case 'faq':
      return <FAQ section={section} />;
    case 'pageIntro':
      return <PageIntro section={section} />;
    case 'contactForm':
      return <ContactForm section={section} />;
    case 'richText':
      return <RichText section={section} />;
  }
}

function PageSections({ sections, context }: { sections: Section[]; context: SectionContext }) {
  return (
    <>
      {sections
        .filter((section) => section.visible)
        .map((section) => (
          <SectionView key={section.id} section={section} context={context} />
        ))}
    </>
  );
}

// Motion preference and the demo dialog, shared by every page template.
function usePageChrome() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const [motionEnabled, setMotionEnabled] = useState(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    // A preference change must pause existing playback too.
    if (reducedMotion) setMotionEnabled(false);
  }, [reducedMotion]);
  const context: SectionContext = {
    motionEnabled,
    onMotionToggle: () => setMotionEnabled((value) => !value),
    onDemo: () => setDialogOpen(true),
  };
  return { context, dialogOpen, closeDialog: () => setDialogOpen(false) };
}

// Every page except the homepage: the contact page, and any page an editor
// creates. Same chrome, any combination of sections.
function InnerShell({ children }: { children: (context: SectionContext) => ReactNode }) {
  const { context, dialogOpen, closeDialog } = usePageChrome();
  return (
    <div className="contact-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <InnerNavigation onDemo={context.onDemo} />
      <main id="main-content" className="page-main" tabIndex={-1}>
        {children(context)}
      </main>
      <SiteFooter onDemo={context.onDemo} />
      <DemoDialog open={dialogOpen} onClose={closeDialog} />
    </div>
  );
}

function InnerPage({ page }: { page: PublicPage }) {
  return <InnerShell>{(context) => <PageSections sections={page.sections} context={context} />}</InnerShell>;
}

type DemoFormValues = { name: string; email: string; company: string; interest: string; message: string };
type DemoFieldErrors = Partial<Record<'name' | 'email' | 'company', string>>;

const emptyDemoForm: DemoFormValues = { name: '', email: '', company: '', interest: '', message: '' };
const requiredDemoFields = ['name', 'email', 'company'] as const;

function validateDemoForm(values: DemoFormValues): DemoFieldErrors {
  const errors: DemoFieldErrors = {};
  if (!values.name.trim()) errors.name = 'Enter your full name.';
  if (!values.email.trim()) errors.email = 'Enter your work email.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) errors.email = 'Enter a valid email address, like name@company.com.';
  if (!values.company.trim()) errors.company = 'Enter your company name.';
  return errors;
}

function DemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const [values, setValues] = useState<DemoFormValues>(emptyDemoForm);
  const [errors, setErrors] = useState<DemoFieldErrors>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'unavailable' | 'failed'>('idle');
  const [failure, setFailure] = useState('');
  const { demo, forms } = useSettings();
  const openedAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      openedAt.current = Date.now();
      return;
    }
    // A reopened dialog starts clean rather than showing the last attempt.
    setValues(emptyDemoForm);
    setErrors({});
    setStatus('idle');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    const handleKeys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCallback.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => {
      document.removeEventListener('keydown', handleKeys);
      previousFocus.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const update = (field: keyof DemoFormValues) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
    // Clearing the message as they type beats making them resubmit to see it go.
    setErrors((current) => (field in current ? { ...current, [field]: undefined } : current));
    setStatus((current) => (current === 'failed' || current === 'unavailable' ? 'idle' : current));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateDemoForm(values);
    setErrors(nextErrors);
    const firstInvalid = requiredDemoFields.find((field) => nextErrors[field]);
    if (firstInvalid) {
      dialogRef.current?.querySelector<HTMLElement>(`#demo-${firstInvalid}`)?.focus();
      return;
    }
    if (!forms.demoEnabled) {
      setStatus('unavailable');
      return;
    }
    setStatus('sending');
    try {
      const response = await fetch('/api/public/forms/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...values, website: honeypot.current?.value ?? '', startedAt: openedAt.current }),
      });
      if (response.ok) {
        setStatus('sent');
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: { message?: string; fields?: DemoFieldErrors } } | null;
      if (body?.error?.fields) setErrors(body.error.fields);
      setFailure(body?.error?.message ?? '');
      setStatus('failed');
    } catch {
      setFailure('');
      setStatus('failed');
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-title" aria-describedby="demo-description">
        <button ref={closeRef} className="dialog-close" type="button" onClick={onClose} aria-label="Close demo request form" data-testid="button-close-demo"><X aria-hidden="true" /></button>
        <h2 id="demo-title">{demo.title}</h2>
        {status === 'sent' ? (
          <div className="demo-sent" role="status">
            <p className="demo-sent-title">{demo.successTitle}</p>
            <p>{demo.successMessage.replace(/{firstName}/g, values.name.trim().split(' ')[0]).replace(/{email}/g, values.email.trim())}</p>
            <button className="button" type="button" onClick={onClose} data-testid="button-dismiss-demo">Close</button>
          </div>
        ) : (
          <>
            <p id="demo-description" className="dialog-lede">{demo.lede}</p>
            <form className="demo-form" onSubmit={onSubmit} noValidate>
              <div className="demo-field">
                <label htmlFor="demo-name">Full name <span className="demo-required" aria-hidden="true">*</span></label>
                <input
                  ref={firstFieldRef}
                  id="demo-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  aria-required="true"
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? 'demo-name-error' : undefined}
                  value={values.name}
                  onChange={update('name')}
                  data-testid="input-demo-name"
                />
                {errors.name && <p className="demo-error" id="demo-name-error">{errors.name}</p>}
              </div>
              <div className="demo-field">
                <label htmlFor="demo-email">Work email <span className="demo-required" aria-hidden="true">*</span></label>
                <input
                  id="demo-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-required="true"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'demo-email-error' : undefined}
                  value={values.email}
                  onChange={update('email')}
                  data-testid="input-demo-email"
                />
                {errors.email && <p className="demo-error" id="demo-email-error">{errors.email}</p>}
              </div>
              <div className="demo-field">
                <label htmlFor="demo-company">Company name <span className="demo-required" aria-hidden="true">*</span></label>
                <input
                  id="demo-company"
                  name="company"
                  type="text"
                  autoComplete="organization"
                  aria-required="true"
                  aria-invalid={errors.company ? true : undefined}
                  aria-describedby={errors.company ? 'demo-company-error' : undefined}
                  value={values.company}
                  onChange={update('company')}
                  data-testid="input-demo-company"
                />
                {errors.company && <p className="demo-error" id="demo-company-error">{errors.company}</p>}
              </div>
              <fieldset className="demo-field demo-interest">
                <legend>I’m interested in</legend>
                <div className="demo-choices">
                  {demo.interests.map((option) => (
                    <label className="demo-choice" key={option}>
                      <input type="radio" name="interest" value={option} checked={values.interest === option} onChange={update('interest')} data-testid={`radio-demo-interest-${option.toLowerCase().replace(/[^a-z]+/g, '-')}`} />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="demo-field">
                <label htmlFor="demo-message">What would you like to improve? <span className="demo-optional">Optional</span></label>
                <textarea id="demo-message" name="message" rows={3} value={values.message} onChange={update('message')} data-testid="input-demo-message" />
              </div>
              {/* Invisible to people; bots that fill every field give themselves away. */}
              <div className="hp" aria-hidden="true"><label htmlFor="demo-website">Leave this field empty</label><input ref={honeypot} id="demo-website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
              {status === 'unavailable' && (
                <p className="demo-notice" role="alert">
                  Demo requests aren’t being accepted right now, so this request was not sent. Nothing you typed left this page.
                </p>
              )}
              {status === 'failed' && (
                <p className="demo-notice" role="alert">{failure || 'That request didn’t go through. Please try again in a moment.'}</p>
              )}
              <button className="button demo-submit" type="submit" disabled={status === 'sending'} data-testid="button-submit-demo">
                {status === 'sending' ? 'Sending…' : demo.submitLabel}
                <ArrowUpRight aria-hidden="true" />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function Home({ page }: { page: PublicPage }) {
  useEffect(() => {
    // React mounts the anchor targets after the browser's initial fragment lookup.
    const target = window.location.hash.slice(1);
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const { context, dialogOpen, closeDialog } = usePageChrome();
  return (
    <div className={context.motionEnabled ? '' : 'motion-paused'}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navigation onDemo={context.onDemo} />
      <main id="main-content">
        <PageSections sections={page.sections} context={context} />
      </main>
      <SiteFooter onDemo={context.onDemo} />
      <DemoDialog open={dialogOpen} onClose={closeDialog} />
    </div>
  );
}

function NotFound() {
  return <main className="container" style={{ minHeight: '100dvh', display: 'grid', alignItems: 'center' }}><div><p className="eyebrow">VEYRA</p><h1>That page isn’t here.</h1><a className="button" href="/">Back to Veyra</a></div></main>;
}

function ErrorFallback({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

// Which template a path gets. Only "/" uses the homepage template; every
// other published page uses the inner-page template.
function Routes() {
  const { data, status } = useSite();
  const path = currentPath();
  // Resources: the listing is the built-in Resources page plus the resource
  // grid; a resource detail has no CMS page of its own, so it is routed before
  // the page check. Its URL is /resources/{segment}/{slug}.
  if (path.startsWith('/resources/')) {
    const [segment, slug, ...rest] = path.slice('/resources/'.length).split('/');
    if (segment && slug && rest.length === 0) {
      return <InnerShell>{() => <ResourceView segment={segment} slug={slug} />}</InnerShell>;
    }
    return <InnerShell>{() => <NotFound />}</InnerShell>;
  }
  if (status === 'loading') return null;
  if (path === '/resources') {
    return (
      <InnerShell>
        {(context) => (
          <>
            {data.page && <PageSections sections={data.page.sections} context={context} />}
            <ResourcesList />
          </>
        )}
      </InnerShell>
    );
  }
  if (!data.page) return <NotFound />;
  return path === '/' ? <Home page={data.page} /> : <InnerPage page={data.page} />;
}

function App() {
  return (
    <ErrorFallback>
      <SiteProvider>
        <Routes />
      </SiteProvider>
    </ErrorFallback>
  );
}

export default App;
