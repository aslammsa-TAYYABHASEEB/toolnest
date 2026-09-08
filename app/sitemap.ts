import type { MetadataRoute } from "next";
import { categories, siteConfig, tools } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/privacy-policy", "/terms", "/disclaimer", "/contact"];
  const toolRoutes = tools
    .filter((tool) => tool.available && tool.href)
    .map((tool) => tool.href as string);
  return [
    ...[...staticRoutes, ...toolRoutes].map((route) => ({
      url: `${siteConfig.url}${route}`,
      changeFrequency: "monthly" as const,
      priority: route === "" ? 1 : 0.4,
    })),
    ...categories.map(({ slug }) => ({
      url: `${siteConfig.url}/categories/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
