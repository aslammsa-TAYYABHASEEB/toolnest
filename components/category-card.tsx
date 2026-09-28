import Link from "next/link";
import type { Category } from "@/lib/site";

export function CategoryCard({ category, count, examples = [] }: { category: Category; count: number; examples?: string[] }) {
  return (
    <Link className={`category-card accent-${category.accent}`} href={`/categories/${category.slug}`}>
      <span className="category-icon" aria-hidden="true">{category.icon}</span>
      <span className="category-copy">
        <strong>{category.name}</strong>
        <span>{category.description}</span>
        {examples.length > 0 && <span className="category-examples">{examples.join(" · ")}</span>}
        <span className="category-count">{count} tools</span>
      </span>
    </Link>
  );
}
