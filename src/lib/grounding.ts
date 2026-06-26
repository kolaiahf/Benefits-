import type { Bootstrap } from "./bootstrap";

/** Builds a compact, factual context block from the member's real plan data so
 *  the assistant answers from THIS person's coverage rather than generalities. */
export function buildGrounding(d: Bootstrap): string {
  const self = d.HOUSEHOLD.find((m) => m.id === "self") ?? d.HOUSEHOLD[0];
  const lines: string[] = [];

  lines.push(`Member: ${self?.name} (${self?.memberId}). Plan: ${d.PLAN.name}, group ${d.PLAN.group}, tier ${d.PLAN.tier}, year ${d.PLAN.planYear}.`);

  lines.push("Household:");
  for (const m of d.HOUSEHOLD) {
    lines.push(`- ${m.name} (${m.rel}): deductible $${m.ded.used} of $${m.ded.total} used; out-of-pocket $${m.oop.used} of $${m.oop.total} used.`);
  }
  lines.push(`Family accumulators: deductible $${d.FAMILY.ded.used}/$${d.FAMILY.ded.total}; out-of-pocket $${d.FAMILY.oop.used}/$${d.FAMILY.oop.total}.`);

  lines.push("Enrolled benefits:");
  for (const key of Object.keys(d.PKG)) {
    const p = d.PKG[key];
    const detail = p.rows.map(([k, v]) => `${k}: ${v}`).join("; ");
    lines.push(`- ${p.name} (${p.carrier}, ${p.status})${p.call ? `, phone ${p.call}` : ""}. ${detail}`);
  }

  lines.push("In-network copays: " + d.COPAYS.map((c) => `${c.label} ${c.cost}`).join(", ") + ".");
  lines.push("Out-of-network: separate $3,000 deductible, 40% coinsurance.");

  lines.push("Coverage status: " + d.BENEFITS.map((b) => `${b.label} (${b.status})`).join(", ") + ".");
  lines.push("Prior authorization required for: " + d.PRIOR_AUTH.filter((p) => p.required).map((p) => p.service).join(", ") + ".");

  lines.push(`HSA balance $${d.HSA.balance}; contributed $${d.HSA.ytdContrib} of $${d.HSA.limit} limit.`);
  lines.push(`Dependent-Care FSA: $${d.DCFSA.remaining} remaining of $${d.DCFSA.election} election.`);

  const recent = d.CLAIMS.slice(0, 6).map((c) => `${c.date} ${c.service} (${c.provider}): billed $${c.billed}, plan paid $${c.plan}, member paid $${c.you}`);
  lines.push("Recent claims: " + recent.join("; ") + ".");

  lines.push("Find Care covers (San Diego, in-network): " + d.CARE_CATS.map((c) => `${c.label} ${c.copay}`).join(", ") + ".");

  return lines.join("\n");
}

export const SYSTEM_PROMPT = `You are the benefits assistant inside the MMA Benefits app. You help one member understand and use THEIR specific employer benefits.

Rules:
- Answer using the member's plan data provided below. Prefer their actual numbers (deductible used, balances, copays) over generic explanations.
- Be concise, warm, and plain-spoken. 2-4 sentences unless more detail is clearly needed. No markdown headers or bullet lists unless the user asks for a list.
- For costs, cite the in-network copay or coinsurance from their plan.
- If something is not covered or you don't have the data, say so plainly and point them to Support (member advocacy) to talk to a human.
- Never invent policy numbers, prices, or coverage that aren't in the data. This is informational, not a guarantee of payment.
- Do not give medical advice; stick to benefits, coverage, and costs.

Here is the member's current plan data:`;
