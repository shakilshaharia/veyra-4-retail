import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, Node, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code2,
  Film,
  Heading2,
  Heading3,
  Heading4,
  ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';
import { Modal } from './dialog';
import { MediaPicker } from './media';
import { Button, Checkbox, Field, Input, Notice } from './ui';

// YouTube and Vimeo links become privacy-friendly embed URLs. These are the
// only iframe hosts the server's sanitiser lets through.
export function toEmbedUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = url.searchParams.get('v') ?? /\/(?:embed|shorts)\/([\w-]+)/.exec(url.pathname)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === 'youtube-nocookie.com') return `https://www.youtube-nocookie.com${url.pathname}`;
    if (host === 'vimeo.com') {
      const id = /\/(\d+)/.exec(url.pathname)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === 'player.vimeo.com') return `https://player.vimeo.com${url.pathname}`;
    return null;
  } catch {
    return null;
  }
}

declare module '@tiptap/react' {
  interface Commands<ReturnType> {
    embed: { setEmbed: (src: string) => ReturnType };
  }
}

// Renders exactly the markup the site styles: <div class="cms-embed"><iframe>.
const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: 'div.cms-embed',
        getAttrs: (element) => ({ src: (element as HTMLElement).querySelector('iframe')?.getAttribute('src') ?? null }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      'div',
      { class: 'cms-embed' },
      ['iframe', { src: node.attrs.src, title: 'Embedded video', allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture', allowfullscreen: 'true', loading: 'lazy' }],
    ];
  },
  addCommands() {
    return {
      setEmbed:
        (src: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { src } }),
    };
  },
});

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn('inline-flex size-8 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-ink disabled:opacity-30 [&_svg]:size-4', active && 'bg-brand-50 text-brand-700')}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-zinc-200" aria-hidden="true" />;

function Toolbar({ editor, onLink, onImage, onEmbed }: { editor: Editor; onLink: () => void; onImage: () => void; onEmbed: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive('paragraph'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      h4: e.isActive('heading', { level: 4 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label="Formatting" className="sticky top-14 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-zinc-200 bg-white/95 px-2 py-1.5 backdrop-blur lg:top-0">
      <ToolButton label="Paragraph" active={state.paragraph} onClick={() => chain().setParagraph().run()}><Pilcrow /></ToolButton>
      <ToolButton label="Heading 2" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 /></ToolButton>
      <ToolButton label="Heading 3" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 /></ToolButton>
      <ToolButton label="Heading 4" active={state.h4} onClick={() => chain().toggleHeading({ level: 4 }).run()}><Heading4 /></ToolButton>
      <Divider />
      <ToolButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}><Bold /></ToolButton>
      <ToolButton label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic /></ToolButton>
      <ToolButton label="Underline" active={state.underline} onClick={() => chain().toggleUnderline().run()}><Underline /></ToolButton>
      <ToolButton label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough /></ToolButton>
      <Divider />
      <ToolButton label={state.link ? 'Edit link' : 'Add link'} active={state.link} onClick={onLink}><LinkIcon /></ToolButton>
      {state.link && <ToolButton label="Remove link" onClick={() => chain().extendMarkRange('link').unsetLink().run()}><Unlink /></ToolButton>}
      <Divider />
      <ToolButton label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List /></ToolButton>
      <ToolButton label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered /></ToolButton>
      <ToolButton label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote /></ToolButton>
      <ToolButton label="Code block" active={state.code} onClick={() => chain().toggleCodeBlock().run()}><Code2 /></ToolButton>
      <ToolButton label="Divider" onClick={() => chain().setHorizontalRule().run()}><Minus /></ToolButton>
      <Divider />
      <ToolButton label="Insert image" onClick={onImage}><ImageIcon /></ToolButton>
      <ToolButton label="Embed YouTube or Vimeo video" onClick={onEmbed}><Film /></ToolButton>
      <span className="ml-auto flex">
        <ToolButton label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()}><Undo2 /></ToolButton>
        <ToolButton label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()}><Redo2 /></ToolButton>
      </span>
    </div>
  );
}

export function RichTextEditor({
  initialHtml,
  initialJson,
  onChange,
  placeholder = 'Start writing…',
  label,
  error,
}: {
  initialHtml?: string;
  initialJson?: JSONContent | null;
  onChange: (html: string, json: JSONContent) => void;
  placeholder?: string;
  label?: string;
  error?: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: null, target: null } },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Embed,
      Placeholder.configure({ placeholder }),
    ],
    content: initialJson && Array.isArray(initialJson.content) && initialJson.content.length ? initialJson : initialHtml || '',
    editorProps: {
      attributes: { 'aria-label': label ?? 'Content', role: 'textbox', 'aria-multiline': 'true', class: 'tiptap px-5 py-4' },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML(), e.getJSON()),
    immediatelyRender: true,
  });

  if (!editor) return null;

  return (
    <div>
      <div className={cn('rounded-xl bg-white shadow-sm ring-1 ring-zinc-200', error && 'ring-red-500')}>
        <Toolbar editor={editor} onLink={() => setLinkOpen(true)} onImage={() => setImageOpen(true)} onEmbed={() => setEmbedOpen(true)} />
        <EditorContent editor={editor} />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600" role="alert">{error}</p>}

      <LinkDialog open={linkOpen} editor={editor} onClose={() => setLinkOpen(false)} />
      <MediaPicker
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        kind="image"
        title="Insert an image"
        onSelect={(item) => editor.chain().focus().setImage({ src: item.url, alt: item.alt || '' }).run()}
      />
      <EmbedDialog open={embedOpen} onClose={() => setEmbedOpen(false)} onInsert={(src) => editor.chain().focus().setEmbed(src).run()} />
    </div>
  );
}

function LinkDialog({ open, editor, onClose }: { open: boolean; editor: Editor; onClose: () => void }) {
  const existing = editor.getAttributes('link') as { href?: string; target?: string };
  const [href, setHref] = useState('');
  const [newTab, setNewTab] = useState(false);
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setHref(existing.href ?? '');
    setNewTab(existing.target === '_blank');
    setError('');
    setSeeded(true);
  }
  if (!open && seeded) setSeeded(false);

  const apply = () => {
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    if (!/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(value)) {
      setError('Start with https://, /, #, mailto: or tel:.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: value, target: newTab ? '_blank' : null }).run();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={existing.href ? 'Edit link' : 'Add link'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply}>Apply</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <Field label="Link to" hint="A page on this site like /contact, or a full https:// address." error={error}>
          {(wiring) => <Input {...wiring} autoFocus value={href} onChange={(event) => setHref(event.target.value)} placeholder="https://" />}
        </Field>
        <Checkbox checked={newTab} onChange={setNewTab} label="Open in a new tab" />
      </form>
    </Modal>
  );
}

function EmbedDialog({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (src: string) => void }) {
  const [url, setUrl] = useState('');
  const embed = url ? toEmbedUrl(url) : null;
  const insert = () => {
    if (!embed) return;
    onInsert(embed);
    setUrl('');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Embed a video"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!embed} onClick={insert}>Embed</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="YouTube or Vimeo link" error={url && !embed ? 'Paste a YouTube or Vimeo video link.' : undefined}>
          {(wiring) => <Input {...wiring} autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" />}
        </Field>
        {embed && (
          <div className="relative aspect-video overflow-hidden rounded-lg bg-zinc-900">
            <iframe src={embed} title="Preview" className="absolute inset-0 size-full" />
          </div>
        )}
        <Notice tone="info">YouTube videos use the privacy-enhanced youtube-nocookie.com player.</Notice>
      </div>
    </Modal>
  );
}
