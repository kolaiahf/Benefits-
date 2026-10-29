import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { brandCssVariables, loadBrand } from "../src/brand";
import { readPublicAuth } from "../src/publicConfig";
import { Providers } from "./providers";
import "../web/src/styles.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const brand = loadBrand();
  return {
    title: brand.agencyName,
    description: `${brand.agencyName} quotes small-group medical, dental, and vision.`,
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const brand = loadBrand();
  const auth = readPublicAuth();
  return (
    <html lang="en" style={brandCssVariables(brand) as CSSProperties}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,640&family=Outfit:wght@380;500;640&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers brand={brand} auth={auth}>{children}</Providers>
      </body>
    </html>
  );
}
