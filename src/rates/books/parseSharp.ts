import type { Metal } from "../../quoting/types.js";
import { dollarsToCents } from "./benefits.js";

export interface SharpRate {
  family: string;
  name: string;
  metal: Metal;
  age21Cents: number;
}

/** Non-mirrored Sharp medical pages. The book does not name a rating area. */
export function parseSharp(text: string): { rates: SharpRate[]; skippedVariants: number } {
  const seen = new Map<string, number>();
  let skippedVariants = 0;
  const rates: SharpRate[] = [];
  for (const page of text.split("\f")) {
    if (!/Non-Mirrored/i.test(page)) continue;
    if (/optional|supplemental|rider/i.test(page)) continue;
    const lines = page.split(/\r?\n/);
    const title = lines.map((line) => line.trim()).find(Boolean) ?? "";
    const family = /^Sharp\s+(\w+)/.exec(title)?.[1];
    if (!family) continue;
    const ageIndex = lines.findIndex((line) => line.includes("Age Band"));
    const age21 = lines.find((line) => /^\s*21\s/.test(line));
    const metalLine = lines.find((line) => line.includes("Metal Tier"));
    if (ageIndex < 0 || !age21 || !metalLine) continue;
    let merged = lines[ageIndex];
    for (const extra of [...lines.slice(Math.max(0, ageIndex - 2), ageIndex), ...lines.slice(ageIndex + 1, ageIndex + 3)]) {
      if (!extra.trim() || /\$|Metal Tier|Age Band|Effective|Small Group/.test(extra) || /^\s*\d/.test(extra)) continue;
      merged = stamp(merged, extra);
    }
    const names = splitColumns(merged).filter((column) => column !== "Age Band").map((column) => (column === "HMO NG" ? "HMO NG WOW" : column));
    const metals = splitColumns(metalLine).filter((column) => column !== "Metal Tier");
    const prices = [...age21.matchAll(/\$[0-9,]+\.\d{2}/g)].map((match) => dollarsToCents(match[0]));
    if (names.length !== prices.length || metals.length !== prices.length) continue;
    names.forEach((name, index) => {
      const metal = metals[index].toLowerCase();
      if (metal !== "platinum" && metal !== "gold" && metal !== "silver" && metal !== "bronze") return;
      if (!/HMO|HDHP|PPO/.test(name)) return;
      const key = `${family}|${metal}|${name}`;
      const cents = prices[index];
      const previous = seen.get(key);
      if (previous !== undefined) {
        if (previous !== cents) skippedVariants += 1;
        return;
      }
      seen.set(key, cents);
      rates.push({ family, name, metal, age21Cents: cents });
    });
  }
  return { rates, skippedVariants };
}

function splitColumns(line: string): string[] {
  return line.trim().split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
}

function stamp(base: string, extra: string): string {
  const chars = base.padEnd(extra.length, " ").split("");
  let index = 0;
  while (index < extra.length) {
    if (extra[index] === " ") {
      index += 1;
      continue;
    }
    let end = index;
    while (end < extra.length && extra[end] !== " ") end += 1;
    const word = extra.slice(index, end);
    const open = word.split("").every((_, offset) => (chars[index + offset] ?? " ") === " ");
    if (open) {
      for (let offset = 0; offset < word.length; offset += 1) chars[index + offset] = word[offset];
    }
    index = end;
  }
  return chars.join("");
}
