import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Returns the authenticated user's id, or redirects to /login. Use in
 *  server components and route handlers to gate access to PHI. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) redirect("/login");
  return uid;
}

/** Non-redirecting variant for API routes that should return 401. */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
