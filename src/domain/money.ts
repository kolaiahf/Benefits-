/** Round a positive dollar calculation to the nearest cent. */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot round a non-finite amount");
  }
  return Math.round(value);
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${rem.toString().padStart(2, "0")}`;
}

export function ageOn(dateOfBirth: string, on: string): number {
  const birth = parseIsoDate(dateOfBirth);
  const asOf = parseIsoDate(on);
  let age = asOf.year - birth.year;
  if (asOf.month < birth.month || (asOf.month === birth.month && asOf.day < birth.day)) {
    age -= 1;
  }
  return age;
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date ${value}`);
  }
  return { year, month, day };
}

export function normalizeZip(value: string): string {
  const digits = value.trim().slice(0, 5);
  if (!/^\d{5}$/.test(digits)) {
    throw new Error(`Invalid ZIP ${value}`);
  }
  return digits;
}
