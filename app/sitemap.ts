import type { MetadataRoute } from "next";
import { categories, siteConfig } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/tools/image-converter", "/tools/image-compressor", "/tools/image-resizer", "/tools/pdf-merge", "/tools/pdf-split", "/privacy-policy", "/terms", "/disclaimer", "/contact"];
  return [...staticRoutes.map((route) => ({ url: `${siteConfig.url}${route}`, changeFrequency: "monthly" as const, priority: route === "" ? 1 : 0.4 })), ...categories.map(({ slug }) => ({ url: `${siteConfig.url}/categories/${slug}`, changeFrequency: "weekly" as const, priority: 0.8 }))];
}
