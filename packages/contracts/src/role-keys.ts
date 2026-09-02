const automaticRoleKeyPattern = /^ROL_(\d+)$/;

export function isAutomaticRoleKey(key: string) {
  const match = automaticRoleKeyPattern.exec(key.trim().toUpperCase());
  if (!match) return false;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) && sequence > 0;
}

export function nextAutomaticRoleKey(roles: ReadonlyArray<{ key: string }>) {
  const highestSequence = roles.reduce((highest, role) => {
    const match = automaticRoleKeyPattern.exec(role.key.trim().toUpperCase());
    if (!match) return highest;
    const sequence = Number(match[1]);
    return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);

  return `ROL_${Math.max(roles.length, highestSequence) + 1}`;
}
