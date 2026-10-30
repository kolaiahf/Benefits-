import regionByZip from "../data/ca-rating-regions.json";

const regions = regionByZip as Record<string, string>;

/** Employer ZIP → one of 19 California small-group rating areas. Los Angeles splits: area 15 vs 16. */
export function ratingAreaForZip(zip: string): string | null {
  return regions[zip] ?? null;
}

export function knownRatingZips(): number {
  return Object.keys(regions).length;
}
