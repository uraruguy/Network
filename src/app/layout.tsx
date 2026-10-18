import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { headInlineScript } from "@/lib/security/inline-scripts";

const APP_NAME = "The Network";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Your people, on a globe. Notes, follow-ups and an AI that knows your network.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: APP_NAME },
  formatDetection: { telephone: false },
  // Private app: keep every page out of search indexes (robots.txt + X-Robots-Tag say the same).
  robots: { index: false, follow: false },
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

// The pre-paint theme script lives in lib/security so the strict sign-in CSP can allow it by hash
// (reading a per-request nonce here would make every page dynamic). See src/lib/security/csp.ts.
const headScript = headInlineScript(process.env.NODE_ENV === "development");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: headScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        {/* The service worker registers from signed-in pages only: see (app)/layout.tsx. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
