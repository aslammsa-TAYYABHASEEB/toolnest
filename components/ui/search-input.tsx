import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
};

export function SearchInput({ label = "Search tools", className, ...props }: SearchInputProps) {
  return (
    <label className={cn("search-input", className)}>
      <span className="sr-only">{label}</span>
      <span className="search-icon" aria-hidden="true" />
      <input type="search" placeholder="Search tools (coming soon)" aria-label={label} {...props} />
      <kbd aria-hidden="true">/</kbd>
    </label>
  );
}
