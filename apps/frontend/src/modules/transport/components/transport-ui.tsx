"use client";

import { StatusBadge } from "@/shared/components/ui";
import type { BadgeTone } from "@/shared/components/ui/StatusBadge";
import { formatCurrencyCents, formatDateTimeInput } from "@/shared/lib/format";
import { localizeCode } from "@/shared/lib/localization";

export const nowInput = () => formatDateTimeInput(new Date());
export const futureInput = (hours: number) => formatDateTimeInput(new Date(Date.now() + hours * 3_600_000));

const statusTone = (status: string): BadgeTone => ["AVAILABLE", "VALID", "APPROVED", "DELIVERED", "COMPLETED", "CLOSED", "POSTED", "PRESENT"].includes(status)
  ? "success"
  : ["OPEN", "PENDING", "PLANNED", "ASSIGNED", "IN_PROGRESS", "IN_TRANSIT"].includes(status)
    ? "warning"
    : ["EXPIRED", "REJECTED", "CANCELLED", "OUT_OF_SERVICE", "SUSPENDED", "CRITICAL"].includes(status)
      ? "danger"
      : "info";

export const Badge = ({ value }: { value: string }) => <StatusBadge tone={statusTone(value)}>{localizeCode(value)}</StatusBadge>;
export const money = (value: number) => formatCurrencyCents(value);
