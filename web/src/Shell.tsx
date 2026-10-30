"use client";

import type { ReactNode } from "react";
import type { User } from "./api";
import { useBrand } from "./brand-context";

export function Shell({ user, onSignOut, children }: { user: User; onSignOut: () => void; children: ReactNode }) {
  const brand = useBrand();
  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand">
          {brand.logoUrl ? <img className="logo" src={brand.logoUrl} alt="" /> : <div className="mark">{brand.mark}</div>}
          <div>
            <strong>{brand.productName}</strong>
            <span>{brand.agencyName}</span>
          </div>
        </div>
        <nav>
          <a href="/groups">Groups</a>
          <a href="/docs">API docs</a>
        </nav>
        <div className="quiet">
          <div>{user.name}</div>
          <div>{user.email}</div>
          <button className="linkish" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function LoadingScreen() {
  const brand = useBrand();
  return <main className="main">Loading {brand.productName}…</main>;
}
