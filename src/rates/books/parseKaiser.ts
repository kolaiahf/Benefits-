import { dollarsToCents } from "./benefits.js";

export interface KaiserTable {
  areas: string[];
  columns: Array<{ name: string; age21Cents: number }>;
}

const WORD = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)"[^>]*>([^<]*)<\/word>/g;

/** Join Tableau's broken word boxes back into lines. */
export function reconstructKaiserHtml(html: string): string {
  const words: Array<{ y: number; x1: number; x2: number; text: string }> = [];
  for (const match of html.matchAll(WORD)) {
    words.push({
      y: Number(match[2]),
      x1: Number(match[1]),
      x2: Number(match[3]),
      text: decode(match[4]),
    });
  }
  words.sort((a, b) => a.y - b.y || a.x1 - b.x1);
  const lines: Array<{ y: number; words: typeof words }> = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(word.y - last.y) > 2.2) lines.push({ y: word.y, words: [word] });
    else last.words.push(word);
  }
  return lines
    .map((line) => {
      const sorted = [...line.words].sort((a, b) => a.x1 - b.x1);
      let buffer = "";
      let previous: number | null = null;
      const parts: string[] = [];
      for (const word of sorted) {
        if (previous == null) buffer = word.text;
        else if (word.x1 - previous < 8) buffer += word.text;
        else {
          parts.push(buffer);
          buffer = word.text;
        }
        previous = word.x2;
      }
      if (buffer) parts.push(buffer);
      return parts.join(" ");
    })
    .join("\n");
}

export function parseKaiserText(text: string): KaiserTable | null {
  const areaMatch = /Areas?\s*([\d,\s]+)/i.exec(text.replace(/\s+/g, ""));
  const areas = areaMatch
    ? [...areaMatch[1].matchAll(/\d{1,2}/g)].map((match) => String(Number(match[0]))).filter((area) => Number(area) >= 1 && Number(area) <= 19)
    : [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const age21 = lines.find((line) => /^21\b/.test(line) && line.includes("$"));
  if (!age21) return null;
  const amounts = [...age21.matchAll(/\$[0-9,]+\.\d{2}/g)].map((match) => dollarsToCents(match[0]));
  if (amounts.length < 2) return null;
  const sized = lines
    .filter((line) => !line.includes("$") && !/^[\d*-]/.test(line))
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length === amounts.length);
  const metalLine = sized.find((parts) => parts.some((part) => /platinum|gold|silver|bronze/i.test(part)));
  const detailLine = sized.find((parts) => parts !== metalLine && parts.some((part) => /PCP|Dental|HDHP|\//i.test(part)));
  const columns = amounts.map((cents, index) => {
    const raw = [metalLine?.[index], detailLine?.[index]].filter(Boolean).join(" ");
    return { name: pretty(raw), age21Cents: cents };
  }).filter((column) => column.name && /platinum|gold|silver|bronze/i.test(column.name));
  if (columns.length !== amounts.length) return null;
  return { areas, columns };
}

function pretty(value: string): string {
  return value
    .replace(/(Platinum|Gold|Silver|Bronze)(\d{2})(\d{2,4}\/)/g, "$1 $2 $3")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}
