"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { categories } from "@/lib/site";
import { BrowseAllMenu } from "@/components/ui/browse-all-menu";
import { SearchInput } from "@/components/ui/search-input";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/#categories", label: "Categories" },
  { href: "/#popular-tools", label: "Popular tools" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container-app nav-shell">
        <Link className="brand" href="/" aria-label="ToolNest home">
          <BrandLogo />
        </Link>

        {pathname !== "/" && <div className="header-search"><SearchInput /></div>}

        <nav className="desktop-nav" aria-label="Main navigation">
          {navItems.slice(0, 2).map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          <BrowseAllMenu />
        </nav>

        <div className="header-actions">
          <ThemeToggle />
          <details className="mobile-menu">
            <summary aria-label="Open navigation"><span /><span /><span /></summary>
            <div className="mobile-menu-panel">
              <div className="mobile-menu-heading"><strong>Menu</strong><span>Explore ToolNest</span></div>
              <SearchInput label="Search tools in mobile navigation" />
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
