import {
  iconNames,
  toneNames,
  type ContactFormSection,
  type ExperiencesSection,
  type FaqSection,
  type HeroSection,
  type PageIntroSection,
  type PlatformSection,
  type RichTextSection,
  type Section,
  type TestimonialsSection,
  type TrustSection,
} from '@workspace/cms-content';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { RichTextEditor } from '@/components/editor';
import { StringListEditor } from '@/components/list-editor';
import { ImageField, VideoField } from '@/components/media';
import { move } from '@/components/sortable';
import { Button, IconButton, Notice, SelectField, TextAreaField, TextField } from '@/components/ui';
import { newId } from '@/lib/format';

export const sectionMeta: Record<Section['type'], { label: string; description: string }> = {
  hero: { label: 'Hero', description: 'Headline, intro, button and background video at the top of the homepage.' },
  trust: { label: 'Trust strip', description: 'The headline above the client logos.' },
  metrics: { label: 'Statistics', description: 'The results grid.' },
  experiences: { label: 'Product experiences', description: 'The stacked product cards with feature tabs and videos.' },
  testimonials: { label: 'Testimonials', description: 'The customer stories carousel.' },
  platform: { label: 'Platform map', description: 'Heading, diagram and the mobile journey map.' },
  faq: { label: 'FAQ', description: 'Questions and answers with an image.' },
  pageIntro: { label: 'Page intro', description: 'Eyebrow, main heading and introduction.' },
  contactForm: { label: 'Contact form', description: 'The form and the help panel beside it.' },
  richText: { label: 'Text block', description: 'Free-form content written in the editor.' },
};

export function newSection(type: Section['type']): Section {
  const id = newId(type);
  switch (type) {
    case 'hero':
      return { id, type, visible: true, eyebrow: '', heading: 'Your headline', body: '', ctaLabel: 'Get Demo', video: { mp4: '', webm: '', poster: '' }, fallbackImage: '' };
    case 'trust':
      return { id, type, visible: true, headline: 'Trusted by brands focused on growth.' };
    case 'metrics':
      return { id, type, visible: true };
    case 'experiences':
      return { id, type, visible: true, ariaLabel: '' };
    case 'testimonials':
      return { id, type, visible: true, heading: 'Real results. Real customer journeys.' };
    case 'platform':
      return { id, type, visible: true, heading: '', body: '', ctaLabel: 'Get Demo', diagram: { url: '', alt: '' }, stages: [], mapNote: '', systemsLabel: '', systems: [] };
    case 'faq':
      return { id, type, visible: true, eyebrow: 'GOOD TO KNOW', heading: 'Frequently asked questions', image: { url: '', alt: '' } };
    case 'pageIntro':
      return { id, type, visible: true, eyebrow: '', heading: 'Page heading', lede: '' };
    case 'contactForm':
      return {
        id,
        type,
        visible: true,
        heading: 'Tell us what you have in mind.',
        unavailableTitle: 'This form isn’t accepting messages yet.',
        unavailableNotice: '',
        inquiryTypes: ['Request a demo', 'Product question', 'Other'],
        solutions: [],
        submitLabel: 'Send message',
        successMessage: 'Thanks — your message is on its way.',
        aside: [],
      };
    case 'richText':
      return { id, type, visible: true, html: '' };
  }
}

function CollectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
      {children} <ExternalLink className="size-3" aria-hidden="true" />
    </Link>
  );
}

type Errors = Record<string, string>;
type EditorProps<T> = { section: T; onChange: (next: T) => void; errors: Errors };

function HeroEditor({ section, onChange, errors }: EditorProps<HeroSection>) {
  const set = <K extends keyof HeroSection>(key: K, value: HeroSection[K]) => onChange({ ...section, [key]: value });
  return (
    <div className="space-y-4">
      <TextField label="Eyebrow" value={section.eyebrow} onChange={(v) => set('eyebrow', v)} hint="The small label above the headline." error={errors.eyebrow} />
      <TextAreaField label="Headline" value={section.heading} onChange={(v) => set('heading', v)} rows={2} required error={errors.heading} />
      <TextAreaField label="Introduction" value={section.body} onChange={(v) => set('body', v)} rows={3} error={errors.body} />
      <TextField label="Button label" value={section.ctaLabel} onChange={(v) => set('ctaLabel', v)} hint="Opens the demo form, or your booking link if one is set in Settings." error={errors.ctaLabel} />
      <VideoField label="Background video" value={section.video} onChange={(v) => set('video', v)} />
      <ImageField label="Still image" hint="Shown if the video cannot play. Defaults to the poster." value={section.fallbackImage} onChange={(v) => set('fallbackImage', v)} error={errors.fallbackImage} />
    </div>
  );
}

function PlatformItems<T extends { id: string; name: string; icon: (typeof iconNames)[number]; tone: (typeof toneNames)[number]; detail?: string }>({
  title,
  items,
  onChange,
  withDetail,
  make,
}: {
  title: string;
  items: T[];
  onChange: (next: T[]) => void;
  withDetail?: boolean;
  make: () => T;
}) {
  const update = (index: number, patch: Partial<T>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-zinc-800">{title}</legend>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={item.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <div className="grid gap-2 sm:grid-cols-2">
              <TextField label="Name" value={item.name} onChange={(v) => update(index, { name: v } as Partial<T>)} />
              {withDetail && <TextField label="Detail" value={item.detail ?? ''} onChange={(v) => update(index, { detail: v } as Partial<T>)} />}
              <SelectField label="Icon" value={item.icon} onChange={(v) => update(index, { icon: v } as Partial<T>)} options={iconNames.map((name) => ({ value: name, label: name.replace('-', ' ') }))} />
              <SelectField label="Colour" value={item.tone} onChange={(v) => update(index, { tone: v } as Partial<T>)} options={toneNames.map((tone) => ({ value: tone, label: tone }))} />
            </div>
            <div className="flex flex-col">
              <IconButton label="Move up" disabled={index === 0} onClick={() => onChange(move(items, index, -1))}><ArrowUp /></IconButton>
              <IconButton label="Move down" disabled={index === items.length - 1} onClick={() => onChange(move(items, index, 1))}><ArrowDown /></IconButton>
              <IconButton label="Remove" className="hover:text-red-600" onClick={() => onChange(items.filter((_, i) => i !== index))}><Trash2 /></IconButton>
            </div>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onChange([...items, make()])}>Add</Button>
    </fieldset>
  );
}

function PlatformEditor({ section, onChange, errors }: EditorProps<PlatformSection>) {
  const set = <K extends keyof PlatformSection>(key: K, value: PlatformSection[K]) => onChange({ ...section, [key]: value });
  return (
    <div className="space-y-4">
      <TextField label="Heading" value={section.heading} onChange={(v) => set('heading', v)} error={errors.heading} />
      <TextAreaField label="Introduction" value={section.body} onChange={(v) => set('body', v)} rows={2} error={errors.body} />
      <TextField label="Button label" value={section.ctaLabel} onChange={(v) => set('ctaLabel', v)} hint="Leave empty to hide the button." />
      <ImageField label="Diagram (desktop and tablet)" value={section.diagram.url} onChange={(url) => set('diagram', { ...section.diagram, url })} alt={section.diagram.alt} onAltChange={(alt) => set('diagram', { ...section.diagram, alt })} />
      <Notice tone="info">On phones the diagram is replaced by the map below, built from these lists.</Notice>
      <PlatformItems title="Journey stages" items={section.stages} withDetail onChange={(v) => set('stages', v)} make={() => ({ id: newId('stage'), name: '', detail: '', icon: 'shopping-cart', tone: 'violet' })} />
      <TextField label="Note under the stages" value={section.mapNote} onChange={(v) => set('mapNote', v)} />
      <TextField label="Systems label" value={section.systemsLabel} onChange={(v) => set('systemsLabel', v)} />
      <PlatformItems title="Connected systems" items={section.systems} onChange={(v) => set('systems', v)} make={() => ({ id: newId('sys'), name: '', icon: 'database', tone: 'blue' })} />
    </div>
  );
}

function ContactFormEditor({ section, onChange, errors }: EditorProps<ContactFormSection>) {
  const set = <K extends keyof ContactFormSection>(key: K, value: ContactFormSection[K]) => onChange({ ...section, [key]: value });
  return (
    <div className="space-y-4">
      <Notice tone="info">
        Whether this form accepts messages is set in <CollectionLink href="/settings?tab=forms">Settings → Forms</CollectionLink>. Messages arrive in <CollectionLink href="/submissions">Form submissions</CollectionLink>.
      </Notice>
      <TextField label="Form heading" value={section.heading} onChange={(v) => set('heading', v)} error={errors.heading} />
      <StringListEditor label="Inquiry types" values={section.inquiryTypes} onChange={(v) => set('inquiryTypes', v)} addLabel="Add inquiry type" hint="Required dropdown. At least one." />
      <StringListEditor label="Solutions" values={section.solutions} onChange={(v) => set('solutions', v)} addLabel="Add solution" hint="Optional dropdown. Leave empty to hide it." />
      <TextField label="Button label" value={section.submitLabel} onChange={(v) => set('submitLabel', v)} />
      <TextAreaField label="Message after sending" value={section.successMessage} onChange={(v) => set('successMessage', v)} rows={2} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Notice title when switched off" value={section.unavailableTitle} onChange={(v) => set('unavailableTitle', v)} />
        <TextField label="Notice text when switched off" value={section.unavailableNotice} onChange={(v) => set('unavailableNotice', v)} />
      </div>
      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium text-zinc-800">Help panel</legend>
        {section.aside.map((block, index) => (
          <div key={block.id} className="space-y-3 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
            <div className="flex items-start gap-2">
              <TextField label="Heading" value={block.heading} className="flex-1" onChange={(v) => set('aside', section.aside.map((b, i) => (i === index ? { ...b, heading: v } : b)))} />
              <IconButton label="Remove block" className="mt-6 hover:text-red-600" onClick={() => set('aside', section.aside.filter((_, i) => i !== index))}><Trash2 /></IconButton>
            </div>
            <StringListEditor label="Bullet points" values={block.items} onChange={(v) => set('aside', section.aside.map((b, i) => (i === index ? { ...b, items: v } : b)))} addLabel="Add point" />
            <TextAreaField label="Paragraph" value={block.body} rows={2} onChange={(v) => set('aside', section.aside.map((b, i) => (i === index ? { ...b, body: v } : b)))} />
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => set('aside', [...section.aside, { id: newId('aside'), heading: '', items: [], body: '' }])}>Add block</Button>
      </fieldset>
    </div>
  );
}

export function SectionEditor({ section, onChange, errors }: { section: Section; onChange: (next: Section) => void; errors: Errors }) {
  switch (section.type) {
    case 'hero':
      return <HeroEditor section={section} onChange={onChange} errors={errors} />;
    case 'trust':
      return (
        <div className="space-y-4">
          <TextField label="Headline" value={section.headline} onChange={(v) => onChange({ ...(section as TrustSection), headline: v })} error={errors.headline} />
          <p className="text-[13px] text-zinc-600">The logos are managed in <CollectionLink href="/collections/logos">Client logos</CollectionLink>.</p>
        </div>
      );
    case 'metrics':
      return <p className="text-[13px] text-zinc-600">The figures are managed in <CollectionLink href="/collections/metrics">Statistics</CollectionLink>. Only published ones appear.</p>;
    case 'experiences':
      return (
        <div className="space-y-4">
          <TextField label="Accessible label" hint="Read out by screen readers for the whole block." value={section.ariaLabel} onChange={(v) => onChange({ ...(section as ExperiencesSection), ariaLabel: v })} />
          <p className="text-[13px] text-zinc-600">Products, their feature tabs and videos are managed in <CollectionLink href="/collections/products">Products &amp; features</CollectionLink>.</p>
        </div>
      );
    case 'testimonials':
      return (
        <div className="space-y-4">
          <TextField label="Heading" value={section.heading} onChange={(v) => onChange({ ...(section as TestimonialsSection), heading: v })} error={errors.heading} />
          <p className="text-[13px] text-zinc-600">The stories are managed in <CollectionLink href="/collections/testimonials">Testimonials</CollectionLink>.</p>
        </div>
      );
    case 'platform':
      return <PlatformEditor section={section} onChange={onChange} errors={errors} />;
    case 'faq': {
      const s = section as FaqSection;
      return (
        <div className="space-y-4">
          <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => onChange({ ...s, eyebrow: v })} />
          <TextField label="Heading" value={s.heading} onChange={(v) => onChange({ ...s, heading: v })} error={errors.heading} />
          <ImageField label="Image" value={s.image.url} onChange={(url) => onChange({ ...s, image: { ...s.image, url } })} alt={s.image.alt} onAltChange={(alt) => onChange({ ...s, image: { ...s.image, alt } })} />
          <p className="text-[13px] text-zinc-600">Questions and answers are managed in <CollectionLink href="/collections/faqs">FAQs</CollectionLink>.</p>
        </div>
      );
    }
    case 'pageIntro': {
      const s = section as PageIntroSection;
      return (
        <div className="space-y-4">
          <TextField label="Eyebrow" value={s.eyebrow} onChange={(v) => onChange({ ...s, eyebrow: v })} hint="Small uppercase label above the heading." />
          <TextAreaField label="Heading" value={s.heading} onChange={(v) => onChange({ ...s, heading: v })} rows={2} required error={errors.heading} />
          <TextAreaField label="Introduction" value={s.lede} onChange={(v) => onChange({ ...s, lede: v })} rows={3} />
        </div>
      );
    }
    case 'contactForm':
      return <ContactFormEditor section={section} onChange={onChange} errors={errors} />;
    case 'richText':
      return (
        <RichTextEditor
          initialHtml={(section as RichTextSection).html}
          onChange={(html) => onChange({ ...(section as RichTextSection), html })}
          label="Text block"
          placeholder="Write the content for this part of the page…"
        />
      );
  }
}
