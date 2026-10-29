import { censusFromFinch, type FinchCensusResult } from "./map.js";
import { FinchClient, FinchError, type FinchCompany } from "./client.js";

export async function pullFinchCensus(
  client: FinchClient,
  token: string,
  entityId: string | null,
  fallbackZip: string,
): Promise<{ census: FinchCensusResult; company: FinchCompany | null }> {
  const directory = await client.directory(token, entityId);
  const ids = directory.filter((person) => person.isActive).map((person) => person.id);
  const [individuals, employment] = await Promise.all([
    client.individuals(token, ids, entityId),
    client.employment(token, ids, entityId),
  ]);
  let company: FinchCompany | null = null;
  try {
    company = await client.company(token, entityId);
  } catch (error) {
    if (!isMissingProduct(error)) throw error;
  }
  let plans: Awaited<ReturnType<FinchClient["plans"]>> = [];
  let enrollments: Awaited<ReturnType<FinchClient["enrollments"]>> = [];
  let dependents: Awaited<ReturnType<FinchClient["dependents"]>> = [];
  const extraWarnings: string[] = [];
  try {
    plans = await client.plans(token, entityId);
    enrollments = await client.enrollments(token, entityId);
    dependents = await client.dependents(token, entityId);
  } catch (error) {
    if (!isMissingProduct(error)) throw error;
    extraWarnings.push("Finch benefit-plan reads are not enabled on this connection. Payroll census was still imported.");
    try {
      plans = await client.deductionBenefits(token, entityId);
    } catch (fallbackError) {
      if (!isMissingProduct(fallbackError)) throw fallbackError;
    }
  }
  const census = censusFromFinch({
    directory,
    individuals,
    employment,
    plans,
    enrollments,
    dependents,
    fallbackZip,
  });
  census.warnings.push(...extraWarnings);
  return { census, company };
}

function isMissingProduct(error: unknown): boolean {
  return error instanceof FinchError && [401, 403, 404, 501].includes(error.status);
}
