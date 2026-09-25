import type { ReactNode } from "react";

type TrustStripProps = {
  label?: string;
  title: string;
  description?: string;
  items?: ReactNode[];
};

/** Compact factual support below a workspace; claims are supplied per tool. */
export function TrustStrip({ label = "Private processing", title, description, items = [] }: TrustStripProps) {
  return (
    <aside className="trust-strip">
      <span className="trust-strip-mark" aria-hidden="true">✓</span>
      <div className="trust-strip-copy">
        <span className="trust-strip-label">{label}</span>
        <strong>{title}</strong>
        {description && <p>{description}</p>}
      </div>
      {items.length > 0 && <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    </aside>
  );
}
