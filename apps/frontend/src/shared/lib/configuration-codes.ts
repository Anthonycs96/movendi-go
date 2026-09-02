export function configurationCodeFromLabel(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function uniqueConfigurationCodeFromLabel(value: string, keys: string[]) {
  const base = configurationCodeFromLabel(value);
  if (!base) return "";
  const used = new Set(keys);
  if (!used.has(base)) return base;
  let sequence = 2;
  while (true) {
    const suffix = `_${sequence}`;
    const candidate = `${base.slice(0, 60 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
    sequence += 1;
  }
}

export function nextDraftConfigurationCode(keys: string[], prefix = "NUEVO") {
  const normalizedPrefix = configurationCodeFromLabel(prefix) || "NUEVO";
  const used = new Set(keys);
  let sequence = 1;
  while (used.has(`${normalizedPrefix}_${sequence}`)) sequence += 1;
  return `${normalizedPrefix}_${sequence}`;
}
