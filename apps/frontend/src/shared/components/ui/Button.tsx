import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/shared/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export function Button({ className, variant = "primary", size = "md", loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn("button", `button--${variant}`, `button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
      {children}
    </button>
  );
}
