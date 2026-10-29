"use client";

import { createContext, useContext, type ReactNode } from "react";
import { loadBrand, type Brand } from "../../src/brand";

const BrandContext = createContext<Brand | null>(null);

export function BrandProvider({ brand, children }: { brand?: Brand; children: ReactNode }) {
  const value = brand ?? loadBrand();
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext) ?? loadBrand();
}
