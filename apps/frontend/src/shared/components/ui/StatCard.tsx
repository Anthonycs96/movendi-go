import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./Card";
import { cn } from "@/shared/lib/cn";

export function StatCard({ label, value, detail, trend, icon: Icon, tone = "blue" }: {
  label: string;
  value: string;
  detail: string;
  trend?: "up" | "down";
  icon: LucideIcon;
  tone?: "blue" | "amber" | "emerald" | "violet";
}) {
  const TrendIcon = trend === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <Card className="stat-card">
      <div className={cn("stat-card__icon", `stat-card__icon--${tone}`)}><Icon size={19} /></div>
      <div className="stat-card__main">
        <span>{label}</span>
        <strong>{value}</strong>
        <small className={trend === "down" ? "trend trend--down" : "trend"}>
          {trend ? <TrendIcon size={13} /> : null}{detail}
        </small>
      </div>
    </Card>
  );
}
