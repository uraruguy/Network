/**
 * Platform wording for passkey prompts ("Continue with Face ID"). Pure, shared by server pages
 * (first paint, from the User-Agent) and the client (refined with real capability checks).
 */

export type Platform = "iphone" | "ipad" | "mac" | "android" | "windows" | "other";
/** What the system sheet will ask for, as a button should say it. */
export type Biometric = "Face ID" | "Touch ID" | "passkey";

export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPod/.test(ua)) return "iphone";
  // iPadOS reports a Mac user agent; touch support gives it away (client side only).
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "ipad";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  return "other";
}

/**
 * iPhones use Face ID (bar the SE), Macs Touch ID. iPads come with either, and without a
 * built-in authenticator the browser offers a phone or security key — so say "passkey" there.
 */
export function biometricFor(platform: Platform, hasPlatformAuthenticator: boolean): Biometric {
  if (!hasPlatformAuthenticator) return "passkey";
  if (platform === "iphone") return "Face ID";
  if (platform === "mac") return "Touch ID";
  return "passkey";
}

/** Default name for a new passkey (editable later in Settings). */
export function deviceName(platform: Platform): string {
  return { iphone: "iPhone", ipad: "iPad", mac: "Mac", android: "Android", windows: "Windows", other: "Passkey" }[platform];
}
