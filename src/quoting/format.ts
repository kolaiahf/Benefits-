export function formatDollars(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = dollars.toLocaleString("en-US");
  if (rem === 0) return `${sign}$${body}`;
  return `${sign}$${body}.${rem.toString().padStart(2, "0")}`;
}

export function vsTodayLabel(amountCents: number, currentCents: number | null): string | null {
  if (currentCents == null || currentCents <= 0) return null;
  const pct = ((amountCents - currentCents) / currentCents) * 100;
  if (Math.abs(pct) < 0.05) return "Today";
  const text = Math.abs(pct).toFixed(1);
  return pct > 0 ? `+${text}%` : `−${text}%`;
}

export function coversLabel(spouse: boolean, childCount: number): string {
  if (!spouse && childCount === 0) return "Self";
  const child = childCount === 0 ? "" : childCount === 1 ? "1 child" : `${childCount} children`;
  if (spouse && child) return `+ Spouse, ${child}`;
  if (spouse) return "+ Spouse";
  return `+ ${child}`;
}
