import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type SharedProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

type ButtonProps = SharedProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };
type ButtonLinkProps = SharedProps & { href: string; ariaLabel?: string };

export function buttonClassName({ variant = "primary", size = "md", className }: Omit<SharedProps, "children"> = {}) {
  return cn("ui-button", `ui-button-${variant}`, `ui-button-${size}`, className);
}

export function Button(props: ButtonProps | ButtonLinkProps) {
  if ("href" in props && props.href) {
    const { href, children, className, variant, size, ariaLabel } = props;
    return <Link href={href} aria-label={ariaLabel} className={buttonClassName({ variant, size, className })}>{children}</Link>;
  }

  const { children, className, variant, size, type = "button", ...buttonProps } = props as ButtonProps;
  return <button type={type} className={buttonClassName({ variant, size, className })} {...buttonProps}>{children}</button>;
}
