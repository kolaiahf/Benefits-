import { sha256 } from "../crypto.js";
import type { AppConfig } from "../config.js";
import type { Store, UserRow } from "../db/store.js";

export class AuthProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthProviderError";
  }
}

export interface SupabaseIdentity {
  id: string;
  email: string;
  name: string;
}

const identityCache = new Map<string, { expires: number; identity: SupabaseIdentity }>();

export function clearSupabaseAuthCache(): void {
  identityCache.clear();
}

export function isJwt(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

export async function userFromSupabaseAccessToken(config: AppConfig, store: Store, token: string): Promise<UserRow | null> {
  const identity = await fetchSupabaseIdentity(config, token);
  if (!identity) return null;
  return store.ensureExternalUser({
    id: identity.id,
    email: identity.email,
    name: identity.name,
    createdAt: new Date().toISOString(),
  });
}

async function fetchSupabaseIdentity(config: AppConfig, token: string): Promise<SupabaseIdentity | null> {
  if (!config.supabase.url || !config.supabase.anonKey || !isJwt(token)) return null;
  const cacheKey = sha256(token);
  const cached = identityCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.identity;
  const endpoint = `${config.supabase.url.replace(/\/$/, "")}/auth/v1/user`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        authorization: `Bearer ${token}`,
        apikey: config.supabase.anonKey,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new AuthProviderError("Account provider is unavailable");
  }
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new AuthProviderError("Account provider could not verify the session");
  const body = await response.json() as { id?: unknown; email?: unknown; user_metadata?: unknown };
  if (typeof body.id !== "string" || typeof body.email !== "string" || !body.email.includes("@")) return null;
  const identity = {
    id: body.id,
    email: body.email.toLowerCase(),
    name: displayName(body.user_metadata, body.email.toLowerCase()),
  };
  identityCache.set(cacheKey, { expires: Date.now() + 60_000, identity });
  return identity;
}

function displayName(metadata: unknown, email: string): string {
  if (metadata && typeof metadata === "object") {
    const record = metadata as Record<string, unknown>;
    const name = record.name ?? record.full_name;
    if (typeof name === "string" && name.trim()) return name.trim().slice(0, 80);
  }
  return email.slice(0, 80);
}
