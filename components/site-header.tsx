import Link from "next/link";
import { categories } from "@/lib/site";
import { SearchInput } from "@/components/ui/search-input";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/#categories", label: "Categories" },
  { href: "/#popular-tools", label: "Popular tools" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container nav-shell">
        <Link className="brand" href="/" aria-label="ToolNest home">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>Tool<span>Nest</span></span>
        </Link>

        <div className="header-search"><SearchInput disabled /></div>

        <nav className="desktop-nav" aria-label="Main navigation">
          {navItems.slice(0, 2).map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          <details className="nav-dropdown">
            <summary>Browse all</summary>
            <div className="nav-dropdown-menu">
              {categories.map((category) => (
                <Link key={category.slug} href={`/categories/${category.slug}`}>{category.name}</Link>
              ))}
            </div>
          </details>
        </nav>

        <div className="header-actions">
          <ThemeToggle />
          <details className="mobile-menu">
            <summary aria-label="Open navigation"><span /><span /><span /></summary>
            <div className="mobile-menu-panel">
              <div className="mobile-menu-heading"><strong>Menu</strong><span>Explore ToolNest</span></div>
              <SearchInput disabled />
              <nav aria-label="Mobile navigation">
                {navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
                <span className="mobile-nav-label">Categories</span>
                {categories.map((category) => (
                  <Link key={category.slug} href={`/categories/${category.slug}`}><span className={`mini-icon ${category.accent}`}>{category.icon}</span>{category.name}</Link>
                ))}
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
