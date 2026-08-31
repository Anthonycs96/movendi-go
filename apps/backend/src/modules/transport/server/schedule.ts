const DAY_MS = 86_400_000;

function localDayNumber(value: Date) {
  return Math.floor(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / DAY_MS);
}

export function scheduledTypeAt(anchor: Date, workDays: number, restDays: number, target: Date): "WORK" | "REST" {
  const cycle = workDays + restDays;
  if (workDays < 1 || restDays < 1 || cycle < 2) return "WORK";
  const elapsed = localDayNumber(target) - localDayNumber(anchor);
  const position = ((elapsed % cycle) + cycle) % cycle;
  return position < workDays ? "WORK" : "REST";
}

export function overlaps(startsAt: Date, endsAt: Date, otherStart: Date, otherEnd: Date) {
  return startsAt < otherEnd && endsAt > otherStart;
}
