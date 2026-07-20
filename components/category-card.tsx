import Link from "next/link";
import type { Category } from "@/lib/site";
import { Badge } from "@/components/ui/badge";

export function CategoryCard({ category, count }: { category: Category; count: number }) {
  return (
    <Link className={`category-card accent-${category.accent}`} href={`/categories/${category.slug}`}>
      <span className="category-icon" aria-hidden="true">{category.icon}</span>
      <span className="category-copy">
        <strong>{category.name}</strong>
        <span>{category.description}</span>
        <Badge>{count} tools planned</Badge>
      </span>
      <span className="round-arrow" aria-hidden="true">→</span>
    </Link>
  );
}
