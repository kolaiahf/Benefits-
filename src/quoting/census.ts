import { ageOn, parseIsoDate } from "../domain/money.js";
import { SMALL_GROUP_MAX } from "./engine.js";
import { ratingAreaForZip } from "./regions.js";
import type { CensusPerson } from "./types.js";

export class CensusValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues[0] ?? "Census could not be read");
    this.name = "CensusValidationError";
  }
}

const MAX_CHILDREN = 8;

export function parseQuoteCensus(csv: string, effectiveDate: string): { people: CensusPerson[]; warnings: string[] } {
  parseIsoDate(effectiveDate);
  const text = csv.replace(/^\uFEFF/, "").trim();
  if (!text) throw new CensusValidationError(["The census file is empty."]);
  if (text.length > 1_000_000) throw new CensusValidationError(["The census file is too large."]);
  const rows = parseRows(text);
  if (rows.length < 2) throw new CensusValidationError(["Add a header row and at least one employee."]);
  const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/\s+/g, "_"));
  const index = new Map(header.map((name, position) => [name, position]));
  const issues: string[] = [];
  for (const required of ["employee_name", "date_of_birth", "zip"]) {
    if (!index.has(required)) issues.push(`Missing column ${required}.`);
  }
  if (issues.length) throw new CensusValidationError(issues);

  const people: CensusPerson[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (let rowNumber = 1; rowNumber < rows.length; rowNumber += 1) {
    const row = rows[rowNumber];
    if (row.every((cell) => !cell.trim())) continue;
    const line = rowNumber + 1;
    const name = cell(row, index, "employee_name");
    const dob = cell(row, index, "date_of_birth");
    const zip = cell(row, index, "zip").slice(0, 5);
    if (!name) issues.push(`Row ${line}: employee name is required.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !validDate(dob)) {
      issues.push(`Row ${line}: date of birth must be YYYY-MM-DD.`);
    } else if (dob > effectiveDate) {
      issues.push(`Row ${line}: date of birth is after the effective date.`);
    }
    if (!/^\d{5}$/.test(zip)) issues.push(`Row ${line}: ZIP must be 5 digits.`);
    else if (!ratingAreaForZip(zip)) warnings.push(`Row ${line}: ZIP ${zip} is not a California rating ZIP. Premiums use the employer ZIP.`);
    if (!name || issues.some((issue) => issue.startsWith(`Row ${line}:`))) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) issues.push(`Row ${line}: ${name} is listed more than once.`);
    seen.add(key);
    const employeeId = `e${people.length + 1}`;
    people.push({ id: `${employeeId}-self`, employeeId, name, relationship: "employee", dateOfBirth: dob, zip });
    const spouseDob = cell(row, index, "spouse_date_of_birth");
    const spouseName = cell(row, index, "spouse_name") || "Spouse";
    if (spouseDob) addDependent(issues, line, "spouse", spouseName, spouseDob, effectiveDate, employeeId, people);
    for (let child = 1; child <= MAX_CHILDREN; child += 1) {
      const childDob = cell(row, index, `child_${child}_date_of_birth`);
      if (!childDob) continue;
      const childName = cell(row, index, `child_${child}_name`) || `Child ${child}`;
      addDependent(issues, line, "child", childName, childDob, effectiveDate, employeeId, people);
    }
  }
  const employees = people.filter((person) => person.relationship === "employee");
  if (!issues.length && employees.length === 0) issues.push("The census has no employees.");
  if (employees.length > SMALL_GROUP_MAX) {
    issues.push(`${employees.length} employees is above the California small-group maximum of ${SMALL_GROUP_MAX}.`);
  }
  if (issues.length) throw new CensusValidationError(issues);
  for (const person of people) {
    const age = ageOn(person.dateOfBirth, effectiveDate);
    if (age < 0 || age > 120) {
      throw new CensusValidationError([`${person.name} is age ${age} on the effective date, which is outside 0–120.`]);
    }
  }
  return { people, warnings };
}

function addDependent(
  issues: string[],
  line: number,
  relationship: "spouse" | "child",
  name: string,
  dob: string,
  effectiveDate: string,
  employeeId: string,
  people: CensusPerson[],
): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !validDate(dob)) {
    issues.push(`Row ${line}: ${relationship} date of birth must be YYYY-MM-DD.`);
    return;
  }
  if (dob > effectiveDate) {
    issues.push(`Row ${line}: ${relationship} date of birth is after the effective date.`);
    return;
  }
  const zip = people.find((person) => person.employeeId === employeeId)?.zip ?? "";
  people.push({
    id: `${employeeId}-${relationship}-${people.length}`,
    employeeId,
    name,
    relationship,
    dateOfBirth: dob,
    zip,
  });
}

function cell(row: string[], index: Map<string, number>, name: string): string {
  const position = index.get(name);
  if (position === undefined) return "";
  return (row[position] ?? "").trim();
}

function validDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
