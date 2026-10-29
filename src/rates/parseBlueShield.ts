import { BLUE_SHIELD_FILED_LABEL, type AncillaryPlan, type MedicalPlan, type Metal, type Plan, type Tier } from "../domain/types.js";

export const BLUE_SHIELD_Q4_2026 = {
  document: "A46124GRP-2026Q4-SmallBusinessRateBook.pdf",
  url: "https://www.blueshieldca.com/content/dam/bsca/en/broker/docs/2026/small-business/A46124GRP-2026Q4-SmallBusinessRateBook.pdf",
  effectiveStart: "2026-10-01",
  effectiveEnd: "2026-12-31",
  label: BLUE_SHIELD_FILED_LABEL,
} as const;

export interface AgeTable {
  region: string;
  network: string;
  names: string[];
  ages: Record<string, number[]>;
}

export interface TierRow {
  id: string;
  name: string;
  line: "dental" | "vision";
  regions: string[];
  tiers: Record<Tier, number>;
}

const AGE_ROW = /^\s*(0 to ?14|\d{1,2}|64\+)\s+\$/;
const MONEY = /\$[0-9,]+\.\d{2}/g;

export function parseBlueShieldLayout(text: string): { medical: AgeTable[]; ancillary: TierRow[] } {
  return { medical: parseMedical(text), ancillary: parseAncillary(text) };
}

export function plansFromBlueShield(text: string): Plan[] {
  const parsed = parseBlueShieldLayout(text);
  return [...medicalPlans(parsed.medical), ...ancillaryPlans(parsed.ancillary)];
}

function parseMedical(text: string): AgeTable[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "Medical benefits product rates");
  if (start < 0) throw new Error("Medical benefits section was not found in the rate book text");
  let region: string | null = null;
  const tables: AgeTable[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start + 50 && line.includes("Specialty benefits product rates") && !line.includes(".")) break;
    const regionMatch = /^\s*Rating region (\d+)\s*$/.exec(line);
    if (regionMatch) region = regionMatch[1];
    if (!line.trim().startsWith("Age") || !AGE_ROW.test(lines[index + 1] ?? "")) continue;
    const rows: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && AGE_ROW.test(lines[cursor])) {
      rows.push(lines[cursor]);
      cursor += 1;
    }
    if (!region || rows.length < 40) continue;
    const header = lines.slice(Math.max(start, index - 8), index + 1).join("\n");
    if (/assisted reproductive/i.test(header)) continue;
    const firstAmounts = amounts(rows[0]);
    const age21 = rows.find((row) => /^\s*21\s+\$/.test(row));
    const age21Amounts = age21 ? amounts(age21) : [];
    if (!age21Amounts.length || Math.max(...age21Amounts) < 5_000) continue;
    const network = networkName(lines.slice(Math.max(0, index - 30), index));
    tables.push({
      region,
      network,
      names: columnNames(lines.slice(Math.max(0, index - 6), index + 1), firstAmounts.length, network),
      ages: Object.fromEntries(rows.map((row) => {
        const band = ageKey(row);
        return [band, amounts(row)];
      })),
    });
    index = cursor - 1;
  }
  if (!tables.length) throw new Error("No medical rate tables were parsed");
  return tables;
}

function parseAncillary(text: string): TierRow[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line, index) => index > 1000 && line.trim().startsWith("Specialty benefits dental PPO"));
  if (start < 0) return [];
  const rows: TierRow[] = [];
  let regions: string[] = [];
  let smallGroup = false;
  let lineKind: "dental" | "vision" | null = null;
  for (let index = start; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (trimmed.startsWith("Specialty benefits dental")) lineKind = "dental";
    if (trimmed.startsWith("Specialty benefits vision")) lineKind = "vision";
    if (trimmed.startsWith("Life insurance")) break;
    if (/^Regions /.test(trimmed)) regions = regionList(trimmed);
    if (/All regions/.test(trimmed) && lineKind === "vision") regions = Array.from({ length: 19 }, (_, i) => String(i + 1));
    if (/1-50 eligible employees/.test(trimmed)) smallGroup = true;
    if (/51-100 eligible employees/.test(trimmed) || /closed plans/i.test(trimmed)) smallGroup = false;
    if (!smallGroup || !lineKind || !regions.length) continue;
    const match = /^\s*([DV]\d+)\s+(.+?)\s+(\$[0-9,]+\.\d{2})\s+(\$[0-9,]+\.\d{2})\s+(\$[0-9,]+\.\d{2})\s+(\$[0-9,]+\.\d{2})\s*$/.exec(raw);
    if (!match) continue;
    rows.push({
      id: match[1],
      name: match[2].replace(/\s+/g, " ").trim(),
      line: lineKind,
      regions: [...regions],
      tiers: {
        employee_only: cents(match[3]),
        employee_spouse: cents(match[4]),
        employee_children: cents(match[5]),
        employee_family: cents(match[6]),
      },
    });
  }
  return rows;
}

function medicalPlans(tables: AgeTable[]): MedicalPlan[] {
  const byName = new Map<string, MedicalPlan>();
  for (const table of tables) {
    table.names.forEach((name, column) => {
      const metal = metalOf(name);
      if (!metal) return;
      const id = `bsc-2026q4-${slug(name)}`;
      const existing = byName.get(id);
      const bands: Record<string, number> = {};
      for (const [band, values] of Object.entries(table.ages)) {
        const value = values[column];
        if (value === undefined) return;
        bands[band] = value;
      }
      if (!existing) {
        byName.set(id, {
          id,
          line: "medical",
          name,
          carrier: "Blue Shield of California",
          metal,
          planType: /HMO/i.test(name) || /HMO/i.test(table.network) ? "HMO" : "PPO",
          deductibleIndividualCents: deductibleCents(name),
          deductibleFamilyCents: deductibleCents(name),
          oopIndividualCents: null,
          coinsurance: null,
          pcpCopayCents: null,
          specialistCopayCents: null,
          rxGenericCents: null,
          hsaEligible: /HDHP|Savings/i.test(name) || /HDHP|Savings/i.test(table.network),
          baseRateCents: bands["21"] ?? bands["0-14"] ?? 0,
          actuarialValue: null,
          rateBasis: "blue_shield_ca_filed",
          rateLabel: BLUE_SHIELD_FILED_LABEL,
          publishedAgeCents: { [table.region]: bands },
        });
        return;
      }
      existing.publishedAgeCents = { ...existing.publishedAgeCents, [table.region]: bands };
    });
  }
  return [...byName.values()];
}

function ancillaryPlans(rows: TierRow[]): AncillaryPlan[] {
  const byId = new Map<string, AncillaryPlan>();
  for (const row of rows) {
    const id = `bsc-2026q4-${row.id.toLowerCase()}`;
    const existing = byId.get(id);
    if (!existing) {
      const tierRatesByRegion: Record<string, Record<Tier, number>> = {};
      for (const region of row.regions) tierRatesByRegion[region] = row.tiers;
      byId.set(id, {
        id,
        line: row.line,
        name: `${row.name} (${row.id})`,
        carrier: "Blue Shield of California",
        planType: row.line === "dental" ? (row.id.startsWith("D") && /HMO/i.test(row.name) ? "DHMO" : "DPPO") : "vision",
        deductibleCents: deductibleCents(row.name),
        annualMaxCents: annualMaxCents(row.name),
        preventive: "See the Blue Shield Q4 2026 rate book for the benefit summary.",
        summary: `${row.name}. ${BLUE_SHIELD_FILED_LABEL}.`,
        tierRatesCents: row.tiers,
        tierRatesByRegion,
        richness: richnessFromName(row.name),
        rateBasis: "blue_shield_ca_filed",
        rateLabel: BLUE_SHIELD_FILED_LABEL,
      });
      continue;
    }
    for (const region of row.regions) {
      existing.tierRatesByRegion = { ...existing.tierRatesByRegion, [region]: row.tiers };
    }
  }
  return [...byId.values()];
}

const TRIO_HMO_NAMES = [
  "Platinum Trio HMO 0/20 OffEx",
  "Platinum Trio HMO 0/25 OffEx",
  "Platinum Trio HMO 0/30 OffEx",
  "Gold Trio HMO 0/35 OffEx",
  "Gold Trio HMO 500/35 OffEx",
  "Gold Trio HMO 1000/35 OffEx",
  "Gold Trio HMO 1500/35 OffEx",
  "Silver Trio HMO 2100/70 OffEx",
  "Silver Trio HMO 2850/70 OffEx",
  "Bronze Trio HMO 7000/65 OffEx",
  "Blue Shield Trio Bronze 60 HMO 7000/65 PCP + Child Dental Alt",
  "Blue Shield Trio Platinum 90 HMO 0/20 PCP + Child Dental",
  "Blue Shield Trio Gold 80 HMO 250/35 PCP + Child Dental",
  "Blue Shield Trio Silver 70 HMO 2500/55 PCP + Child Dental",
];

function columnNames(headerLines: string[], columnCount: number, network: string): string[] {
  if (/Trio HMO/i.test(network) && !/Local/i.test(network) && columnCount === TRIO_HMO_NAMES.length) {
    return TRIO_HMO_NAMES;
  }
  const ageLine = headerLines.find((line) => line.trim().startsWith("Age")) ?? "";
  const codes = ageLine.split(/\s{2,}/).map((part) => part.trim()).filter((part) => part && part !== "Age");
  const nameLine = [...headerLines].reverse().find((line) => {
    const parts = line.trim().split(/\s{2,}/).filter(Boolean);
    return parts.length === columnCount && parts.some((part) => /PPO|HMO/i.test(part));
  });
  const names = nameLine?.trim().split(/\s{2,}/).filter(Boolean) ?? [];
  if (names.length === columnCount && codes.length === columnCount) {
    return names.map((name, index) => `${name} ${codes[index]}`.replace(/\s+/g, " ").trim());
  }
  if (names.length === columnCount && names.every((name) => /\d/.test(name))) return names;
  return [];
}

function networkName(lines: string[]): string {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (/^Rating region \d+/.test(trimmed) || trimmed.includes("\f")) break;
    const lead = trimmed.split(/\s{2,}/)[0] ?? "";
    if (/^(Off-Exchange|Full PPO|Tandem PPO|Trio HMO|Access\+)/.test(lead)) return lead;
  }
  return "Blue Shield medical";
}

function amounts(row: string): number[] {
  return [...row.matchAll(MONEY)].map((match) => cents(match[0]));
}

function cents(token: string): number {
  return Math.round(Number(token.replace(/[$,]/g, "")) * 100);
}

function ageKey(row: string): string {
  const match = /^\s*(0 to ?14|\d{1,2}|64\+)/.exec(row);
  if (!match) throw new Error(`Unparsed age row: ${row}`);
  if (match[1].startsWith("0")) return "0-14";
  if (match[1] === "64+") return "64+";
  return match[1];
}

function regionList(line: string): string[] {
  return [...line.matchAll(/\d{1,2}/g)].map((match) => match[0]).filter((value) => Number(value) >= 1 && Number(value) <= 19);
}

function metalOf(name: string): Metal | null {
  if (/platinum/i.test(name)) return "platinum";
  if (/gold/i.test(name)) return "gold";
  if (/silver/i.test(name)) return "silver";
  if (/bronze/i.test(name)) return "bronze";
  return null;
}

function deductibleCents(name: string): number {
  const match = name.match(/(\d{1,5})\s*\/\s*\d{1,3}/);
  return match ? Number(match[1]) * 100 : 0;
}

function annualMaxCents(name: string): number | null {
  const match = name.match(/\$(\d{3,5})/);
  return match ? Number(match[1]) * 100 : null;
}

function richnessFromName(name: string): number {
  if (/platinum|ultimate|deluxe/i.test(name)) return 0.85;
  if (/gold|plus/i.test(name)) return 0.7;
  if (/silver|preferred/i.test(name)) return 0.55;
  return 0.4;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}
