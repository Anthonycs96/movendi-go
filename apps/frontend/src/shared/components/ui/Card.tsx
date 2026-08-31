import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export function Card({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={cn("card", className)} {...props}>{children}</div>;
}
