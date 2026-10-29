import { Suspense } from "react";
import { LoginScreen } from "../components/LoginScreen";

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="main">Loading…</main>}>
      <LoginScreen initialMode="sign-up" />
    </Suspense>
  );
}
