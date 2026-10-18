/**
 * Plain-text fallback for an HTML e-mail: keeps link targets ("Done ✓ (https://…)"), turns block
 * elements into line breaks and decodes the handful of entities our templates use. Pure.
 */
export function htmlToText(html: string): string {
  const decode = (s: string) =>
    s
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  return decode(
    html
      .replace(/<(head|style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        return text && text !== href ? `${text} (${href})` : href;
      })
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
