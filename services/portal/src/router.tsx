/**
 * Path routing under the portal's base (/portal/…), so docs pages can use #anchors and links can
 * be shared. The server serves the app shell for any /portal/* path.
 */
import { AnchorHTMLAttributes, MouseEvent, useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // "/portal"

export const href = (to: string) => `${BASE}${to.startsWith('/') ? to : `/${to}`}`;

function read(): string[] {
  const path = window.location.pathname.startsWith(BASE) ? window.location.pathname.slice(BASE.length) : window.location.pathname;
  return path.split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const url = href(to);
  if (options.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
  if (!url.includes('#')) window.scrollTo(0, 0);
}

/** Links from before path routing (#/apps/…) still work. */
function upgradeLegacyHash() {
  const hash = window.location.hash;
  if (hash.startsWith('#/')) navigate(hash.slice(1) || '/', { replace: true });
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    upgradeLegacyHash();
    const onChange = () => setRoute(read());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return route;
}

/** An <a> that navigates without reloading (modifier-clicks still open new tabs). */
export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
    const anchor = to.split('#')[1];
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  return <a href={href(to)} onClick={go} {...rest} />;
}
