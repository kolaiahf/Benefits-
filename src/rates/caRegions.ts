/**
 * California small-group rating regions from the Blue Shield Q4 2026 rate book
 * county groupings (the same 19 regions used for Covered California / state rating).
 * Los Angeles is split: region 15 is the book's published ZIP list; the rest of
 * Los Angeles County is region 16.
 */
export const CA_COUNTY_REGION: Record<string, string> = {
  "Alpine County": "1",
  "Del Norte County": "1",
  "Siskiyou County": "1",
  "Modoc County": "1",
  "Lassen County": "1",
  "Shasta County": "1",
  "Trinity County": "1",
  "Humboldt County": "1",
  "Tehama County": "1",
  "Plumas County": "1",
  "Nevada County": "1",
  "Sierra County": "1",
  "Mendocino County": "1",
  "Lake County": "1",
  "Butte County": "1",
  "Glenn County": "1",
  "Sutter County": "1",
  "Yuba County": "1",
  "Colusa County": "1",
  "Amador County": "1",
  "Calaveras County": "1",
  "Tuolumne County": "1",
  "Napa County": "2",
  "Sonoma County": "2",
  "Solano County": "2",
  "Marin County": "2",
  "Sacramento County": "3",
  "Placer County": "3",
  "El Dorado County": "3",
  "Yolo County": "3",
  "San Francisco County": "4",
  "Contra Costa County": "5",
  "Alameda County": "6",
  "Santa Clara County": "7",
  "San Mateo County": "8",
  "Santa Cruz County": "9",
  "Monterey County": "9",
  "San Benito County": "9",
  "San Joaquin County": "10",
  "Stanislaus County": "10",
  "Merced County": "10",
  "Mariposa County": "10",
  "Tulare County": "10",
  "Madera County": "11",
  "Fresno County": "11",
  "Kings County": "11",
  "San Luis Obispo County": "12",
  "Santa Barbara County": "12",
  "Ventura County": "12",
  "Mono County": "13",
  "Inyo County": "13",
  "Imperial County": "13",
  "Kern County": "14",
  "Los Angeles County": "16",
  "San Bernardino County": "17",
  "Riverside County": "17",
  "Orange County": "18",
  "San Diego County": "19",
};

export function parseZipTokens(text: string): string[] {
  const zips: string[] = [];
  for (const token of text.split(/[^0-9-]+/)) {
    const range = /^(\d{5})-(\d{5})$/.exec(token);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end >= start && end - start < 40) {
        for (let value = start; value <= end; value += 1) zips.push(String(value).padStart(5, "0"));
      }
      continue;
    }
    if (/^\d{5}$/.test(token)) zips.push(token);
  }
  return zips;
}

export function region15ZipsFromRateBook(text: string): Set<string> {
  const start = text.indexOf("Los Angeles Region 15 ZIP codes:");
  if (start < 0) throw new Error("Region 15 ZIP footnote was not found in the rate book");
  const slice = text.slice(start, start + 2500);
  const end = slice.search(/\n\s*\n/);
  return new Set(parseZipTokens(end > 0 ? slice.slice(0, end) : slice));
}

export function regionMapFromCensus(zctaText: string, region15: ReadonlySet<string>): Record<string, string> {
  const lines = zctaText.replace(/^\uFEFF/, "").trim().split(/\n/).slice(1);
  const best = new Map<string, { area: number; county: string }>();
  for (const line of lines) {
    const columns = line.split("|");
    const zip = columns[1];
    const countyGeoid = columns[9] ?? "";
    const county = columns[10] ?? "";
    const area = Number(columns[16] ?? 0);
    if (!zip || !countyGeoid.startsWith("06")) continue;
    const current = best.get(zip);
    if (!current || area > current.area) best.set(zip, { area, county });
  }
  const map: Record<string, string> = {};
  for (const [zip, value] of best) {
    const region = ratingRegionForZip({ zip, county: value.county, region15 });
    if (region) map[zip] = region;
  }
  return map;
}

export function ratingRegionForZip(input: {
  zip: string;
  county: string | null;
  region15: ReadonlySet<string>;
}): string | null {
  if (input.region15.has(input.zip)) return "15";
  if (!input.county) return null;
  return CA_COUNTY_REGION[input.county] ?? null;
}
