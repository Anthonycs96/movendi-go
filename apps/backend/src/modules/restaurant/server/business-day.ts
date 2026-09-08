function parts(date: Date, timeZone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second) };
}

export function fromLocal(local: Date, timeZone: string) {
  let result = local.getTime();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const value = parts(new Date(result), timeZone);
    const represented = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
    const correction = local.getTime() - represented;
    result += correction;
    if (!correction) break;
  }
  return new Date(result);
}

export function restaurantBusinessDay(now: Date, timeZone: string, cutoffHour = 0) {
  const value = parts(now, timeZone);
  const local = new Date(Date.UTC(value.year, value.month - 1, value.day - (value.hour < cutoffHour ? 1 : 0), cutoffHour));
  const next = new Date(local);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: fromLocal(local, timeZone), end: fromLocal(next, timeZone) };
}

export function restaurantCalendarDayOffset(now: Date, timeZone: string, offset: number) {
  const value = parts(now, timeZone);
  return fromLocal(new Date(Date.UTC(value.year, value.month - 1, value.day + offset)), timeZone);
}
