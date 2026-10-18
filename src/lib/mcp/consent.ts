/**
 * Where the consent page may send an OAuth authorization code. Pure; tested.
 *
 * Supabase's OAuth server knows nothing about the passkey, so a password-only session can approve
 * an authorization for itself. Two checks keep that from becoming access: /api/mcp honours only
 * sessions minted right after a passkey-verified approval (approvals.ts), and codes only go to
 * public https hosts. Loopback, private-network and custom-scheme redirects belong to apps on a
 * computer (Claude Code, Cursor, desktop clients, MCP Inspector) — public clients without a
 * secret, which anyone holding the password could impersonate — so those connect with a personal
 * access token instead.
 *
 * Only the redirect URI of the authorization at hand is checked: the user-facing Supabase API
 * doesn't list a client's other registered URIs (that needs the service-role admin API, which the
 * app deliberately doesn't hold).
 */

export type RedirectProblem = "invalid" | "local" | "insecure";

/** Loopback and local-network names: `localhost`, `*.localhost`, mDNS and home/intranet suffixes, single labels. */
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** 0/8, 10/8, CGNAT 100.64/10, 127/8, link-local 169.254/16, 172.16/12, 192.0.0/24, 192.168/16, benchmark 198.18/15, multicast and above. */
function privateIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a! >= 224
  );
}

/** Loopback, unspecified, IPv4-mapped, unique-local (fc00::/7) and link-local (fe80::/10) IPv6. */
function privateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  return h === "::1" || h === "::" || h.startsWith("::ffff:") || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
}

export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = ipv4(h);
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || (v4 !== null && v4[0] === 127);
}

/** True for hosts that only resolve on the owner's machine or network. */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!h) return true;
  if (h.includes(":")) return privateIpv6(h);
  const v4 = ipv4(h);
  if (v4) return privateIpv4(v4);
  return h === "localhost" || !h.includes(".") || LOCAL_SUFFIXES.some((s) => h.endsWith(s));
}

/**
 * Why a code must not go to `uri`, or null if it may. `allowLoopback` admits http(s) loopback
 * redirects — only for an app that itself runs on localhost (local development).
 */
export function redirectProblem(uri: string, opts: { allowLoopback?: boolean } = {}): RedirectProblem | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return "invalid";
  }
  const web = url.protocol === "https:" || url.protocol === "http:";
  if (!web || !url.hostname) return "local"; // custom scheme (cursor://, com.example.app:/…): a native app
  if (opts.allowLoopback && isLoopbackHost(url.hostname)) return null;
  if (isLocalHost(url.hostname)) return "local";
  return url.protocol === "https:" ? null : "insecure";
}

/** The policy for this deployment: loopback redirects only while the app itself is served from loopback. */
export function consentPolicy(appUrl: string): { allowLoopback: boolean } {
  try {
    return { allowLoopback: isLoopbackHost(new URL(appUrl).hostname) };
  } catch {
    return { allowLoopback: false };
  }
}

/** Host to show for a redirect URI (falls back to the raw string). */
export function redirectHost(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host || `${url.protocol}//`;
  } catch {
    return uri;
  }
}
