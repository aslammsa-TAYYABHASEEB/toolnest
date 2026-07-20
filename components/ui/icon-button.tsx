import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
};

export function IconButton({ label, children, className, type = "button", ...props }: IconButtonProps) {
  return <button type={type} aria-label={label} title={label} className={cn("icon-button", className)} {...props}>{children}</button>;
}
