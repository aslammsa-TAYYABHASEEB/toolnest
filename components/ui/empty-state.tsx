import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
  icon?: ReactNode;
};

export function EmptyState({ eyebrow, title, description, action, icon }: EmptyStateProps) {
  return (
    <section className="empty-state">
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      {eyebrow && <span className="eyebrow-text">{eyebrow}</span>}
      <h1>{title}</h1>
      <p>{description}</p>
      {action && <Button href={action.href}>{action.label}</Button>}
    </section>
  );
}
