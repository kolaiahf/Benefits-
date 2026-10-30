import type { Metal } from "../../quoting/types.js";
import { dollarsToCents } from "./benefits.js";

export interface SutterRate {
  region: string;
  name: string;
  metal: Metal;
  age21Cents: number;
}

export function parseSutter(text: string): SutterRate[] {
  const rates: SutterRate[] = [];
  for (const page of text.split("\f")) {
    const region = /Rating Region\s+(\d{1,2})/i.exec(page);
    if (!region) continue;
    const area = String(Number(region[1]));
    const lines = page.split(/\r?\n/);
    const nameLine = lines.find((line) => {
      const columns = columnsOf(line);
      return columns.length >= 4 && columns.every((column) => /HMO|HDHP/.test(column));
    });
    const metalLine = lines.find((line) => /^\s*Age\s+Platinum|^\s*Age\s+Gold/i.test(line) || (columnsOf(line)[0] === "Age" && columnsOf(line).length > 3));
    const age21 = lines.find((line) => /^\s*21\s/.test(line));
    if (!nameLine || !age21) continue;
    const names = columnsOf(nameLine);
    const prices = [...age21.matchAll(/\$[0-9,]+\.\d{2}/g)].map((match) => dollarsToCents(match[0]));
    const metals = metalLine ? columnsOf(metalLine).filter((column) => column !== "Age") : [];
    if (names.length !== prices.length) continue;
    names.forEach((name, index) => {
      const metalWord = (metals[index] ?? "").toLowerCase();
      const metal = metalWord === "platinum" || metalWord === "gold" || metalWord === "silver" || metalWord === "bronze" ? metalWord : null;
      if (!metal) return;
      rates.push({ region: area, name, metal, age21Cents: prices[index] });
    });
  }
  return rates;
}

function columnsOf(line: string): string[] {
  return line.trim().split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
}
