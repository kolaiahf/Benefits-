/**
 * Insurer / claims integration boundary.
 *
 * The app reads claims, accumulators, and eligibility from the database. In
 * production those rows are kept fresh by syncing from the payer (Blue Shield,
 * Delta, etc.) or a clearinghouse — typically via an 834/837/835 EDI feed, a
 * FHIR API, or a vendor like Availity, Change Healthcare, or Stedi.
 *
 * That requires a signed payer/clearinghouse agreement and credentials, which
 * can't ship in the repo. This module defines the seam: implement `syncClaims`
 * against your feed and call it from a scheduled job to upsert into the DB.
 */
import type { claims } from "@/db/schema";

export type ClaimRecord = typeof claims.$inferInsert;

export interface InsurerConnector {
  /** Pull claims for a member since a watermark and return normalized rows. */
  fetchClaims(memberId: string, since?: Date): Promise<ClaimRecord[]>;
  /** Pull current deductible / out-of-pocket accumulators for a member. */
  fetchAccumulators(memberId: string): Promise<{
    dedUsed: number; dedTotal: number; oopUsed: number; oopTotal: number;
  }>;
}

/** Placeholder connector. Configure a real one via INSURER_* env vars and
 *  replace this with an implementation that talks to your feed. */
export const insurerConnector: InsurerConnector = {
  async fetchClaims() {
    throw new Error(
      "Insurer feed not configured. Implement InsurerConnector.fetchClaims " +
        "against your payer/clearinghouse (EDI 837/835 or FHIR) and set INSURER_* env vars."
    );
  },
  async fetchAccumulators() {
    throw new Error("Insurer feed not configured. See src/lib/integrations/insurer.ts.");
  },
};

export function isInsurerConfigured(): boolean {
  return Boolean(process.env.INSURER_API_BASE && process.env.INSURER_API_KEY);
}
