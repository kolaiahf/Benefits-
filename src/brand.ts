import { readEnv, type Env } from "./env.js";

/**
 * The only place product name, agency name, logo, and colors are defined.
 * Override any of them with environment variables. Do not hardcode them in the UI.
 * The defaults are a neutral placeholder.
 */
export interface BrandColors {
  ink: string;
  muted: string;
  paper: string;
  panel: string;
  line: string;
  accent: string;
  accentInk: string;
  kicker: string;
  kickerWash: string;
  danger: string;
  rail: string;
  railInk: string;
  railMuted: string;
  mark: string;
}

export interface Brand {
  productName: string;
  agencyName: string;
  mark: string;
  logoUrl: string;
  serviceName: string;
  colors: BrandColors;
}

const defaults: Brand = {
  productName: "Harbor",
  agencyName: "Harbor Agency",
  mark: "H",
  logoUrl: "",
  serviceName: "harbor",
  colors: {
    ink: "#1b1712",
    muted: "#6e655b",
    paper: "#f3eee6",
    panel: "#fffdf9",
    line: "#e3dacd",
    accent: "#1d6a49",
    accentInk: "#123c2b",
    kicker: "#8a5a12",
    kickerWash: "#f8efd8",
    danger: "#8d2e2e",
    rail: "#241c14",
    railInk: "#f6f1e8",
    railMuted: "#cbbba6",
    mark: "#e7c27a",
  },
};

const colorEnv: Array<{ env: string; key: keyof BrandColors }> = [
  { env: "BRAND_COLOR_INK", key: "ink" },
  { env: "BRAND_COLOR_MUTED", key: "muted" },
  { env: "BRAND_COLOR_PAPER", key: "paper" },
  { env: "BRAND_COLOR_PANEL", key: "panel" },
  { env: "BRAND_COLOR_LINE", key: "line" },
  { env: "BRAND_COLOR_ACCENT", key: "accent" },
  { env: "BRAND_COLOR_ACCENT_INK", key: "accentInk" },
  { env: "BRAND_COLOR_KICKER", key: "kicker" },
  { env: "BRAND_COLOR_KICKER_WASH", key: "kickerWash" },
  { env: "BRAND_COLOR_DANGER", key: "danger" },
  { env: "BRAND_COLOR_RAIL", key: "rail" },
  { env: "BRAND_COLOR_RAIL_INK", key: "railInk" },
  { env: "BRAND_COLOR_RAIL_MUTED", key: "railMuted" },
  { env: "BRAND_COLOR_MARK", key: "mark" },
];

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function loadBrand(env: Env = process.env): Brand {
  const productName = plain(readEnv(env, "BRAND_PRODUCT_NAME"), 40) || defaults.productName;
  const explicitAgency = plain(readEnv(env, "BRAND_AGENCY_NAME"), 80);
  const agencyName = explicitAgency || (readEnv(env, "BRAND_PRODUCT_NAME") ? `${productName} Agency` : defaults.agencyName);
  const mark = plain(readEnv(env, "BRAND_MARK"), 3) || productName.slice(0, 1) || defaults.mark;
  const colors = { ...defaults.colors };
  for (const entry of colorEnv) {
    const value = readEnv(env, entry.env);
    if (HEX.test(value)) colors[entry.key] = value;
  }
  return {
    productName,
    agencyName,
    mark,
    logoUrl: safeLogo(readEnv(env, "BRAND_LOGO_URL")),
    serviceName: slug(productName),
    colors,
  };
}

export function brandCssVariables(brand: Brand): Record<`--${string}`, string> {
  return {
    "--ink": brand.colors.ink,
    "--muted": brand.colors.muted,
    "--paper": brand.colors.paper,
    "--panel": brand.colors.panel,
    "--line": brand.colors.line,
    "--accent": brand.colors.accent,
    "--accent-ink": brand.colors.accentInk,
    "--kicker": brand.colors.kicker,
    "--kicker-wash": brand.colors.kickerWash,
    "--danger": brand.colors.danger,
    "--rail": brand.colors.rail,
    "--rail-ink": brand.colors.railInk,
    "--rail-muted": brand.colors.railMuted,
    "--mark": brand.colors.mark,
  };
}

function plain(value: string, max: number): string {
  return value.replace(/[<>&"']/g, "").trim().slice(0, max);
}

function slug(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "agency";
}

function safeLogo(value: string): string {
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    return "";
  }
  return "";
}
