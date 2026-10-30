import { join } from "node:path";
import PDFDocument from "pdfkit";
import { formatDollars, vsTodayLabel } from "./format.js";
import type { QuoteDocument, RatedPlanQuote } from "./types.js";

const INK = "#000F47";
const MUTE = "#4D5576";
const SKY = "#CEECFF";
const GOLD = "#FFBF00";
const PAPER = "#FDFCFA";
const HAIR = "#E4E0D8";

export function renderQuotePdf(quote: QuoteDocument, productName: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 0, bufferPages: true });
  const fontDir = join(process.cwd(), "assets/fonts");
  doc.registerFont("News", join(fontDir, "Newsreader-Light.ttf"));
  doc.registerFont("NewsRegular", join(fontDir, "Newsreader-Regular.ttf"));
  doc.registerFont("Noto", join(fontDir, "NotoSans-Regular.ttf"));
  doc.registerFont("NotoMed", join(fontDir, "NotoSans-Medium.ttf"));
  doc.registerFont("NotoSemi", join(fontDir, "NotoSans-SemiBold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const recommended = quote.plans.find((plan) => plan.planId === quote.recommendedPlanId) ?? quote.plans[0];
  const current = quote.currentPlanId ? quote.plans.find((plan) => plan.planId === quote.currentPlanId) ?? null : null;
  drawCover(doc, quote, recommended, productName);
  drawOptions(doc, quote, current, productName);
  if (recommended) drawRecommendation(doc, quote, recommended, productName);
  drawEmployees(doc, quote, current, productName);
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index);
    const width = doc.page.width;
    doc.font("Noto").fontSize(9).fillColor(MUTE);
    doc.text("Example rates, not real quotes", 48, doc.page.height - 36, { width: 220, lineBreak: false });
    const label = `${String(index + 1).padStart(2, "0")} / ${String(range.count).padStart(2, "0")}`;
    doc.font("NotoSemi").fillColor(INK).text(label, width - 140, doc.page.height - 36, { width: 92, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}

function drawCover(doc: PDFKit.PDFDocument, quote: QuoteDocument, recommended: RatedPlanQuote | undefined, productName: string): void {
  doc.rect(0, 0, 612, 430).fill(SKY);
  doc.fillColor(INK).font("NewsRegular").fontSize(16).text(`•  ${productName}`, 56, 48);
  doc.font("NotoSemi").fontSize(9).fillColor("#2A345E").text("BENEFITS PROPOSAL", 56, 250, { characterSpacing: 1.2 });
  doc.font("News").fontSize(42).fillColor(INK).text(quote.employerName, 56, 270, { width: 500 });
  doc.font("Noto").fontSize(11).fillColor("#2A345E").text(
    `Effective ${longDate(quote.effectiveDate)} · ${quote.employeeCount} employees`,
    56,
    390,
  );
  doc.rect(0, 430, 612, 362).fill(PAPER);
  if (!recommended) return;
  doc.font("Noto").fontSize(10).fillColor(MUTE).text("Recommended plan, total monthly cost", 56, 460);
  doc.font("News").fontSize(40).fillColor(INK).text(formatDollars(recommended.monthlyCents), 56, 478);
  doc.font("Noto").fontSize(11).fillColor("#2A345E").text(`${recommended.carrierName} ${recommended.planName}`, 56, 530);
  const current = quote.currentPlanId ? quote.plans.find((plan) => plan.planId === quote.currentPlanId) : null;
  const y = 580;
  doc.font("Noto").fontSize(9).fillColor(MUTE);
  doc.text("Current", 56, y);
  doc.text("Renewal", 220, y);
  doc.text("Saved vs renewal, per year", 380, y);
  doc.font("News").fontSize(18).fillColor(INK);
  doc.text(current ? formatDollars(current.monthlyCents) : "—", 56, y + 16);
  doc.text(quote.renewalMonthlyCents != null ? formatDollars(quote.renewalMonthlyCents) : "—", 220, y + 16);
  const saved = quote.renewalMonthlyCents != null ? (quote.renewalMonthlyCents - recommended.monthlyCents) * 12 : null;
  doc.text(saved != null ? formatDollars(saved) : "—", 380, y + 16);
  doc.font("Noto").fontSize(9).fillColor(MUTE).text("Prepared by", 56, 680);
  doc.font("NotoSemi").fontSize(11).fillColor(INK).text(quote.preparedBy.name, 56, 694);
  doc.font("Noto").fontSize(9).fillColor("#2A345E").text(quote.preparedBy.email, 56, 710);
  doc.font("Noto").fontSize(9).fillColor(MUTE).text("Date", 460, 680, { width: 96, align: "right" });
  doc.font("NotoSemi").fontSize(11).fillColor(INK).text(longDate(quote.preparedOn), 400, 694, { width: 156, align: "right" });
}

function drawOptions(doc: PDFKit.PDFDocument, quote: QuoteDocument, current: RatedPlanQuote | null, productName: string): void {
  const rows: Array<{ plan: RatedPlanQuote; marker: string }> = [];
  if (current) rows.push({ plan: current, marker: "Current plan" });
  for (const plan of quote.plans) {
    if (current && plan.planId === current.planId) continue;
    rows.push({
      plan,
      marker: plan.planId === quote.recommendedPlanId ? "Recommended" : "",
    });
  }
  const pageSize = 12;
  for (let start = 0; start < rows.length; start += pageSize) {
    doc.addPage({ size: "LETTER", margin: 0 });
    doc.rect(0, 0, 612, 792).fill(PAPER);
    header(doc, quote, productName);
    doc.font("NotoSemi").fontSize(9).fillColor("#2A345E").text(start === 0 ? "OPTIONS" : "OPTIONS, CONTINUED", 48, 78, { characterSpacing: 1.1 });
    doc.font("News").fontSize(28).fillColor(INK).text(start === 0 ? "Your options" : "More options", 48, 94);
    doc.font("Noto").fontSize(10).fillColor("#2A345E").text(
      `Total monthly medical premium for all ${quote.employeeCount} employees in rating area ${quote.ratingArea}. Each person is rated by age.`,
      48,
      136,
      { width: 500 },
    );
    let y = 180;
    doc.font("Noto").fontSize(8).fillColor(MUTE);
    doc.text("Plan", 48, y);
    doc.text("Deductible", 280, y);
    doc.text("Primary care", 360, y);
    doc.text("vs today", 450, y);
    doc.text("Monthly", 510, y);
    y += 16;
    doc.moveTo(48, y).lineTo(564, y).strokeColor(INK).lineWidth(0.6).stroke();
    for (const row of rows.slice(start, start + pageSize)) {
      y += 8;
      const height = 28;
      if (row.plan.planId === quote.recommendedPlanId) doc.rect(48, y - 4, 516, height).fill("#EAF6FF");
      doc.fillColor(MUTE).font("Noto").fontSize(8).text(
        `${row.plan.carrierName}${row.marker ? `  ${row.marker}` : ""}`,
        52,
        y,
        { width: 210, lineBreak: false },
      );
      doc.fillColor(INK).font("NotoSemi").fontSize(9).text(row.plan.planName, 52, y + 11, { width: 210, lineBreak: false });
      doc.font("Noto").fontSize(9).text(moneyOrDash(row.plan.deductibleCents), 280, y + 8, { width: 70, lineBreak: false });
      doc.text(row.plan.primaryCare ?? "—", 360, y + 8, { width: 80, lineBreak: false });
      const vs = vsTodayLabel(row.plan.monthlyCents, current?.monthlyCents ?? null);
      doc.fillColor("#2A345E").text(vs ?? "", 450, y + 8, { width: 50, lineBreak: false });
      doc.font("News").fontSize(12).fillColor(INK).text(formatDollars(row.plan.monthlyCents), 500, y + 6, { width: 64, align: "right", lineBreak: false });
      y += height;
    }
  }
}

function drawRecommendation(doc: PDFKit.PDFDocument, quote: QuoteDocument, plan: RatedPlanQuote, productName: string): void {
  doc.addPage({ size: "LETTER", margin: 0 });
  doc.rect(0, 0, 612, 792).fill(PAPER);
  header(doc, quote, productName);
  doc.font("NotoSemi").fontSize(9).fillColor("#2A345E").text("RECOMMENDATION", 48, 78, { characterSpacing: 1.1 });
  doc.font("News").fontSize(28).fillColor(INK).text(`${plan.carrierName}`, 48, 96, { width: 516 });
  doc.text(plan.planName, 48, 132, { width: 516 });
  doc.font("Noto").fontSize(11).fillColor("#2A345E").text(quote.rationale, 48, 176, { width: 500 });
  doc.roundedRect(48, 230, 516, 72, 8).fill(SKY);
  doc.rect(48, 230, 4, 72).fill(GOLD);
  doc.font("Noto").fontSize(8).fillColor(MUTE);
  doc.text("Total monthly cost", 64, 242);
  doc.text("Employer pays", 250, 242);
  doc.text("Employees pay", 400, 242);
  doc.font("News").fontSize(18).fillColor(INK);
  doc.text(formatDollars(plan.monthlyCents), 64, 258);
  doc.text(formatDollars(plan.employerCents), 250, 258);
  doc.text(formatDollars(plan.employeeCents), 400, 258);
  doc.font("News").fontSize(16).fillColor(INK).text("By coverage tier", 48, 324);
  let y = 352;
  doc.font("Noto").fontSize(8).fillColor(MUTE);
  doc.text("Tier", 48, y);
  doc.text("Enrolled", 220, y);
  doc.text("Total", 300, y);
  doc.text("Employer", 390, y);
  doc.text("Employees", 480, y);
  y += 14;
  doc.moveTo(48, y).lineTo(564, y).strokeColor(INK).lineWidth(0.5).stroke();
  for (const tier of plan.tiers) {
    y += 6;
    doc.font("Noto").fontSize(10).fillColor(INK);
    doc.text(tier.tier, 48, y, { lineBreak: false });
    doc.text(String(tier.enrolled), 220, y, { lineBreak: false });
    doc.text(formatDollars(tier.totalCents), 300, y, { lineBreak: false });
    doc.text(formatDollars(tier.employerCents), 390, y, { lineBreak: false });
    doc.text(formatDollars(tier.employeeCents), 480, y, { lineBreak: false });
    y += 16;
    doc.moveTo(48, y).lineTo(564, y).strokeColor(HAIR).stroke();
  }
  doc.font("News").fontSize(16).text("Key benefits", 48, y + 24);
  const benefits: Array<[string, string]> = [
    ["Deductible", moneyOrDash(plan.deductibleCents)],
    ["Out-of-pocket max", moneyOrDash(plan.oopMaxCents)],
    ["Coinsurance", plan.coinsurancePercent != null ? `${plan.coinsurancePercent}%` : "—"],
    ["Primary care", plan.primaryCare ?? "—"],
    ["Specialist", plan.specialist ?? "—"],
    ["Urgent care", plan.urgentCare ?? "—"],
    ["Emergency room", plan.emergencyRoom ?? "—"],
    ["Prescriptions", plan.prescriptions ?? "—"],
  ];
  const by = y + 52;
  benefits.forEach((row, index) => {
    const x = index % 2 === 0 ? 48 : 310;
    const rowY = by + Math.floor(index / 2) * 22;
    doc.font("Noto").fontSize(10).fillColor("#2A345E").text(row[0], x, rowY, { width: 120, lineBreak: false });
    doc.font("NotoSemi").fillColor(INK).text(row[1], x + 130, rowY, { width: 80, lineBreak: false });
  });
  doc.font("Noto").fontSize(9).fillColor(MUTE).text(quote.disclaimer, 48, by + 110, { width: 500 });
}

function drawEmployees(doc: PDFKit.PDFDocument, quote: QuoteDocument, current: RatedPlanQuote | null, productName: string): void {
  const shown = quote.plans.slice(0, 6);
  const employees = shown[0]?.employees ?? [];
  const chunk = 16;
  for (let start = 0; start < Math.max(employees.length, 1); start += chunk) {
    doc.addPage({ size: [792, 612], margin: 0 });
    doc.rect(0, 0, 792, 612).fill(PAPER);
    doc.fillColor(INK).font("NewsRegular").fontSize(12).text(`•  ${productName}`, 36, 28);
    doc.font("Noto").fontSize(9).fillColor(MUTE).text(`${quote.employerName} · Benefits proposal`, 360, 32, { width: 396, align: "right" });
    doc.font("NotoSemi").fontSize(8).fillColor("#2A345E").text("RATES BY EMPLOYEE", 36, 58, { characterSpacing: 1 });
    doc.font("News").fontSize(20).fillColor(INK).text("Monthly rates by employee", 36, 72);
    doc.font("Noto").fontSize(9).fillColor("#2A345E").text(
      "Each covered person is rated by age on the federal default curve. Only the three oldest children under 21 are charged.",
      420,
      70,
      { width: 336, align: "right" },
    );
    const slice = employees.slice(start, start + chunk);
    let y = 120;
    const cols = [36, 120, 210];
    doc.font("Noto").fontSize(7).fillColor(MUTE);
    doc.text("Employee", cols[0], y);
    doc.text("Ages covered", cols[1], y);
    doc.text("Covers", cols[2], y);
    shown.forEach((plan, index) => {
      const x = 320 + index * 74;
      const label = plan.planId === quote.recommendedPlanId ? "Recommended" : plan.planId === current?.planId ? "Current" : plan.carrierName;
      doc.text(label, x, y - 10, { width: 70, lineBreak: false });
      doc.font("NotoSemi").fillColor(INK).text(plan.planName, x, y + 2, { width: 70, lineBreak: false });
      doc.font("Noto").fillColor(MUTE);
    });
    y += 18;
    doc.moveTo(36, y).lineTo(756, y).strokeColor(INK).lineWidth(0.5).stroke();
    for (const employee of slice) {
      y += 4;
      doc.font("Noto").fontSize(8).fillColor(INK).text(employee.name, cols[0], y + 4, { width: 80, lineBreak: false });
      doc.fillColor("#2A345E").text(employee.ages.join(", "), cols[1], y + 4, { width: 86, lineBreak: false });
      doc.text(employee.covers, cols[2], y + 4, { width: 100, lineBreak: false });
      shown.forEach((plan, index) => {
        const match = plan.employees.find((row) => row.employeeId === employee.employeeId);
        const x = 320 + index * 74;
        if (plan.planId === quote.recommendedPlanId) doc.rect(x - 4, y, 72, 18).fill("#EAF6FF");
        doc.font("Noto").fontSize(8).fillColor(INK).text(formatDollars(match?.monthlyCents ?? 0), x, y + 4, { width: 66, align: "right", lineBreak: false });
      });
      y += 18;
      doc.moveTo(36, y).lineTo(756, y).strokeColor(HAIR).stroke();
    }
  }
}

function header(doc: PDFKit.PDFDocument, quote: QuoteDocument, productName: string): void {
  doc.fillColor(INK).font("NewsRegular").fontSize(12).text(`•  ${productName}`, 48, 36);
  doc.font("Noto").fontSize(9).fillColor(MUTE).text(`${quote.employerName} · Benefits proposal`, 280, 40, { width: 284, align: "right" });
}

function moneyOrDash(cents: number | null): string {
  return cents == null ? "—" : formatDollars(cents);
}

function longDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}
