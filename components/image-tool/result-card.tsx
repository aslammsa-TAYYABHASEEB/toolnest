import type { ReactNode } from "react";

type ResultCardProps = {
  className: string;
  icon: string;
  title: string;
  description: ReactNode;
  actions: ReactNode;
};

export function ResultCard({
  className,
  icon,
  title,
  description,
  actions,
}: ResultCardProps) {
  return (
    <div className={className} role="status">
      <span className="success-mark" aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        {description}
      </div>
      {actions}
    </div>
  );
}
