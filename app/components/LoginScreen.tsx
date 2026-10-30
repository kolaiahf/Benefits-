"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AccountForm } from "../../web/src/AccountForm";

export function LoginScreen({ initialMode }: { initialMode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const error = params.get("error");
  return (
    <AccountForm
      initialMode={initialMode}
      notice={error ?? ""}
      onSignedIn={() => {
        const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/groups";
        router.push(dest);
        router.refresh();
      }}
    />
  );
}
