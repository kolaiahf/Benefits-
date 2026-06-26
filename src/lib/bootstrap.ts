import { eq, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  members, plans, benefitPackages, claims, accounts, documents,
  copays, coverageItems, priorAuth, costProcedures, careCategories, providers,
} from "@/db/schema";

/** Loads all of a user's benefits data and shapes it to match the structures
 *  the client UI expects (the same shapes the prototype used as constants). */
export async function getBootstrap(userId: string) {
  const [
    memberRows, planRows, pkgRows, claimRows, acctRows, docRows,
    copayRows, coverageRows, priorAuthRows, costRows, careCatRows, providerRows,
  ] = await Promise.all([
    db.select().from(members).where(eq(members.userId, userId)),
    db.select().from(plans).where(eq(plans.userId, userId)),
    db.select().from(benefitPackages).where(eq(benefitPackages.userId, userId)).orderBy(asc(benefitPackages.sortOrder)),
    db.select().from(claims).where(eq(claims.userId, userId)).orderBy(desc(claims.sortDate)),
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db.select().from(documents).where(eq(documents.userId, userId)),
    db.select().from(copays).orderBy(asc(copays.sortOrder)),
    db.select().from(coverageItems).orderBy(asc(coverageItems.sortOrder)),
    db.select().from(priorAuth).orderBy(asc(priorAuth.sortOrder)),
    db.select().from(costProcedures).orderBy(asc(costProcedures.sortOrder)),
    db.select().from(careCategories).orderBy(asc(careCategories.sortOrder)),
    db.select().from(providers).orderBy(asc(providers.sortOrder)),
  ]);

  const memberOrder = { self: 0, spouse: 1, child: 2 } as Record<string, number>;
  const HOUSEHOLD = [...memberRows]
    .sort((a, b) => (memberOrder[a.ref] ?? 9) - (memberOrder[b.ref] ?? 9))
    .map((m) => ({
      id: m.ref, name: m.name, first: m.first, initials: m.initials, rel: m.rel,
      memberId: m.memberId, ded: { used: m.dedUsed, total: m.dedTotal }, oop: { used: m.oopUsed, total: m.oopTotal },
    }));

  const plan = planRows[0];
  const FAMILY = {
    ded: { used: plan?.familyDedUsed ?? 0, total: plan?.familyDedTotal ?? 0 },
    oop: { used: plan?.familyOopUsed ?? 0, total: plan?.familyOopTotal ?? 0 },
  };
  const PLAN = {
    name: plan?.name ?? "", group: plan?.groupNumber ?? "", effective: plan?.effective ?? "",
    tier: plan?.tier ?? "", phone: plan?.phone ?? "", planYear: plan?.planYear ?? "",
  };

  // PKG keyed by package key
  const PKG: Record<string, { name: string; carrier: string; status: string; summary: string; rows: [string, string][]; call: string; web: string }> = {};
  for (const p of pkgRows) {
    PKG[p.key] = { name: p.name, carrier: p.carrier, status: p.status, summary: p.summary, rows: p.rows, call: p.call, web: p.web };
  }

  // GROUPS rebuilt from package groupTitle/route, with the synthetic
  // "Medical copays" link spliced into Health (after medical), as in the original.
  const groupTitles: string[] = [];
  for (const p of pkgRows) if (!groupTitles.includes(p.groupTitle)) groupTitles.push(p.groupTitle);
  const GROUPS = groupTitles.map((title) => {
    const items: Array<Record<string, string>> = [];
    for (const p of pkgRows.filter((x) => x.groupTitle === title)) {
      items.push({ id: p.key, route: p.route });
      if (p.key === "medical") {
        items.push({ label: "Medical copays", sub: "Visit & prescription costs", route: "copays", status: "enrolled" });
      }
    }
    return { title, items };
  });

  const CLAIMS = claimRows.map((c) => ({
    who: c.memberRef, date: c.date, provider: c.provider, service: c.service,
    billed: c.billed, plan: c.planPaid, you: c.you,
  }));

  const hsaData = (acctRows.find((a) => a.type === "hsa")?.data ?? {}) as Record<string, number>;
  const dcfsaData = (acctRows.find((a) => a.type === "dcfsa")?.data ?? {}) as Record<string, number>;
  const HSA = { balance: hsaData.balance ?? 0, ytdContrib: hsaData.ytdContrib ?? 0, ytdSpend: hsaData.ytdSpend ?? 0, limit: hsaData.limit ?? 0 };
  const DCFSA = { election: dcfsaData.election ?? 0, used: dcfsaData.used ?? 0, remaining: dcfsaData.remaining ?? 0 };

  const DOCS = docRows.map((d) => ({ name: d.name, date: d.date, type: d.type }));
  const COPAYS = copayRows.map((c) => ({ label: c.label, cost: c.cost, note: c.note }));
  const BENEFITS = coverageRows.map((c) => ({ label: c.label, detail: c.detail, status: c.status }));
  const PRIOR_AUTH = priorAuthRows.map((p) => ({ service: p.service, required: p.required, note: p.note }));
  const COST_PROCEDURES = costRows.map((c) => ({ label: c.label, cost: c.cost, note: c.note }));
  const CARE_CATS = careCatRows.map((c) => ({ id: c.ref, label: c.label, copay: c.copay }));

  const PROVIDERS: Record<string, Array<Record<string, unknown>>> = {};
  for (const c of careCatRows) PROVIDERS[c.ref] = [];
  for (const p of providerRows) {
    (PROVIDERS[p.categoryRef] ??= []).push({
      name: p.name, org: p.org, addr: p.addr, phone: p.phone,
      rating: p.rating, reviews: p.reviews, hours: p.hours, lat: p.lat, lng: p.lng,
    });
  }

  return { HOUSEHOLD, FAMILY, PLAN, PKG, GROUPS, CLAIMS, HSA, DCFSA, DOCS, COPAYS, BENEFITS, PRIOR_AUTH, COST_PROCEDURES, CARE_CATS, PROVIDERS };
}

export type Bootstrap = Awaited<ReturnType<typeof getBootstrap>>;
