import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "violet";

export function StatusBadge({ children, tone = "neutral", dot = false }: { children: ReactNode; tone?: BadgeTone; dot?: boolean }) {
  return <span className={cn("badge", `badge--${tone}`)}>{dot ? <span className="badge__dot" /> : null}{children}</span>;
}
