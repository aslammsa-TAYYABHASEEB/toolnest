import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const descriptionId = inputId ? `${inputId}-description` : undefined;
  return (
    <label className="input-field" htmlFor={inputId}>
      {label && <span className="input-label">{label}</span>}
      <input ref={ref} id={inputId} className={cn("input-control", error && "is-invalid", className)} aria-invalid={Boolean(error)} aria-describedby={(hint || error) ? descriptionId : undefined} {...props} />
      {(hint || error) && <span id={descriptionId} className={cn("input-hint", error && "is-error")}>{error ?? hint}</span>}
    </label>
  );
});
