"use client";

import type { ReactNode } from "react";
import { AuthProvider, AuthSessionSync } from "../web/src/auth-context";
import { BrandProvider } from "../web/src/brand-context";
import type { Brand } from "../src/brand";
import type { PublicAuth } from "../src/publicConfig";

export function Providers({
  brand,
  auth,
  children,
}: {
  brand: Brand;
  auth: PublicAuth;
  children: ReactNode;
}) {
  return (
    <BrandProvider brand={brand}>
      <AuthProvider auth={auth}>
        <AuthSessionSync>{children}</AuthSessionSync>
      </AuthProvider>
    </BrandProvider>
  );
}
