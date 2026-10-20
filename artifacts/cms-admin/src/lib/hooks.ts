import { useEffect, useRef, useState } from 'react';

// Warn before leaving the tab with unsaved edits.
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

// A local working copy of server data, plus whether it differs from what was
// last loaded or saved.
export function useDraft<T>(source: T | undefined) {
  const [draft, setDraft] = useState<T | undefined>(source);
  const baseline = useRef<string>(JSON.stringify(source ?? null));
  const loadedFor = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (source !== undefined && source !== loadedFor.current) {
      loadedFor.current = source;
      baseline.current = JSON.stringify(source);
      setDraft(source);
    }
  }, [source]);

  const dirty = draft !== undefined && JSON.stringify(draft) !== baseline.current;
  return { draft, setDraft, dirty };
}

export function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
