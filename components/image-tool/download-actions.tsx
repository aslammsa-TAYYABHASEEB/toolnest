import { Fragment } from "react";
import { buttonClassName } from "@/components/ui/button";
import type { ImageDownloadAction } from "@/lib/image/download";

type DownloadActionsProps = {
  actions: ImageDownloadAction[];
  className?: string;
};

export function DownloadActions({
  actions,
  className,
}: DownloadActionsProps) {
  const links = actions.map((action) => (
    <a
      key={`${action.label}-${action.filename}`}
      className={action.variant === "button"
        ? buttonClassName({ variant: "secondary" })
        : "result-secondary-link"}
      href={action.url}
      download={action.filename}
    >
      {action.label}
    </a>
  ));

  if (className) return <div className={className}>{links}</div>;
  return <Fragment>{links}</Fragment>;
}
