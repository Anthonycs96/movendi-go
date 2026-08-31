import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("page-container", className)}>{children}</div>;
}
