/**
 * The root layout's only inline script, kept here so the proxy can allow it by hash in the strict
 * sign-in CSP (see csp.ts) without the layout reading a per-request nonce — which would make
 * every page dynamic.
 *
 * Change the text and the hash follows automatically (both sides import this module).
 */

/** Applies .dark + color-scheme before first paint; honours a saved override. ThemeSync takes over after hydration. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';if(t==='light'||t==='dark'){var c=d?'#070f10':'#f7fbfb';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})}}catch(e){}})();`;

/** Development only: collects uncaught errors on `window.__errs` for browser automation. */
export const DEV_ERROR_HOOK = `window.__errs=[];addEventListener('error',function(e){window.__errs.push(String(e.error&&e.error.stack||e.message).slice(0,2000))});addEventListener('unhandledrejection',function(e){window.__errs.push('REJ '+String(e.reason&&e.reason.stack||e.reason).slice(0,2000))});`;

/** The exact text rendered in `<head>`. */
export function headInlineScript(dev: boolean = process.env.NODE_ENV === "development"): string {
  return THEME_SCRIPT + (dev ? DEV_ERROR_HOOK : "");
}
