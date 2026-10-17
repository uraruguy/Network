import type { Metadata, Viewport } from "next";
import { SerwistProvider } from "@serwist/next/react";
import "./globals.css";
import { Providers } from "@/components/providers";

const APP_NAME = "The Network";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Your people, on a globe. Notes, follow-ups and an AI that knows your network.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: APP_NAME },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    // Canvas colour (--bg) per scheme; ThemeSync pins both when the user overrides the OS.
    { media: "(prefers-color-scheme: light)", color: "#f7fbfb" },
    { media: "(prefers-color-scheme: dark)", color: "#070f10" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Applies .dark + color-scheme before first paint; honours a saved override. ThemeSync takes over after hydration.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';if(t==='light'||t==='dark'){var c=d?'#070f10':'#f7fbfb';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})}}catch(e){}})();`;
const devErrorHook =
  process.env.NODE_ENV === "development"
    ? `window.__errs=[];addEventListener('error',function(e){window.__errs.push(String(e.error&&e.error.stack||e.message).slice(0,2000))});addEventListener('unhandledrejection',function(e){window.__errs.push('REJ '+String(e.reason&&e.reason.stack||e.reason).slice(0,2000))});`
    : "";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + devErrorHook }} />
      </head>
      <body className="min-h-dvh antialiased">
        <SerwistProvider swUrl="/sw.js">
          <Providers>{children}</Providers>
        </SerwistProvider>
      </body>
    </html>
  );
}
