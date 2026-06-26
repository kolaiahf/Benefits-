/**
 * Seeds the database with the demo household (the Fraziers) — the same data
 * that was hardcoded in the original prototype, now persisted and queryable.
 *
 * Run: npm run db:seed   (or npm run db:reset to wipe + reseed)
 */
import bcrypt from "bcryptjs";
import { db, schema } from "./index";

const {
  users, plans, members, benefitPackages, claims, accounts, documents,
  copays, coverageItems, priorAuth, costProcedures, careCategories, providers,
} = schema;

const DEMO_EMAIL = "kolaiah@example.com";
const DEMO_PASSWORD = "demo1234";

async function main() {
  console.log("Seeding database…");

  // Clear (order respects FKs)
  await db.delete(claims);
  await db.delete(accounts);
  await db.delete(documents);
  await db.delete(benefitPackages);
  await db.delete(members);
  await db.delete(plans);
  await db.delete(providers);
  await db.delete(careCategories);
  await db.delete(costProcedures);
  await db.delete(priorAuth);
  await db.delete(coverageItems);
  await db.delete(copays);
  await db.delete(users);

  // ── User ────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [user] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL,
      passwordHash,
      name: "Kolaiah Frazier",
      primaryMemberId: "BSC-4821-KF",
    })
    .returning();
  const userId = user.id;

  // ── Plan + family accumulators ────────────────────────────────────────────
  await db.insert(plans).values({
    userId,
    name: "Blue Shield PPO Gold",
    groupNumber: "MMA-SD-2026",
    effective: "01 / 01 / 2026",
    tier: "Family",
    phone: "1-800-393-6130",
    planYear: "Jan 1 – Dec 31, 2026",
    familyDedUsed: 2650,
    familyDedTotal: 3000,
    familyOopUsed: 3640,
    familyOopTotal: 8000,
  });

  // ── Household ─────────────────────────────────────────────────────────────
  await db.insert(members).values([
    { userId, ref: "self", name: "Kolaiah Frazier", first: "Kolaiah", initials: "KF", rel: "Primary", memberId: "BSC-4821-KF", isPrimary: true, dedUsed: 850, dedTotal: 1500, oopUsed: 1240, oopTotal: 4000 },
    { userId, ref: "spouse", name: "Jordan Frazier", first: "Jordan", initials: "JF", rel: "Spouse", memberId: "BSC-4821-JF", isPrimary: false, dedUsed: 1500, dedTotal: 1500, oopUsed: 2100, oopTotal: 4000 },
    { userId, ref: "child", name: "Maya Frazier", first: "Maya", initials: "MF", rel: "Dependent · Age 9", memberId: "BSC-4821-MF", isPrimary: false, dedUsed: 300, dedTotal: 1500, oopUsed: 300, oopTotal: 4000 },
  ]);

  // ── Benefit packages (key -> {group, route}) ──────────────────────────────
  const PKG: Record<string, { name: string; carrier: string; status: string; summary: string; rows: [string, string][]; call: string; web: string }> = {
    medical: { name: "Medical", carrier: "Blue Shield PPO Gold", status: "enrolled", summary: "Your core health plan covering doctor visits, hospital care, labs, and imaging.", rows: [["Deductible (individual)", "$1,500"], ["Out-of-pocket max", "$4,000"], ["Coinsurance", "80 / 20"], ["PCP copay", "$25"], ["Specialist copay", "$50"]], call: "1-800-393-6130", web: "blueshieldca.com" },
    pharmacy: { name: "Pharmacy", carrier: "Blue Shield Rx", status: "enrolled", summary: "Prescription drug coverage at in-network pharmacies and through mail order.", rows: [["Generic (Tier 1)", "$10"], ["Brand (Tier 2)", "$45"], ["Mail order 90-day", "$20"], ["RxBIN", "600428"], ["RxGRP", "BSCRX01"]], call: "1-888-792-7473", web: "" },
    dental: { name: "Dental", carrier: "Delta Dental PPO", status: "enrolled", summary: "Preventive, basic, and major dental care plus orthodontia for the whole family.", rows: [["Deductible", "$50 / person"], ["Preventive (cleanings)", "100% covered"], ["Basic (fillings)", "80% covered"], ["Major (crowns)", "50% covered"], ["Annual maximum", "$1,500"], ["Orthodontia", "$1,500 lifetime"]], call: "1-800-765-6003", web: "deltadentalins.com" },
    vision: { name: "Vision", carrier: "VSP Choice", status: "enrolled", summary: "Annual eye exams, lenses, frames, and contacts.", rows: [["Exam copay", "$10"], ["Frame allowance", "$150"], ["Lenses", "Covered in full"], ["Contacts allowance", "$150"], ["Frequency", "Every 12 months"]], call: "1-800-877-7195", web: "vsp.com" },
    mental: { name: "Mental Health", carrier: "Lyra Health", status: "enrolled", summary: "Free therapy and coaching sessions plus self-guided programs — no referral needed.", rows: [["Sessions / year", "12 free"], ["Format", "In-person or video"], ["Covers", "Therapy, coaching, family"], ["Access", "Self-refer directly"]], call: "", web: "care.lyrahealth.com" },
    eap: { name: "Employee Assistance", carrier: "ComPsych GuidanceResources", status: "enrolled", summary: "Confidential 24/7 support for life, work, legal, and financial questions.", rows: [["Counseling", "8 free sessions"], ["Legal consults", "Free 30-min"], ["Financial coaching", "Included"], ["Availability", "24 / 7 / 365"]], call: "1-877-595-5284", web: "" },
    hsa: { name: "Health Savings Account", carrier: "HSA Bank", status: "enrolled", summary: "Tax-free dollars for qualified medical expenses. Funds roll over and grow.", rows: [["Balance", "$1,850.42"], ["2026 contributions", "$2,400"], ["IRS limit", "$4,150"]], call: "1-800-357-6246", web: "" },
    dcfsa: { name: "Dependent Care FSA", carrier: "MMA Benefits", status: "enrolled", summary: "Pre-tax funds for childcare and dependent care so you and your spouse can work.", rows: [["2026 election", "$5,000"], ["Used", "$1,920"], ["Remaining", "$3,080"], ["Deadline", "Use by Dec 31"]], call: "1-800-393-6130", web: "" },
    life: { name: "Life Insurance", carrier: "The Hartford", status: "enrolled", summary: "Employer-paid basic life coverage, with the option to add more.", rows: [["Basic life", "1× annual salary"], ["Cost", "Employer-paid"], ["Supplemental", "Up to 5× (optional)"], ["Beneficiary", "On file"]], call: "1-800-523-2233", web: "" },
    disability: { name: "Disability", carrier: "The Hartford", status: "enrolled", summary: "Income protection if illness or injury keeps you from working.", rows: [["Short-term", "60% to $1,500/wk"], ["STD waiting period", "7 days"], ["Long-term", "60% to $10,000/mo"], ["LTD begins", "After 90 days"]], call: "1-800-523-2233", web: "" },
    retirement: { name: "401(k) Retirement", carrier: "Fidelity", status: "enrolled", summary: "Retirement savings with an employer match that vests immediately.", rows: [["Employer match", "100% up to 4%"], ["Vesting", "Immediate"], ["Your contribution", "8% of pay"], ["Options", "Target-date + funds"]], call: "1-800-835-5097", web: "netbenefits.com" },
    commuter: { name: "Commuter Benefits", carrier: "Available at open enrollment", status: "none", summary: "Set aside pre-tax dollars for transit and parking. Not currently enrolled.", rows: [["Transit", "Up to $315/mo pre-tax"], ["Parking", "Up to $315/mo pre-tax"]], call: "", web: "" },
    legal: { name: "Legal & ID Protection", carrier: "Available at open enrollment", status: "none", summary: "Legal plan and identity-theft protection. Not currently enrolled.", rows: [["Legal plan", "Wills, disputes, more"], ["ID protection", "Monitoring + restoration"]], call: "", web: "" },
  };
  const GROUPS: { title: string; items: { key: string; route: string }[] }[] = [
    { title: "Health", items: [{ key: "medical", route: "coverage" }, { key: "pharmacy", route: "detail" }, { key: "dental", route: "detail" }, { key: "vision", route: "detail" }, { key: "mental", route: "detail" }, { key: "eap", route: "detail" }] },
    { title: "Spending accounts", items: [{ key: "hsa", route: "hsa" }, { key: "dcfsa", route: "fsa" }] },
    { title: "Income protection", items: [{ key: "life", route: "detail" }, { key: "disability", route: "detail" }] },
    { title: "Retirement", items: [{ key: "retirement", route: "detail" }] },
    { title: "Not enrolled", items: [{ key: "commuter", route: "detail" }, { key: "legal", route: "detail" }] },
  ];
  let pkgSort = 0;
  const pkgRows = GROUPS.flatMap((g) =>
    g.items.map((it) => {
      const p = PKG[it.key];
      return { userId, key: it.key, name: p.name, carrier: p.carrier, status: p.status, summary: p.summary, rows: p.rows, call: p.call, web: p.web, groupTitle: g.title, route: it.route, sortOrder: pkgSort++ };
    })
  );
  await db.insert(benefitPackages).values(pkgRows);

  // ── Claims ────────────────────────────────────────────────────────────────
  const CLAIMS = [
    { who: "self", date: "Jun 3, 2026", provider: "Sharp Rees-Stealy", service: "Office Visit — PCP", billed: 320, plan: 295, you: 25 },
    { who: "self", date: "May 18, 2026", provider: "Quest Diagnostics", service: "Lab Panel", billed: 480, plan: 384, you: 96 },
    { who: "self", date: "May 2, 2026", provider: "CVS Pharmacy", service: "Generic Rx — Lisinopril", billed: 28, plan: 18, you: 10 },
    { who: "child", date: "Apr 14, 2026", provider: "AFC Urgent Care", service: "Urgent Care Visit", billed: 290, plan: 215, you: 75 },
    { who: "spouse", date: "Apr 1, 2026", provider: "West Dermatology", service: "Specialist Visit", billed: 410, plan: 360, you: 50 },
    { who: "spouse", date: "Mar 20, 2026", provider: "Scripps Health", service: "MRI — Right Knee", billed: 2400, plan: 1920, you: 480 },
  ];
  await db.insert(claims).values(
    CLAIMS.map((c) => ({ userId, memberRef: c.who, date: c.date, sortDate: Math.floor(Date.parse(c.date) / 1000), provider: c.provider, service: c.service, billed: c.billed, planPaid: c.plan, you: c.you, status: "paid" }))
  );

  // ── Spending accounts ─────────────────────────────────────────────────────
  await db.insert(accounts).values([
    { userId, type: "hsa", data: { balance: 1850.42, ytdContrib: 2400, ytdSpend: 549.58, limit: 4150 } },
    { userId, type: "dcfsa", data: { election: 5000, used: 1920, remaining: 3080 } },
  ]);

  // ── Documents ─────────────────────────────────────────────────────────────
  await db.insert(documents).values(
    [
      { name: "Summary of Benefits & Coverage", date: "Jan 2026", type: "PDF" },
      { name: "Explanation of Benefits — Jun 3", date: "Jun 2026", type: "EOB" },
      { name: "Explanation of Benefits — May 18", date: "May 2026", type: "EOB" },
      { name: "Dental Plan Certificate — Delta", date: "Jan 2026", type: "PDF" },
      { name: "Prescription Drug Formulary", date: "Jan 2026", type: "PDF" },
      { name: "2026 Enrollment Confirmation", date: "Nov 2025", type: "PDF" },
    ].map((d) => ({ userId, ...d, url: "" }))
  );

  // ── Plan reference data (shared) ──────────────────────────────────────────
  await db.insert(copays).values(
    [
      { label: "Primary Care", cost: "$25", note: "In-network" }, { label: "Specialist", cost: "$50", note: "No referral needed" },
      { label: "Urgent Care", cost: "$75", note: "In-network" }, { label: "Emergency Room", cost: "$300", note: "Waived if admitted" },
      { label: "Telehealth", cost: "$0", note: "Via Teladoc · 24/7" }, { label: "Mental Health", cost: "$50", note: "Per session · 30/yr" },
      { label: "Generic Rx", cost: "$10", note: "Tier 1 formulary" }, { label: "Brand Rx", cost: "$45", note: "Tier 2 formulary" },
      { label: "Lab / Bloodwork", cost: "20%", note: "After deductible" }, { label: "Imaging (MRI/CT)", cost: "20%", note: "After deductible" },
      { label: "Physical Therapy", cost: "$50", note: "30 visits/year" }, { label: "Chiropractic", cost: "$50", note: "20 visits/year" },
    ].map((c, i) => ({ ...c, network: "in", sortOrder: i }))
  );

  await db.insert(coverageItems).values(
    [
      { label: "Preventive Care", detail: "Annual physicals, screenings, vaccines", status: "full" },
      { label: "Telehealth", detail: "Available 24/7 via Teladoc", status: "full" },
      { label: "Mental Health", detail: "30 sessions/year in-network", status: "full" },
      { label: "Maternity Care", detail: "Prenatal, delivery, postpartum", status: "full" },
      { label: "Lab & Bloodwork", detail: "20% coinsurance after deductible", status: "partial" },
      { label: "Imaging (MRI/CT)", detail: "20% coinsurance after deductible", status: "partial" },
      { label: "Physical Therapy", detail: "$50 copay · 30 visits/year", status: "partial" },
      { label: "Durable Equipment", detail: "20% coinsurance with prior auth", status: "partial" },
      { label: "Dental", detail: "Delta Dental plan — see Benefits", status: "none" },
      { label: "Vision", detail: "VSP plan — see Benefits", status: "none" },
      { label: "Cosmetic Procedures", detail: "Not covered", status: "none" },
    ].map((c, i) => ({ ...c, sortOrder: i }))
  );

  await db.insert(priorAuth).values(
    [
      { service: "MRI / CT Imaging", required: true, note: "Required before scheduling" },
      { service: "Outpatient Surgery", required: true, note: "Obtain 5+ days in advance" },
      { service: "Specialty Infusions", required: true, note: "Required before treatment" },
      { service: "Durable Medical Equipment", required: true, note: "Over $500" },
      { service: "Physical Therapy", required: false, note: "Up to 30 visits/year" },
      { service: "Specialist Visits", required: false, note: "No referral needed" },
    ].map((c, i) => ({ ...c, sortOrder: i }))
  );

  await db.insert(costProcedures).values(
    [
      { label: "Annual Physical", cost: 0, note: "100% covered — preventive" }, { label: "Flu Shot", cost: 0, note: "100% covered — preventive" },
      { label: "PCP Office Visit", cost: 25, note: "Flat copay" }, { label: "Specialist Visit", cost: 50, note: "Flat copay" },
      { label: "Urgent Care Visit", cost: 75, note: "Flat copay" }, { label: "ER Visit", cost: 300, note: "Copay, waived if admitted" },
      { label: "Blood Panel (Lab)", cost: 96, note: "20% of ~$480 billed" }, { label: "MRI — Single Joint", cost: 480, note: "20% of ~$2,400 billed" },
      { label: "CT Scan", cost: 240, note: "20% of ~$1,200 billed" }, { label: "Outpatient Surgery", cost: 820, note: "Estimated 20% coinsurance" },
      { label: "Generic Rx (30-day)", cost: 10, note: "Tier 1 copay" }, { label: "Brand Rx (30-day)", cost: 45, note: "Tier 2 copay" },
    ].map((c, i) => ({ ...c, sortOrder: i }))
  );

  await db.insert(careCategories).values(
    [
      { ref: "pcp", label: "Primary Care", copay: "$25" }, { ref: "cardio", label: "Cardiology", copay: "$50" },
      { ref: "urgent", label: "Urgent Care", copay: "$75" }, { ref: "derm", label: "Dermatology", copay: "$50" },
      { ref: "mental", label: "Mental Health", copay: "$50" }, { ref: "ortho", label: "Orthopedics", copay: "$50" },
    ].map((c, i) => ({ ...c, sortOrder: i }))
  );

  const PROVIDERS: Record<string, any[]> = {
    pcp: [
      { name: "Dr. Michelle Cao, MD", org: "Sharp Rees-Stealy Point Loma", addr: "3555 Kenyon St, San Diego, CA 92110", phone: "+18584992712", rating: 5.0, reviews: 205, hours: "Mon–Fri · 8am–5pm", lat: 32.7498881, lng: -117.2162129 },
      { name: "Dr. Pany T. Robinson, MD", org: "Sharp Rees-Stealy Rancho Bernardo", addr: "16899 W Bernardo Dr, San Diego, CA 92127", phone: "+18584992705", rating: 5.0, reviews: 347, hours: "Mon–Fri · 8am–5pm", lat: 33.0216189, lng: -117.0800518 },
      { name: "Perlman Wellness", org: "Integrative Primary Care", addr: "3900 Fifth Ave #340, San Diego, CA 92103", phone: "+18582500286", rating: 4.9, reviews: 1072, hours: "Mon–Fri · 6:30am–10pm", lat: 32.7485501, lng: -117.1608955 },
    ],
    cardio: [
      { name: "Cardiovascular Institute of SD", org: "Cardiology", addr: "286 Euclid Ave #204, San Diego, CA 92114", phone: "+16196162100", rating: 4.8, reviews: 372, hours: "Mon–Fri · 8am–5pm", lat: 32.7071549, lng: -117.085522 },
      { name: "Cardiovascular Institute — Chula Vista", org: "Cardiology", addr: "765 Medical Center Ct #211, Chula Vista, CA 91911", phone: "+16196162100", rating: 4.9, reviews: 959, hours: "Mon–Fri · 8am–5pm", lat: 32.6190902, lng: -117.0208458 },
      { name: "San Diego Heart & Vascular", org: "Cardiology", addr: "501 Washington St, San Diego, CA 92103", phone: "+16192970014", rating: 4.8, reviews: 138, hours: "Mon–Fri · 8am–5pm", lat: 32.7497219, lng: -117.1600447 },
    ],
    urgent: [
      { name: "Sharp Rees-Stealy Downtown", org: "Urgent Care", addr: "300 Fir St Fl 2, San Diego, CA 92101", phone: "+16194461575", rating: 4.8, reviews: 1250, hours: "Daily · 8am–8pm", lat: 32.7259856, lng: -117.1614875 },
      { name: "AFC Urgent Care Mission Valley", org: "Urgent Care", addr: "8590 Rio San Diego Dr #111, San Diego, CA 92108", phone: "+16197364600", rating: 4.5, reviews: 2171, hours: "Mon–Fri · 8am–8pm", lat: 32.776211, lng: -117.1446948 },
      { name: "AFC Urgent Care Clairemont", org: "Urgent Care", addr: "5671 Balboa Ave, San Diego, CA 92111", phone: "+18588002880", rating: 4.3, reviews: 1412, hours: "Mon–Fri · 8am–8pm", lat: 32.8192051, lng: -117.1786902 },
    ],
    derm: [
      { name: "West Dermatology Mission Valley", org: "Dermatology", addr: "9095 Rio San Diego Dr #300, San Diego, CA 92108", phone: "+16197548610", rating: 4.6, reviews: 2463, hours: "Mon–Fri · 8am–5pm", lat: 32.7752736, lng: -117.1358377 },
      { name: "MedDerm Dermatology", org: "Dermatology", addr: "3965 Fifth Ave #200, San Diego, CA 92103", phone: "+16195420013", rating: 4.8, reviews: 489, hours: "Mon–Fri · 8am–4pm", lat: 32.749316, lng: -117.1598558 },
      { name: "The Skin Clinic MD", org: "Dr. Seaver L. Soon", addr: "3737 Fourth Ave, San Diego, CA 92103", phone: "+16192990700", rating: 4.9, reviews: 322, hours: "Tue–Fri · 7am–5pm", lat: 32.745832, lng: -117.1614034 },
    ],
    mental: [
      { name: "Healthy Minds Counseling", org: "Mental Health", addr: "591 Camino De La Reina #210, San Diego, CA 92108", phone: "+16192065271", rating: 4.9, reviews: 57, hours: "Mon–Fri · 8am–6pm", lat: 32.7656347, lng: -117.1615676 },
      { name: "Clear Mind Counseling", org: "Mental Health / Therapy", addr: "3655 Nobel Dr #400, San Diego, CA 92122", phone: "+18587507379", rating: 4.9, reviews: 94, hours: "Mon–Fri · 8am–5pm", lat: 32.8678223, lng: -117.2284889 },
    ],
    ortho: [
      { name: "San Diego Orthopaedic Associates", org: "Orthopedic Surgery", addr: "4060 Fourth Ave 7th Fl, San Diego, CA 92103", phone: "+16192998500", rating: 4.8, reviews: 1215, hours: "Mon–Fri · 8:30am–5pm", lat: 32.7512217, lng: -117.1619436 },
      { name: "California Orthopaedic Institute", org: "Orthopedics & Sports Medicine", addr: "7485 Mission Valley Rd #104a, San Diego, CA 92108", phone: "+16192918930", rating: 4.6, reviews: 455, hours: "Mon–Fri · 8am–5pm", lat: 32.7793195, lng: -117.1603142 },
      { name: "Orthopedic Specialists of SD", org: "Orthopedics", addr: "5555 Reservoir Dr #104, San Diego, CA 92120", phone: "+16192864980", rating: 4.4, reviews: 22, hours: "Mon–Fri · 9am–5pm", lat: 32.7761679, lng: -117.0560086 },
    ],
  };
  const providerRows = Object.entries(PROVIDERS).flatMap(([cat, list]) =>
    list.map((p, i) => ({ categoryRef: cat, ...p, sortOrder: i }))
  );
  await db.insert(providers).values(providerRows);

  console.log(`Done. Demo login → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
