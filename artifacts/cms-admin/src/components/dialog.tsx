import { AlertTriangle, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';
import { Button, IconButton } from './ui';

// The native <dialog> element gives a real modal: focus is trapped, Escape
// closes it, the rest of the page is inert to screen readers.
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  side = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  side?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl' };
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-24px)] overflow-hidden rounded-2xl bg-white p-0 text-ink shadow-2xl',
        side ? 'mr-0 h-dvh max-h-dvh rounded-none rounded-l-2xl sm:w-[min(560px,100%)]' : `max-h-[calc(100dvh-32px)] ${widths[size]}`,
      )}
    >
      {open && (
        <div className={cn('flex flex-col', side ? 'h-full' : 'max-h-[calc(100dvh-32px)]')}>
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500">{description}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-1">
              <X />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            {state?.tone !== 'primary' && <AlertTriangle className="size-4 text-red-600" aria-hidden="true" />}
            {state?.title}
          </span>
        }
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.tone === 'primary' ? 'primary' : 'danger'} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? 'Delete'}
            </Button>
          </>
        }
      >
        <div className="text-sm leading-relaxed text-zinc-600">{state?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return value;
}
