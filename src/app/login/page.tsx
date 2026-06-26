import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";

const C = { paper: "#F7F3EE", surface: "#FFFFFF", ink: "#000F47", ink2: "#3D3C37", grey: "#7B7974", line: "#E8E2D8", action: "#0B4BFF", sky: "#CEECFF" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await auth()) redirect("/");
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: "/",
      });
    } catch (err) {
      if (err instanceof AuthError) redirect("/login?error=1");
      throw err; // re-throw NEXT_REDIRECT and anything else
    }
  }

  return (
    <main style={{ fontFamily: "'Noto Sans',-apple-system,sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.ink, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 700 }}>M</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: C.ink, margin: "14px 0 4px", letterSpacing: "-.01em" }}>MMA Benefits</h1>
          <p style={{ color: C.grey, fontSize: 13.5, margin: 0 }}>Sign in to view your coverage.</p>
        </div>

        <form action={login} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {error && (
            <div style={{ background: "#FDECEC", color: "#B42318", borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
              Incorrect email or password.
            </div>
          )}
          <label style={{ fontSize: 12, fontWeight: 700, color: C.ink2 }}>
            Email
            <input name="email" type="email" required autoComplete="username" defaultValue="kolaiah@example.com" style={inputStyle} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.ink2 }}>
            Password
            <input name="password" type="password" required autoComplete="current-password" defaultValue="demo1234" style={inputStyle} />
          </label>
          <button type="submit" style={{ marginTop: 4, height: 46, background: C.action, color: "#fff", border: "none", borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Sign in
          </button>
        </form>

        <div style={{ marginTop: 14, padding: "12px 14px", background: C.sky, borderRadius: 12, fontSize: 12, color: C.ink }}>
          <strong>Demo account</strong> — kolaiah@example.com / demo1234 (pre-filled).
        </div>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  height: 44,
  border: "1px solid #E8E2D8",
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 15,
  fontWeight: 400,
  color: "#000F47",
  outline: "none",
  boxSizing: "border-box",
};
