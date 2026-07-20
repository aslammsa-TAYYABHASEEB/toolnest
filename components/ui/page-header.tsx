import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { cn } from "@/lib/cn";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  icon?: ReactNode;
  accent?: string;
  compact?: boolean;
};

export function PageHeader({ title, description, eyebrow, icon, accent, compact }: PageHeaderProps) {
  return (
    <header className={cn("page-header", accent && `accent-${accent}`, compact && "page-header-compact")}>
      <div className="container">
        <Breadcrumbs current={title} />
        <div className="page-header-row">
          {icon && <span className="page-header-icon" aria-hidden="true">{icon}</span>}
          <div>
            {eyebrow && <span className="eyebrow-text">{eyebrow}</span>}
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
