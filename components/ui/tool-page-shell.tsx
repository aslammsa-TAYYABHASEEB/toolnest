import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ToolPageShellProps = {
  children: ReactNode;
  trust?: ReactNode;
  width?: "standard" | "wide";
  className?: string;
};

/** Shared outer composition for tools. Internal tool workflows remain independent. */
export function ToolPageShell({ children, trust, width = "standard", className }: ToolPageShellProps) {
  return (
    <section className={cn("tool-page-section", className)}>
      <div className={cn("tool-page-shell", Boolean(trust) && "tool-page-shell-has-trust", width === "wide" ? "container-workspace" : "container-app")}>
        {trust}
        <div className="tool-page-workspace">{children}</div>
      </div>
    </section>
  );
}
