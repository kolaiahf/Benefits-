import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadBrand } from "../../src/brand";
import { readPublicAuth } from "../../src/publicConfig";
import { App } from "./App";
import { AuthProvider, AuthSessionSync } from "./auth-context";
import { BrandProvider } from "./brand-context";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
  <StrictMode>
    <BrandProvider brand={loadBrand()}>
      <AuthProvider auth={readPublicAuth()}>
        <AuthSessionSync>
          <App />
        </AuthSessionSync>
      </AuthProvider>
    </BrandProvider>
  </StrictMode>,
);