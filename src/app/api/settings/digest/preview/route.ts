import { notFound, withOwner } from "@/lib/api-server";
import { renderDigestPreview } from "@/lib/data/digest";

/**
 * Today's digest e-mail for the signed-in owner, as HTML (`?format=text` for the plain-text part).
 * Nothing is sent or marked.
 */
export const GET = withOwner(async ({ ownerId, url }) => {
  const content = (await renderDigestPreview(ownerId)) ?? notFound();
  if (url.searchParams.get("format") === "text") return new Response(content.text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(content.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Rendered in a new tab: no scripts, no framing by other sites.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-ancestors 'self'",
    },
  });
});
