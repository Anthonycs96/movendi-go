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

export function nextDraftConfigurationCode(keys: string[]) {
  const used = new Set(keys);
  let sequence = 1;
  while (used.has(`NUEVO_${sequence}`)) sequence += 1;
  return `NUEVO_${sequence}`;
}
