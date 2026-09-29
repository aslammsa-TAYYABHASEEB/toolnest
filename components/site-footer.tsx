import Link from "next/link";
import { categories, siteConfig } from "@/lib/site";
import { BrandLogo } from "@/components/brand-logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container-app footer-grid">
        <div>
          <Link className="brand footer-brand" href="/" aria-label="ToolNest home">
            <BrandLogo />
          </Link>
          <p>{siteConfig.description}</p>
          <p className="footer-note">Your content is handled in the browser.</p>
        </div>
        <div>
          <h2>Tools</h2>
          {categories.map((category) => <Link key={category.slug} href={`/categories/${category.slug}`}>{category.name}</Link>)}
        </div>
        <div>
          <h2>Company</h2>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy-policy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/disclaimer">Disclaimer</Link>
        </div>
      </div>
      <div className="container-app footer-bottom">
        <p>© {new Date().getFullYear()} ToolNest. All rights reserved.</p>
        <p>Tool-specific network details are shown where relevant.</p>
      </div>
    </footer>
  );
}
