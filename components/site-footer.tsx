import Link from "next/link";
import { categories, siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Link className="brand footer-brand" href="/">
            <span className="brand-mark" aria-hidden="true">T</span>
            <span>Tool<span>Nest</span></span>
          </Link>
          <p>{siteConfig.description}</p>
          <div className="footer-status"><span aria-hidden="true" /> Files stay on your device</div>
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
      <div className="container footer-bottom">
        <p>© {new Date().getFullYear()} ToolNest. All rights reserved.</p>
        <p>Fast by default. Private by design.</p>
      </div>
    </footer>
  );
}
