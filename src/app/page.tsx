import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import { requireUserId } from "@/lib/session";
import { signOut } from "@/auth";

// Temporary authed landing page — proves auth + DB scoping work end-to-end.
// Replaced by the full ported UI in Phase 4.
export default async function Page() {
  const userId = await requireUserId();
  const household = await db.select().from(members).where(eq(members.userId, userId));

  return (
    <main style={{ fontFamily: "Georgia, serif", maxWidth: 480, margin: "0 auto", padding: 24, color: "#000F47" }}>
      <h1 style={{ letterSpacing: "-.02em" }}>MMA Benefits</h1>
      <p style={{ color: "#3D3C37" }}>Signed in. Your household, scoped to your account:</p>
      <ul>
        {household.map((m) => (
          <li key={m.id}>
            <strong>{m.name}</strong> — {m.rel} ({m.memberId})
          </li>
        ))}
      </ul>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" style={{ marginTop: 12, padding: "8px 16px", borderRadius: 10, border: "1px solid #E8E2D8", background: "#fff", cursor: "pointer" }}>
          Sign out
        </button>
      </form>
      <p style={{ fontSize: 13, color: "#7B7974" }}>Full UI lands in Phase 4 · {household.length} members.</p>
    </main>
  );
}
