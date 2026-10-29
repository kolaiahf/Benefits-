/**
 * Federal default standard age curve.
 *
 * Ages 21–64 follow the HHS default standard age curve in Appendix I of the
 * CMS market-reforms guidance (February 25, 2013). Ages 0–20 follow the child
 * curve in the CMS Insurance Standards Bulletin of December 16, 2016, which
 * applies for plan years beginning on or after January 1, 2018. Age 64 and
 * older is a single band at 3.000, the federal 3:1 adult cap.
 */
const FACTOR_BY_AGE: Record<number, number> = {
  15: 0.833,
  16: 0.859,
  17: 0.885,
  18: 0.913,
  19: 0.941,
  20: 0.97,
  21: 1.0,
  22: 1.0,
  23: 1.0,
  24: 1.0,
  25: 1.004,
  26: 1.024,
  27: 1.048,
  28: 1.087,
  29: 1.119,
  30: 1.135,
  31: 1.159,
  32: 1.183,
  33: 1.198,
  34: 1.214,
  35: 1.222,
  36: 1.23,
  37: 1.238,
  38: 1.246,
  39: 1.262,
  40: 1.278,
  41: 1.302,
  42: 1.325,
  43: 1.357,
  44: 1.397,
  45: 1.444,
  46: 1.5,
  47: 1.563,
  48: 1.635,
  49: 1.706,
  50: 1.786,
  51: 1.865,
  52: 1.952,
  53: 2.04,
  54: 2.135,
  55: 2.23,
  56: 2.333,
  57: 2.437,
  58: 2.548,
  59: 2.603,
  60: 2.714,
  61: 2.81,
  62: 2.873,
  63: 2.952,
};

export function ageBand(age: number): string {
  if (age <= 14) return "0-14";
  if (age >= 64) return "64+";
  return String(age);
}

export function federalAgeFactor(age: number): number {
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    throw new Error(`Age ${age} is outside the rating range 0–120`);
  }
  if (age <= 14) return 0.765;
  if (age >= 64) return 3;
  const factor = FACTOR_BY_AGE[age];
  if (factor === undefined) throw new Error(`Missing age factor for ${age}`);
  return factor;
}

/**
 * 45 CFR 147.102: when summing a family's premium, count at most the three
 * oldest covered children under age 21. Older children are rated as adults.
 * Returns the census ids that are not billed.
 */
export function cappedChildIds(
  children: Array<{ id: string; age: number }>,
): Set<string> {
  const minors = children
    .filter((child) => child.age < 21)
    .sort((a, b) => b.age - a.age || a.id.localeCompare(b.id));
  return new Set(minors.slice(3).map((child) => child.id));
}
