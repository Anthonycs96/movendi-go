/** Allocate integer cents without losing the remainder to per-line rounding. */
export function allocateCents(totalCents: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || !weights.length || weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) throw new RangeError("Invalid cent allocation");
  const sum = weights.reduce((total, weight) => total + BigInt(weight), 0n);
  const denominator = sum || BigInt(weights.length);
  const total = BigInt(totalCents);
  const shares = weights.map((weight, index) => {
    const numerator = total * (sum ? BigInt(weight) : 1n);
    return { index, cents: Number(numerator / denominator), remainder: numerator % denominator };
  });
  let remaining = totalCents - shares.reduce((value, share) => value + share.cents, 0);
  const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const share of ranked) {
    if (!remaining) break;
    share.cents += 1;
    remaining -= 1;
  }
  return shares.map((share) => share.cents);
}
