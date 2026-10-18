"use client";
import { useEffect } from "react";

/*
 * Last-resort error page: replaces the root layout, so no globals.css, no fonts, no providers.
 * Everything is inline and mirrors the design tokens (canvas, glass card, accent button). Follows
 * prefers-color-scheme, and the saved theme override once mounted.
 */
const css = `
:root{color-scheme:light;--bg:oklch(0.985 0.004 200);--fg:oklch(0.22 0.015 215);--fg2:oklch(0.42 0.015 215);--card:oklch(1 0 0 / 0.82);--line:oklch(0.35 0.02 215 / 0.1);--accent:oklch(0.62 0.1 195);--accent-fg:oklch(1 0 0);--soft:oklch(0.57 0.16 25 / 0.1);--danger:oklch(0.57 0.16 25);--wash:oklch(0.905 0.05 195)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--bg:oklch(0.16 0.012 215);--fg:oklch(0.97 0.005 200);--fg2:oklch(0.82 0.012 205);--card:oklch(0.25 0.014 215 / 0.8);--line:oklch(1 0 0 / 0.08);--accent:oklch(0.75 0.095 194);--accent-fg:oklch(0.2 0.03 210);--soft:oklch(0.7 0.15 22 / 0.16);--danger:oklch(0.7 0.15 22);--wash:oklch(0.5 0.08 198)}}
:root[data-theme=dark]{color-scheme:dark;--bg:oklch(0.16 0.012 215);--fg:oklch(0.97 0.005 200);--fg2:oklch(0.82 0.012 205);--card:oklch(0.25 0.014 215 / 0.8);--line:oklch(1 0 0 / 0.08);--accent:oklch(0.75 0.095 194);--accent-fg:oklch(0.2 0.03 210);--soft:oklch(0.7 0.15 22 / 0.16);--danger:oklch(0.7 0.15 22);--wash:oklch(0.5 0.08 198)}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{display:grid;place-items:center;min-height:100dvh;padding:max(24px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom));background:radial-gradient(80vmax 80vmax at -10% -20%,color-mix(in oklab,var(--wash) 35%,transparent),transparent 60%),var(--bg);color:var(--fg);font:17px/22px -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.card{width:100%;max-width:384px;padding:28px 24px 24px;border-radius:28px;background:var(--card);border:0.5px solid var(--line);box-shadow:0 4px 12px oklch(0.3 0.03 220 / 0.07),0 28px 72px -18px oklch(0.3 0.03 220 / 0.26);-webkit-backdrop-filter:blur(30px) saturate(1.8);backdrop-filter:blur(30px) saturate(1.8);text-align:center}
.icon{width:56px;height:56px;margin:0 auto 16px;display:grid;place-items:center;border-radius:9999px;background:var(--soft);color:var(--danger)}
h1{margin:0;font-size:20px;line-height:25px;font-weight:600;letter-spacing:-0.022em}
p{margin:6px 0 0;font-size:15px;line-height:20px;color:var(--fg2)}
.actions{display:flex;flex-direction:column;gap:8px;margin-top:24px}
button,a{display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 20px;border-radius:9999px;font:600 15px/20px inherit;font-family:inherit;text-decoration:none;cursor:pointer;border:0}
button{background:var(--accent);color:var(--accent-fg)}
a{color:var(--fg);background:transparent;box-shadow:inset 0 0 0 0.5px var(--line)}
button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
small{display:block;margin-top:12px;font-size:12px;color:var(--fg2);opacity:.8}
`;

export default function GlobalError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    } catch {}
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Something went wrong · The Network</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main className="card" role="alert">
          <div className="icon" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <h1>The Network hit a snag</h1>
          <p>Something broke while loading the app. Your data is safe — including anything saved offline.</p>
          <div className="actions">
            <button type="button" onClick={() => (retry ?? reset)()}>
              Try again
            </button>
            {/* A full page load on purpose: the app's router is what failed. */}
            <a href="/today">Reload Today</a>
          </div>
          {error.digest && <small>Reference {error.digest}</small>}
        </main>
      </body>
    </html>
  );
}
