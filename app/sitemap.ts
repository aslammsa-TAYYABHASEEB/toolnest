import type { MetadataRoute } from "next";
import { categories, siteConfig } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/tools/percentage-calculator", "/tools/image-converter", "/tools/image-compressor", "/tools/image-resizer", "/tools/pdf-merge", "/tools/pdf-split", "/tools/jpg-to-pdf", "/tools/pdf-to-jpg", "/tools/pdf-rotate", "/tools/pdf-compress", "/tools/qr-code-generator", "/tools/json-formatter", "/tools/case-converter", "/tools/remove-extra-spaces", "/tools/word-counter", "/privacy-policy", "/terms", "/disclaimer", "/contact"];
  return [...staticRoutes.map((route) => ({ url: `${siteConfig.url}${route}`, changeFrequency: "monthly" as const, priority: route === "" ? 1 : 0.4 })), ...categories.map(({ slug }) => ({ url: `${siteConfig.url}/categories/${slug}`, changeFrequency: "weekly" as const, priority: 0.8 }))];
}
