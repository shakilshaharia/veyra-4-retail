import { Loader2 } from 'lucide-react';
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/format';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-white text-ink ring-1 ring-inset ring-zinc-300 shadow-sm hover:bg-zinc-50 disabled:text-zinc-400',
  ghost: 'text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-600/50',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-10 gap-2 px-4 text-sm',
};

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed [&_svg]:size-4',
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = 'secondary', size = 'md', icon, className, children }: { href: string; variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-ink disabled:opacity-40 [&_svg]:size-4', className)} {...props}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const control =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-ink shadow-sm ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500 aria-[invalid=true]:ring-red-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 leading-relaxed', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(control, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
});

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode;
};

// Wires a label, hint and error message to whatever control it wraps.
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-zinc-800">
        {label}
        {required && <span className="ml-0.5 text-brand-600" aria-hidden="true">*</span>}
      </label>
      {children({ id, ...(error ? { 'aria-invalid': true as const } : {}), 'aria-describedby': describedBy })}
      {hint && !error && <p id={`${id}-hint`} className="text-xs leading-relaxed text-zinc-500">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs leading-relaxed text-red-600" role="alert">{error}</p>}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string;
  counter?: number;
};

export function TextField({ label, value, onChange, hint, error, counter, className, required, ...props }: TextFieldProps) {
  return (
    <Field label={label} hint={counter ? <Counter value={value} max={counter} hint={hint} /> : hint} error={error} required={required} className={className}>
      {(wiring) => <Input {...props} {...wiring} required={required} value={value} onChange={(event) => onChange(event.target.value)} />}
    </Field>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string;
  counter?: number;
};

export function TextAreaField({ label, value, onChange, hint, error, counter, className, required, ...props }: TextAreaFieldProps) {
  return (
    <Field label={label} hint={counter ? <Counter value={value} max={counter} hint={hint} /> : hint} error={error} required={required} className={className}>
      {(wiring) => <Textarea {...props} {...wiring} required={required} value={value} onChange={(event) => onChange(event.target.value)} />}
    </Field>
  );
}

function Counter({ value, max, hint }: { value: string; max: number; hint?: ReactNode }) {
  const over = value.length > max;
  return (
    <span className="flex justify-between gap-3">
      <span>{hint}</span>
      <span className={cn('tabular-nums', over && 'font-medium text-amber-600')}>{value.length}/{max}</span>
    </span>
  );
}

export function SelectField({ label, value, onChange, options, hint, error, className, required, disabled }: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: ReactNode;
  error?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(wiring) => (
        <Select {...wiring} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label id={`${id}-label`} htmlFor={id} className="block text-sm font-medium text-zinc-800">{label}</label>
        {description && <p id={`${id}-desc`} className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-zinc-300')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5 text-sm text-zinc-800', className)}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 rounded border-zinc-300 accent-brand-600" />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Layout and feedback
// ---------------------------------------------------------------------------

export function Card({ className, children, ...props }: { className?: string; children: ReactNode } & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>) {
  return (
    <div className={cn('rounded-xl bg-white shadow-sm ring-1 ring-zinc-200/80', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-brand-50 text-brand-700 ring-brand-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', badgeTones[tone], className)}>{children}</span>;
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-zinc-500', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}…</span>
    </span>
  );
}

export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 [&_svg]:size-5">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const noticeTones = {
  info: 'bg-brand-50 text-brand-900 ring-brand-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
  success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
};

export function Notice({ tone = 'info', title, children, className }: { tone?: keyof typeof noticeTones; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg px-4 py-3 text-sm leading-relaxed ring-1 ring-inset', noticeTones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="p-5">
      <Notice tone="error" title="This could not be loaded">
        <p>{message}</p>
        {onRetry && (
          <Button size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Notice>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (value: NoInfer<T>) => void; tabs: { value: NoInfer<T>; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b border-zinc-200', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            value === tab.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-zinc-500 hover:text-ink',
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className={cn('rounded-full px-1.5 text-xs tabular-nums', value === tab.value ? 'bg-brand-100' : 'bg-zinc-100')}>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <div className="mb-2">{back}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-zinc-100 px-5 py-3 text-sm text-zinc-600">
      <span className="tabular-nums">Page {page} of {pages}</span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
      </div>
    </nav>
  );
}
