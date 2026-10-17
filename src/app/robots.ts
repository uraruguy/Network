import type { MetadataRoute } from "next";

/** A private, single-user app: ask every crawler to stay out (X-Robots-Tag covers the rest). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
