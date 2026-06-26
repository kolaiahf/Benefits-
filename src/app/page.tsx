import { db } from "@/db";
import { members } from "@/db/schema";

// Temporary landing page — proves the DB-backed data layer works end-to-end.
// Replaced by the full ported UI in Phase 4.
export default async function Page() {
  const household = await db.select().from(members);
  return (
    <main style={{ fontFamily: "Georgia, serif", maxWidth: 480, margin: "0 auto", padding: 24, color: "#000F47" }}>
      <h1 style={{ letterSpacing: "-.02em" }}>MMA Benefits</h1>
      <p style={{ color: "#3D3C37" }}>
        Backend is live. Household members loaded from the database:
      </p>
      <ul>
        {household.map((m) => (
          <li key={m.id}>
            <strong>{m.name}</strong> — {m.rel} ({m.memberId})
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 13, color: "#7B7974" }}>
        Demo login coming in Phase 3 · {household.length} members seeded.
      </p>
    </main>
  );
}
