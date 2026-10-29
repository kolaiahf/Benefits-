import { Suspense } from "react";
import { LoginScreen } from "../components/LoginScreen";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="main">Loading…</main>}>
      <LoginScreen initialMode="sign-in" />
    </Suspense>
  );
}
