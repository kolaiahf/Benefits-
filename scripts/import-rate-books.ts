import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MedicalPlan } from "../src/domain/types.js";
import { buildCatalog } from "../src/rates/books/buildCatalog.js";
import { reconstructKaiserHtml } from "../src/rates/books/parseKaiser.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const uploadDir = process.env.RATE_BOOK_DIR || "/home/ubuntu/.cursor/projects/workspace/uploads";

function file(name: string): string | undefined {
  const path = join(uploadDir, name);
  return existsSync(path) ? path : undefined;
}

function pdfText(path: string): string {
  return execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function kaiserTexts(path: string): string[] {
  const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
  const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? "0");
  const texts: string[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const html = execFileSync("pdftotext", ["-bbox-layout", "-f", String(page), "-l", String(page), path, "-"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    texts.push(reconstructKaiserHtml(html));
  }
  return texts;
}

const q4Path = join(root, "src/data/blueshield-ca-2026q4.json");
const q4 = JSON.parse(readFileSync(q4Path, "utf8")) as {
  document: string;
  effective_start: string;
  effective_end: string;
  plans: MedicalPlan[];
};

const healthNet = file("hn_c463.txt");
const sharp = file("sharp_0947.pdf");
const sutter = file("sutter_1292.pdf");
const kaiser = file("kp_878b.pdf");
const blueShield = file("bsc_af48.pdf");

const catalog = buildCatalog({
  healthNetText: healthNet ? readFileSync(healthNet, "utf8") : undefined,
  sharpText: sharp ? pdfText(sharp) : undefined,
  sutterText: sutter ? pdfText(sutter) : undefined,
  kaiserTexts: kaiser ? kaiserTexts(kaiser) : undefined,
  blueShieldQ3Text: blueShield ? pdfText(blueShield) : undefined,
  blueShieldQ4: q4,
  generatedAt: "2026-10-30T00:00:00.000Z",
});

const out = join(root, "src/data/ca-small-group-catalog.json");
writeFileSync(out, `${JSON.stringify(catalog)}\n`);
const carriers = [...new Set(catalog.plans.map((plan) => plan.carrierName))];
console.log(`Wrote ${catalog.plans.length} plans for ${carriers.join(", ")} to ${out}`);
for (const note of catalog.notes) console.log(`- ${note}`);
