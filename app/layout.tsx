import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { siteConfig } from "@/lib/site";

const homepageTitle = "ToolNest – Free Online Tools for PDF, Images, Text & Calculators";
const homepageDescription = "Free online tools for PDFs, images, text, and everyday calculations. Many tools run directly in your browser for a fast, privacy-first experience.";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: homepageTitle, template: `%s | ${siteConfig.name}` },
  description: homepageDescription,
  applicationName: siteConfig.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: homepageTitle,
    description: homepageDescription,
    url: "/",
  },
  twitter: { card: "summary", title: homepageTitle, description: homepageDescription },
};

const themeScript = `
  try {
    const saved = localStorage.getItem("toolnest-theme") || "system";
    const dark = saved === "dark" || (saved === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (_) {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
