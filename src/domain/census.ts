import { ageOn, normalizeZip, parseIsoDate } from "./money.js";
import type { CensusMember, Relationship, Tier } from "./types.js";

export interface CensusDraft {
  subscriberId: string;
  relationship: Relationship;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  zip: string;
  gender: CensusMember["gender"];
  tobacco: boolean;
  annualSalaryCents: number | null;
  email: string | null;
  waived: boolean;
}

export class CensusError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "CensusError";
  }
}

const HEADER_ALIASES: Record<string, keyof CensusDraft | "salary"> = {
  subscriber_id: "subscriberId",
  employee_id: "subscriberId",
  family_id: "subscriberId",
  relationship: "relationship",
  rel: "relationship",
  first_name: "firstName",
  first: "firstName",
  last_name: "lastName",
  last: "lastName",
  date_of_birth: "dateOfBirth",
  dob: "dateOfBirth",
  birth_date: "dateOfBirth",
  zip: "zip",
  zip_code: "zip",
  postal_code: "zip",
  gender: "gender",
  tobacco: "tobacco",
  smoker: "tobacco",
  annual_salary: "salary",
  salary: "salary",
  email: "email",
  waive: "waived",
  waived: "waived",
};

export function parseCensusCsv(text: string): CensusDraft[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) {
    throw new CensusError("Census CSV needs a header row and at least one person");
  }
  const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/\s+/g, "_"));
  const columns = header.map((name) => HEADER_ALIASES[name] ?? null);
  if (!columns.includes("subscriberId") || !columns.includes("dateOfBirth") || !columns.includes("relationship")) {
    throw new CensusError("Census CSV must include subscriber_id, relationship, and date_of_birth");
  }
  const details: string[] = [];
  const members: CensusDraft[] = [];
  rows.slice(1).forEach((row, index) => {
    if (row.every((cell) => cell.trim() === "")) return;
    const line = index + 2;
    try {
      const record: Partial<CensusDraft> & { salary?: string } = {};
      columns.forEach((column, cellIndex) => {
        if (!column) return;
        const value = (row[cellIndex] ?? "").trim();
        if (column === "salary") record.salary = value;
        else if (column === "tobacco" || column === "waived") record[column] = parseBool(value);
        else if (column === "relationship") record.relationship = parseRelationship(value);
        else if (column === "gender") record.gender = parseGender(value);
        else if (column === "dateOfBirth") record.dateOfBirth = normalizeDate(value);
        else if (column === "zip") record.zip = value;
        else if (column === "subscriberId" || column === "firstName" || column === "lastName" || column === "email") {
          record[column] = value;
        }
      });
      members.push(finalizeDraft(record, line));
    } catch (error) {
      details.push(error instanceof Error ? error.message : `Row ${line} is invalid`);
    }
  });
  if (details.length) throw new CensusError("Census CSV has invalid rows", details);
  assertHouseholds(members);
  return members;
}

function finalizeDraft(record: Partial<CensusDraft> & { salary?: string }, line: number): CensusDraft {
  if (!record.subscriberId) throw new Error(`Row ${line}: subscriber_id is required`);
  if (!record.relationship) throw new Error(`Row ${line}: relationship is required`);
  if (!record.firstName) throw new Error(`Row ${line}: first_name is required`);
  if (!record.lastName) throw new Error(`Row ${line}: last_name is required`);
  if (!record.dateOfBirth) throw new Error(`Row ${line}: date_of_birth is required`);
  parseIsoDate(record.dateOfBirth);
  if (!record.zip) throw new Error(`Row ${line}: zip is required`);
  const zip = normalizeZip(record.zip);
  let annualSalaryCents: number | null = null;
  if (record.salary) {
    const amount = Number(record.salary.replace(/[$,]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Row ${line}: annual_salary is invalid`);
    annualSalaryCents = Math.round(amount * 100);
  }
  return {
    subscriberId: record.subscriberId,
    relationship: record.relationship,
    firstName: record.firstName,
    lastName: record.lastName,
    dateOfBirth: record.dateOfBirth,
    zip,
    gender: record.gender ?? "unknown",
    tobacco: record.tobacco ?? false,
    annualSalaryCents,
    email: record.email || null,
    waived: record.waived ?? false,
  };
}

export function assertHouseholds(members: CensusDraft[]): void {
  const bySubscriber = new Map<string, CensusDraft[]>();
  for (const member of members) {
    const list = bySubscriber.get(member.subscriberId) ?? [];
    list.push(member);
    bySubscriber.set(member.subscriberId, list);
  }
  const details: string[] = [];
  for (const [subscriberId, household] of bySubscriber) {
    const selves = household.filter((member) => member.relationship === "self");
    if (selves.length !== 1) {
      details.push(`Subscriber ${subscriberId} must have exactly one self row (found ${selves.length})`);
    }
  }
  if (details.length) throw new CensusError("Census households are inconsistent", details);
}

export function householdTier(members: Array<Pick<CensusMember, "relationship" | "waived">>): Tier | null {
  const active = members.filter((member) => !member.waived);
  const employee = active.find((member) => member.relationship === "self");
  if (!employee) return null;
  const spouse = active.some((member) => member.relationship === "spouse");
  const child = active.some((member) => member.relationship === "child");
  if (spouse && child) return "employee_family";
  if (spouse) return "employee_spouse";
  if (child) return "employee_children";
  return "employee_only";
}

export function groupHouseholds<T extends { subscriberId: string }>(members: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const member of members) {
    const list = grouped.get(member.subscriberId) ?? [];
    list.push(member);
    grouped.set(member.subscriberId, list);
  }
  return grouped;
}

export function eligibleEmployees(members: CensusMember[]): CensusMember[] {
  return members.filter((member) => member.relationship === "self");
}

export function enrolledEmployees(members: CensusMember[]): CensusMember[] {
  return eligibleEmployees(members).filter((member) => !member.waived);
}

export function participationRatio(members: CensusMember[]): number {
  const eligible = eligibleEmployees(members).length;
  if (eligible === 0) return 0;
  return enrolledEmployees(members).length / eligible;
}

export function memberAge(member: Pick<CensusMember, "dateOfBirth">, effectiveDate: string): number {
  return ageOn(member.dateOfBirth, effectiveDate);
}

function parseBool(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["y", "yes", "true", "1", "t"].includes(normalized)) return true;
  if (["n", "no", "false", "0", "f", ""].includes(normalized)) return false;
  throw new Error(`Expected yes or no, received ${value}`);
}

function parseRelationship(value: string): Relationship {
  const normalized = value.trim().toLowerCase();
  if (["self", "employee", "ee", "subscriber"].includes(normalized)) return "self";
  if (["spouse", "domestic_partner", "partner", "sp"].includes(normalized)) return "spouse";
  if (["child", "dependent", "son", "daughter", "ch"].includes(normalized)) return "child";
  throw new Error(`Unknown relationship ${value}`);
}

function parseGender(value: string): CensusMember["gender"] {
  const normalized = value.trim().toLowerCase();
  if (["f", "female"].includes(normalized)) return "female";
  if (["m", "male"].includes(normalized)) return "male";
  return "unknown";
}

function normalizeDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!us) throw new Error(`Unparseable date ${value}`);
  return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
}

/** RFC-style CSV reader. Supports quoted commas, escaped quotes, and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
