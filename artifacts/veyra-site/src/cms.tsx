// Where the site gets its content.
//
// In production the CMS server embeds the content for the requested page in
// the HTML (window.__VEYRA_BOOTSTRAP__), so the first paint is already the
// published content. In development the site fetches it from the API. If the
// API cannot be reached the site renders the bundled defaults instead, with
// forms switched off, so it never goes blank because of a backend problem.

import {
  fallbackBootstrap,
  formatCopyright,
  type MenuLocation,
  type PublicMenu,
  type SiteBootstrap,
} from '@workspace/cms-content';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

declare global {
  interface Window {
    __VEYRA_BOOTSTRAP__?: SiteBootstrap;
  }
}

export type SiteStatus = 'ready' | 'loading' | 'offline';

type SiteState = { data: SiteBootstrap; status: SiteStatus; path: string };

const SiteContext = createContext<SiteState | null>(null);

export function currentPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function previewRequested() {
  return new URLSearchParams(window.location.search).get('preview') === '1';
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const path = currentPath();
  const preview = previewRequested();
  // A preview always fetches fresh, since the embedded copy is the published one.
  const injected = preview ? undefined : window.__VEYRA_BOOTSTRAP__;

  const [state, setState] = useState<SiteState>(() => {
    if (injected) return { data: injected, status: 'ready', path };
    const fallback = fallbackBootstrap(path);
    // Home and contact have bundled copies; any other path waits for the API
    // rather than flashing a "not found" first.
    return { data: fallback, status: fallback.page ? 'ready' : 'loading', path };
  });

  useEffect(() => {
    if (injected) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ path });
    if (preview) query.set('preview', '1');
    fetch(`/api/public/bootstrap?${query}`, {
      signal: controller.signal,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`bootstrap ${response.status}`);
        return response.json() as Promise<SiteBootstrap>;
      })
      .then((data) => setState({ data, status: 'ready', path }))
      .catch(() => {
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, status: 'offline' }));
      });
    return () => controller.abort();
    // Content is fetched once per full page load; the site has no client-side navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pages can override the document title; the server already sets it in
  // production, this keeps development and previews honest too.
  const seoTitle = state.data.page?.seo.seoTitle;
  useEffect(() => {
    if (seoTitle) document.title = seoTitle;
  }, [seoTitle]);

  return (
    <SiteContext.Provider value={state}>
      {state.data.preview && <PreviewBanner />}
      {children}
    </SiteContext.Provider>
  );
}

function PreviewBanner() {
  return (
    <div className="cms-preview-banner" role="status">
      Preview — you are seeing unpublished changes. Visitors still see the published version.
    </div>
  );
}

export function useSite() {
  const value = useContext(SiteContext);
  if (!value) throw new Error('useSite must be used inside <SiteProvider>');
  return value;
}

export function useSettings() {
  return useSite().data.settings;
}

export function useCollections() {
  return useSite().data.collections;
}

export function usePage() {
  return useSite().data.page;
}

export function useMenu(location: MenuLocation): PublicMenu {
  return useSite().data.menus[location];
}

export function useCopyright() {
  return formatCopyright(useSettings().copyright);
}
